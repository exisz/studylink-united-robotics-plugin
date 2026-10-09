import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

const manifest = JSON.parse(await readFile("src/manifest.json", "utf8"));
const expected = {
  schemaVersion: 1,
  id: "education",
  name: "Education",
  publisher: "United Robotics",
};
if (JSON.stringify(manifest) !== JSON.stringify(expected)) {
  throw new Error("manifest fields differ from the World V1 contract");
}

await build({
  entryPoints: ["src/plugin.jsx"],
  outfile: "dist/plugin.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  minify: true,
  legalComments: "none",
  loader: { ".css": "text" },
});
await writeFile("dist/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
await build({ entryPoints: ["src/rpc.mjs"], outfile: "dist/rpc.mjs", bundle: true, platform: "node", format: "esm", target: "node22", sourcemap: false });
await cp("src/agent.json", "dist/agent.json");

if (JSON.stringify((await readdir("dist")).sort()) !== JSON.stringify(["agent.json", "manifest.json", "plugin.js", "rpc.mjs"])) {
  throw new Error("dist must contain exactly four artifacts");
}
