# Base44 dev environment notes

## Stack
- Vite 6 + React 18 frontend (single-page app, no local backend).
- Uses `@base44/sdk` + `@base44/vite-plugin`. The SDK client (`src/api/base44Client.js`) talks to a **remote Base44 backend** — there is no in-repo server.

## How it runs here
- `docker-compose.base44.yml` runs `node:22`, bind-mounts the repo, runs `npm install` then `npx vite --host 0.0.0.0 --port 5173` (host port 3000 → 5173).
- `vite.config.js` sets `server.host: true` and `server.allowedHosts: true` so the preview's external hostname is accepted.
- Polling file watch is enabled (`CHOKIDAR_USEPOLLING` + plugin's own `usePolling`) for bind-mount HMR.

## Credentials required (external service)
The app cannot function without real Base44 backend credentials. Both are read by `src/lib/app-params.js`:
- `VITE_BASE44_APP_ID` — the Base44 app id (sent as `X-App-Id`, used in API paths).
- `VITE_BASE44_BACKEND_URL` — becomes the SDK `serverUrl`; axios baseURL is `${serverUrl}/api`. If unset, `serverUrl` is `null` and all API calls break. The app must point at a real Base44 backend.

These are delivered via `/run/base44/app.env` (last `env_file` entry in compose). Repo-level `.env.base44-defaults` holds placeholders so the dev server boots before credentials exist; real secrets override them.

Note: the `@base44/vite-plugin` separately checks `VITE_BASE44_APP_BASE_URL` to enable a `/api` dev proxy, but this app passes `serverUrl` through directly, so the proxy is not required as long as `VITE_BASE44_BACKEND_URL` is an absolute backend URL and that backend permits the client origin (CORS).

## Verify it works
- `curl -sf -H "Host: external-preview.example.com" http://localhost:3000/` returns the HTML shell; `/src/main.jsx` and `/@vite/client` return 200 (no host blocking).
- Without real credentials the page mounts but backend calls (auth/public-settings) fail → login/error screen. With valid credentials the app loads authenticated.
