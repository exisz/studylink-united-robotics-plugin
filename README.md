# StudyLink United Robotics Plugin

> **暂缓**。先读 [项目 DNA](studylink-united-robotics-plugin.dna)。浏览器扩展已独立为 [studylink-browser-plugin](https://github.com/exisz/studylink-browser-plugin)，不属于本仓库。

A deliberately small, read-only Capital Education panel. It reads one administrator-confirmed StudyLink applicant page snapshot from the instance-owned frontline state directory and shows that student list. It never contacts StudyLink directly and performs no write, polling, layout, or storage operation in the browser.

## Private state contract

The World plugin runtime supplies `WORLD_PLUGIN_STATE_DIR`. This plugin reads only:

```text
$WORLD_PLUGIN_STATE_DIR/students.json
```

The reader supports the existing Portal snapshot (`schemaVersion: 2`) and single-page preprod Partner API snapshot (`schemaVersion: 3`), with 0–50 students (`id`, `name`, `branch` only). API snapshots carry source, environment, branch, capture time, and next-page presence; the remote total is unknown, never the returned count. Empty pages render an empty state. This is a captured snapshot, not a live query. Missing, malformed, oversized, symlinked, or inconsistent snapshots fail closed. Real student data must never be committed here.

Scope and delivery evidence: [World Wiki](https://github.com/exisz/united-robotics-world-wiki/blob/main/dev-plans/search-capital-studylink-students-and-view-applications.md).

## Artifact contract

`npm run build` creates exactly:

```text
dist/manifest.json
dist/plugin.js
dist/rpc.mjs
```

Pin the manifest through an exact full commit SHA:

```text
https://cdn.jsdelivr.net/gh/exisz/studylink-united-robotics-plugin@<FULL_SHA>/dist/manifest.json
```

## Verify

```bash
npm ci
npm run check
```
