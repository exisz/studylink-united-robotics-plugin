# Education — United Robotics World plugin

A deliberately small, read-only Capital Education panel. It reads one administrator-confirmed student snapshot from the instance-owned frontline state directory and shows the student plus application plans. It never contacts StudyLink directly and performs no write, polling, layout, or storage operation in the browser.

## Private state contract

The World plugin runtime supplies `WORLD_PLUGIN_STATE_DIR`. This plugin reads only:

```text
$WORLD_PLUGIN_STATE_DIR/student.json
```

The snapshot uses `schemaVersion: 1`, source `studylink-portal-admin-read-only`, one bounded student record, and at most 20 bounded application plans. Missing, malformed, oversized, or symlinked snapshots fail closed. Real student data belongs only in the private instance frontline and must never be committed to this public plugin repository.

## Artifact contract

`npm run build` creates exactly:

```text
dist/manifest.json
dist/plugin.js
dist/rpc.mjs
```

Pin the manifest through an exact full commit SHA:

```text
https://cdn.jsdelivr.net/gh/exisz/united-robotics-plugin-studylink@<FULL_SHA>/dist/manifest.json
```

## Verify

```bash
npm ci
npm run check
```
