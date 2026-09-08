import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const backend = new URL("../dist/rpc.mjs", import.meta.url);

function makeSnapshot(studentCount, overrides = {}) {
  const students = Array.from({ length: studentCount }, (_, index) => ({
    id: `student-${index + 1}`,
    name: `Example Student ${index + 1}`,
    branch: "Example Group - Sydney",
  }));
  return {
    schemaVersion: 2,
    source: "studylink-portal-admin-read-only",
    capturedAt: "2026-09-07T08:02:00.000Z",
    page: { number: 1, shown: students.length, total: 22514 },
    students,
    ...overrides,
  };
}

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

test("education.students.read returns the full bounded student page", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "education-state-"));
  try {
    await writeFile(path.join(directory, "students.json"), JSON.stringify(makeSnapshot(50)));
    const result = await invoke({ version: 1, method: "education.students.read" }, directory);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.equal(result.response.ok, true);
    assert.equal(result.response.result.students.length, 50);
    assert.equal(result.response.result.page.shown, 50);
    assert.equal(result.response.result.page.total, 22514);
    assert.equal(result.response.result.students[0].name, "Example Student 1");
    assert.equal(result.response.result.students[49].name, "Example Student 50");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("oversized, duplicate, and inconsistent pages fail closed", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "education-state-"));
  const file = path.join(directory, "students.json");
  const cases = [
    makeSnapshot(51, { page: { number: 1, shown: 51, total: 22514 } }),
    makeSnapshot(2, { students: [{ id: "dup", name: "A", branch: "B" }, { id: "dup", name: "C", branch: "D" }] }),
    makeSnapshot(3, { page: { number: 1, shown: 5, total: 22514 } }),
    makeSnapshot(3, { page: { number: 1, shown: 3, total: 1 } }),
    makeSnapshot(3, { schemaVersion: 1 }),
  ];
  try {
    for (const invalid of cases) {
      await writeFile(file, JSON.stringify(invalid));
      const result = await invoke({ version: 1, method: "education.students.read" }, directory);
      assert.equal(result.response.ok, false);
      assert.equal(result.response.error.code, "snapshot_invalid");
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("missing, malformed, and symlink snapshots fail closed", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "education-state-"));
  const outside = path.join(tmpdir(), `education-outside-${process.pid}.json`);
  try {
    const missing = await invoke({ version: 1, method: "education.students.read" }, directory);
    assert.equal(missing.response.error.code, "snapshot_missing");
    await writeFile(path.join(directory, "students.json"), "not json");
    const malformed = await invoke({ version: 1, method: "education.students.read" }, directory);
    assert.equal(malformed.response.error.code, "snapshot_invalid");
    await rm(path.join(directory, "students.json"));
    await writeFile(outside, JSON.stringify(makeSnapshot(2)));
    await symlink(outside, path.join(directory, "students.json"));
    const linked = await invoke({ version: 1, method: "education.students.read" }, directory);
    assert.equal(linked.response.error.code, "snapshot_invalid");
  } finally { await rm(directory, { recursive: true, force: true }); await rm(outside, { force: true }); }
});

test("unknown methods and malformed input return bounded protocol errors", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "education-state-"));
  try {
    const unknown = await invoke({ version: 1, method: "system.exec" }, directory);
    assert.equal(unknown.response.error.code, "method_not_found");
    const legacy = await invoke({ version: 1, method: "education.student.read" }, directory);
    assert.equal(legacy.response.error.code, "method_not_found");
    const malformed = await invoke("not-json", directory);
    assert.equal(malformed.response.error.code, "invalid_request");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

function apiSnapshot(n = 50) {
  return makeSnapshot(n, {
    schemaVersion: 3,
    source: "studylink-partner-api-read-only",
    environment: "preprod",
    branch: { id: "branch-example", name: "Example Group - Sydney" },
    page: { number: 1, shown: n, total: null, hasNextPage: true },
  });
}

test("API snapshot preserves provenance, unknown total, and genuine empty results", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "education-api-"));
  try {
    for (const n of [0, 1, 50]) {
      const snapshot = apiSnapshot(n);
      snapshot.page.hasNextPage = n === 50;
      await writeFile(path.join(directory, "students.json"), JSON.stringify(snapshot));
      const { response, stderr, code } = await invoke({ version: 1, method: "education.students.read" }, directory);
      assert.equal(code, 0);
      assert.equal(stderr, "");
      assert.equal(response.ok, true);
      assert.equal(response.result.source, snapshot.source);
      assert.equal(response.result.environment, "preprod");
      assert.deepEqual(response.result.branch, snapshot.branch);
      assert.deepEqual(response.result.page, snapshot.page);
      assert.deepEqual(response.result.students, snapshot.students);
    }
    await writeFile(path.join(directory, "students.json"), JSON.stringify(makeSnapshot(0, { page: { number: 1, shown: 0, total: 0 } })));
    assert.equal((await invoke({ version: 1, method: "education.students.read" }, directory)).response.ok, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("API rejects wrong branch, unknown source, false totals, extra PII, and invalid pagination", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "education-api-invalid-"));
  const mutations = [
    x => { x.environment = "production"; },
    x => { x.source = "unverified"; },
    x => { x.schemaVersion = 2; },
    x => { x.branch.name = "Another branch"; },
    x => { x.students[0].branch = "Another branch"; },
    x => { x.students[0].email = "synthetic@example.test"; },
    x => { x.page.total = 50; },
    x => { x.page.total = 22514; },
    x => { delete x.page.hasNextPage; },
    x => { x.page.hasNextPage = "true"; },
    x => { x.page.number = 2; },
    x => { x.page.shown = 49; },
    x => { x.students.push(x.students[0]); },
    x => { x.students[1].id = x.students[0].id; },
    x => { x.capturedAt = "unknown"; },
  ];
  try {
    for (const mutate of mutations) {
      const snapshot = apiSnapshot(); mutate(snapshot);
      await writeFile(path.join(directory, "students.json"), JSON.stringify(snapshot));
      const { response, stderr } = await invoke({ version: 1, method: "education.students.read" }, directory);
      assert.equal(response.ok, false);
      assert.equal(response.error.code, "snapshot_invalid");
      assert.equal(stderr, "");
      assert.doesNotMatch(JSON.stringify(response), /Example Student|synthetic@example/);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
