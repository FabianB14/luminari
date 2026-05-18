# Luminari

This repository contains the Node services and static frontend needed for the current Render setup:

- `luminari-web`: public static frontend served from `public/`.
- `luminari-api`: public web service with `/` and `/health` endpoints.
- `luminari-worker`: background worker process.
- `luminari-nightly-cleanup`: scheduled cleanup command.
- `luminari-db`: Render PostgreSQL database.
- `luminari-cache`: Render Valkey/Key Value service.

## Render commands

| Render service | Build command | Start command / publish path |
| --- | --- | --- |
| `luminari-web` | `npm run build` | `./public` |
| `luminari-api` | `npm install` | `npm start` |
| `luminari-worker` | `npm install` | `npm run worker` |
| `luminari-nightly-cleanup` | `npm install` | `npm run cleanup` |

The API binds to `0.0.0.0` and reads the `PORT` environment variable Render provides. The static frontend checks the API status at `https://luminari-api.onrender.com/health` by default, and you can edit that URL from the page if your Render API URL is different.
