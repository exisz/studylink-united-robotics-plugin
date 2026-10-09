import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const expectedManifest = {
  schemaVersion: 1,
  id: "education",
  name: "Education",
  publisher: "United Robotics",
};

test("dist contains exactly the World V1 artifacts plus agent.json", async () => {
  assert.deepEqual((await readdir("dist")).sort(), ["agent.json", "manifest.json", "plugin.js", "rpc.mjs"]);
  assert.deepEqual(JSON.parse(await readFile("dist/manifest.json", "utf8")), expectedManifest);
});

test("frontend is self-contained ESM and exports mount", async () => {
  const source = await readFile("dist/plugin.js", "utf8");
  assert.match(source, /export\{[^}]*mount/);
  assert.match(source, /ur-student-library/);
  assert.match(source, /education\.students\.read/);
  assert.doesNotMatch(source, /from\s*["'](?:react|react-dom|\.\/)/);
  assert.doesNotMatch(source, /sourceMappingURL/);
});

test("CSS is rooted in the Education namespace", async () => {
  const css = await readFile("src/plugin.css", "utf8");
  const classes = [...css.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((match) => match[1]);
  assert.ok(classes.length > 0);
  assert.ok(classes.every((name) => name.startsWith("ur-education")));
  assert.doesNotMatch(css, /(^|[},])\s*(?:html|body|:root|\.grid|\.state|\.progress)(?:\s|[,{.:#]|\[)/m);
});
