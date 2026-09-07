import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const backend = new URL("../dist/rpc.mjs", import.meta.url);
const snapshot = {
  schemaVersion: 1,
  source: "studylink-portal-admin-read-only",
  capturedAt: "2026-09-07T08:02:00.000Z",
  student: { id: "student-1", name: "Example Student", branch: "Example Branch" },
  applications: [{ id: "app-1", provider: "Example University", status: "Incomplete", course: "Example Course", updatedAt: "3 Sep 2026" }],
};

function invoke(input, stateDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [backend.pathname], { env: { ...process.env, WORLD_PLUGIN_STATE_DIR: stateDir }, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [], stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stderr: Buffer.concat(stderr).toString("utf8"), response: JSON.parse(Buffer.concat(stdout).toString("utf8")) }));
    child.stdin.end(typeof input === "string" ? input : JSON.stringify(input));
  });
}


test("education.student.read returns the bounded private snapshot", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "education-state-"));
  try {
    await writeFile(path.join(directory, "student.json"), JSON.stringify(snapshot));
    const result = await invoke({ version: 1, method: "education.student.read" }, directory);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.equal(result.response.ok, true);
    assert.equal(result.response.result.student.name, "Example Student");
    assert.equal(result.response.result.applications[0].course, "Example Course");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("missing, malformed, and symlink snapshots fail closed", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "education-state-"));
  const outside = path.join(tmpdir(), `education-outside-${process.pid}.json`);
  try {
    const missing = await invoke({ version: 1, method: "education.student.read" }, directory);
    assert.equal(missing.response.error.code, "snapshot_missing");
    await writeFile(path.join(directory, "student.json"), "not json");
    const malformed = await invoke({ version: 1, method: "education.student.read" }, directory);
    assert.equal(malformed.response.error.code, "snapshot_invalid");
    await rm(path.join(directory, "student.json"));
    await writeFile(outside, JSON.stringify(snapshot));
    await symlink(outside, path.join(directory, "student.json"));
    const linked = await invoke({ version: 1, method: "education.student.read" }, directory);
    assert.equal(linked.response.error.code, "snapshot_invalid");
  } finally { await rm(directory, { recursive: true, force: true }); await rm(outside, { force: true }); }
});

test("unknown methods and malformed input return bounded protocol errors", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "education-state-"));
  try {
    const unknown = await invoke({ version: 1, method: "system.exec" }, directory);
    assert.equal(unknown.response.error.code, "method_not_found");
    const malformed = await invoke("not-json", directory);
    assert.equal(malformed.response.error.code, "invalid_request");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
