# Luminari

This repository contains the minimal Node services needed for the current Render setup:

- `luminari-api`: public web service with `/` and `/health` endpoints.
- `luminari-worker`: background worker process.
- `luminari-nightly-cleanup`: scheduled cleanup command.
- `luminari-db`: Render PostgreSQL database.
- `luminari-cache`: Render Valkey/Key Value service.

## Render commands

| Render service | Build command | Start command |
| --- | --- | --- |
| `luminari-api` | `npm install` | `npm start` |
| `luminari-worker` | `npm install` | `npm run worker` |
| `luminari-nightly-cleanup` | `npm install` | `npm run cleanup` |

The API binds to `0.0.0.0` and reads the `PORT` environment variable Render provides.
