# Education World Plugin

World panel and Agent tools for the existing Yes Student Service. The browser panel remains a read-only student directory; agents discover read/create/update/delete operations from `agent.json` and call them through `ur_invoke`. Credentials are supplied by the existing instance Secret Manager as `STUDYLINK_STUDENTS_TOKEN`. Required scopes: `students:read`, `students:write`, `students:delete`, and `registry:read` for the profile schema. Never store credentials or student records in this repository.

Writes preserve the service schema, create idempotency keys and update/delete version checks. The Agent must have user authorization, read current versions, and independently read back writes.

Architecture and acceptance: [World Wiki](https://github.com/exisz/united-robotics-world-wiki/blob/main/dev-plans/decouple-ur-openclaw-plugin-release.md). The separate StudyLink browser extension is outside this repository.

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
