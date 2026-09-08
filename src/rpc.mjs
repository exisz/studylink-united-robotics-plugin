import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

const VERSION = 1;
const METHOD = "education.students.read";
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_SNAPSHOT_BYTES = 256 * 1024;
const MAX_STUDENTS = 50;

class RpcError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) => isRecord(value) && Object.keys(value).sort().join("|") === [...keys].sort().join("|");

function boundedString(value, maximum) {
  if (typeof value !== "string" || value.length > maximum || value.includes("\0") || value.trim().length === 0) {
    throw new RpcError("snapshot_invalid");
  }
  return value.trim();
}

function boundedCount(value, maximum) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new RpcError("snapshot_invalid");
  return value;
}

function validateSnapshot(value) {
  const api = value?.schemaVersion === 3 && value?.source === "studylink-partner-api-read-only";
  const keys = ["schemaVersion", "source", "capturedAt", "page", "students"];
  if (!exactKeys(value, api ? [...keys, "environment", "branch"] : keys) ||
      (!api && (value.schemaVersion !== 2 || value.source !== "studylink-portal-admin-read-only"))) {
    throw new RpcError("snapshot_invalid");
  }
  if (typeof value.capturedAt !== "string" || !Number.isFinite(Date.parse(value.capturedAt))) throw new RpcError("snapshot_invalid");
  if (!exactKeys(value.page, api ? ["number", "shown", "total", "hasNextPage"] : ["number", "shown", "total"])) throw new RpcError("snapshot_invalid");
  if (!Array.isArray(value.students) || value.students.length > MAX_STUDENTS) throw new RpcError("snapshot_invalid");

  let branch;
  if (api) {
    if (value.environment !== "preprod" || !exactKeys(value.branch, ["id", "name"]) ||
        value.page.total !== null || typeof value.page.hasNextPage !== "boolean" || value.page.number !== 1) throw new RpcError("snapshot_invalid");
    branch = { id: boundedString(value.branch.id, 128), name: boundedString(value.branch.name, 256) };
  }
  const page = {
    number: boundedCount(value.page.number, 1_000_000),
    shown: boundedCount(value.page.shown, MAX_STUDENTS),
    total: api ? null : boundedCount(value.page.total, 100_000_000),
    ...(api ? { hasNextPage: value.page.hasNextPage } : {}),
  };
  if (page.number < 1 || page.shown !== value.students.length || (page.total !== null && page.total < page.shown)) throw new RpcError("snapshot_invalid");

  const ids = new Set();
  const students = value.students.map((student) => {
    if (!exactKeys(student, ["id", "name", "branch"])) throw new RpcError("snapshot_invalid");
    const id = boundedString(student.id, 128);
    if (ids.has(id)) throw new RpcError("snapshot_invalid");
    ids.add(id);
    const row = { id, name: boundedString(student.name, 256), branch: boundedString(student.branch, 256) };
    if (api && row.branch !== branch.name) throw new RpcError("snapshot_invalid");
    return row;
  });

  return { status: "ready", source: value.source, ...(api ? { environment: value.environment, branch } : {}), capturedAt: new Date(value.capturedAt).toISOString(), page, students };
}

function stateDirectory() {
  const directory = process.env.WORLD_PLUGIN_STATE_DIR;
  if (typeof directory !== "string" || !path.isAbsolute(directory) || directory.length > 4096) throw new RpcError("snapshot_missing");
  return directory;
}

async function readSnapshot() {
  const file = path.join(stateDirectory(), "students.json");
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
    if (request.params !== undefined && !exactKeys(request.params, [])) throw new RpcError("invalid_request");
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
