# Drestein 2026 — The Sherlock Protocol

The participant and organizer frontend for the Sherlock Protocol competition.

## Stack
React + Vite + TypeScript + TailwindCSS + React Router.

## Run locally

```bash
npm install
npm run dev
```

Then open the printed local URL in your browser.

## Build for production

```bash
npm run build
npm run preview
```

The build output in `dist/` is a static site. Build it with the production API
URL before publishing:

```powershell
$env:VITE_API_URL="https://api.example.com/api"
npm run build
```

Host the contents of `dist/`. Routing uses `HashRouter`, so static hosting does
not need special rewrite rules.

## Runtime requirements

The backend must be running and reachable at `VITE_API_URL`. Participant
accounts and teams are created by an organizer in the admin dashboard; public
registration is disabled. The backend's `FRONTEND_ORIGIN` must exactly match
the deployed frontend origin.
