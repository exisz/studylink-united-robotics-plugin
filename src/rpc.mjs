import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

const VERSION = 1;
const METHOD = "education.student.read";
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_SNAPSHOT_BYTES = 64 * 1024;
const MAX_APPLICATIONS = 20;

class RpcError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) => isRecord(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|");

function boundedString(value, maximum, required = true) {
  if (typeof value !== "string" || value.length > maximum || value.includes("\0") || (required && value.trim().length === 0)) {
    throw new RpcError("snapshot_invalid");
  }
  return value.trim();
}

function validateSnapshot(value) {
  if (!exactKeys(value, ["schemaVersion", "source", "capturedAt", "student", "applications"]) || value.schemaVersion !== 1 || value.source !== "studylink-portal-admin-read-only") {
    throw new RpcError("snapshot_invalid");
  }
  if (typeof value.capturedAt !== "string" || !Number.isFinite(Date.parse(value.capturedAt))) throw new RpcError("snapshot_invalid");
  if (!exactKeys(value.student, ["id", "name", "branch"])) throw new RpcError("snapshot_invalid");
  const student = {
    id: boundedString(value.student.id, 128),
    name: boundedString(value.student.name, 256),
    branch: boundedString(value.student.branch, 256),
  };
  if (!Array.isArray(value.applications) || value.applications.length > MAX_APPLICATIONS) throw new RpcError("snapshot_invalid");
  const ids = new Set();
  const applications = value.applications.map((application) => {
    if (!exactKeys(application, ["id", "provider", "status", "course", "updatedAt"])) throw new RpcError("snapshot_invalid");
    const id = boundedString(application.id, 128);
    if (ids.has(id)) throw new RpcError("snapshot_invalid");
    ids.add(id);
    return {
      id,
      provider: boundedString(application.provider, 512),
      status: boundedString(application.status, 128),
      course: boundedString(application.course, 1024),
      updatedAt: boundedString(application.updatedAt, 128),
    };
  });
  return { status: "ready", capturedAt: new Date(value.capturedAt).toISOString(), student, applications };
}

function stateDirectory() {
  const directory = process.env.WORLD_PLUGIN_STATE_DIR;
  if (typeof directory !== "string" || !path.isAbsolute(directory) || directory.length > 4096) throw new RpcError("snapshot_missing");
  return directory;
}

async function readSnapshot() {
  const file = path.join(stateDirectory(), "student.json");
  try {
    const details = await lstat(file);
    if (!details.isFile() || details.isSymbolicLink() || details.size > MAX_SNAPSHOT_BYTES) throw new RpcError("snapshot_invalid");
    return validateSnapshot(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if (error instanceof RpcError) throw error;
    if (error?.code === "ENOENT") throw new RpcError("snapshot_missing");
    if (error instanceof SyntaxError) throw new RpcError("snapshot_invalid");
    throw new RpcError("snapshot_unavailable");
  }
}

async function readRequest() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_REQUEST_BYTES) throw new RpcError("invalid_request");
    chunks.push(chunk);
  }
  try {
    const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!isRecord(request) || request.version !== VERSION || typeof request.method !== "string" || !Object.keys(request).every((key) => ["version", "method", "params"].includes(key))) throw new RpcError("invalid_request");
    if (request.method !== METHOD) throw new RpcError("method_not_found");
    if (request.params !== undefined && (!exactKeys(request.params, []))) throw new RpcError("invalid_request");
    return request;
  } catch (error) {
    if (error instanceof RpcError) throw error;
    throw new RpcError("invalid_request");
  }
}

try {
  await readRequest();
  const result = await readSnapshot();
  process.stdout.write(`${JSON.stringify({ version: VERSION, ok: true, result })}\n`);
} catch (error) {
  const code = error instanceof RpcError ? error.code : "snapshot_unavailable";
  process.stdout.write(`${JSON.stringify({ version: VERSION, ok: false, error: { code } })}\n`);
  process.exitCode = 1;
}
