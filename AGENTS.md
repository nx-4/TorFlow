# TorFlow — Base44 Dev Environment

## What this is
A pure backend API (Fastify + TypeScript + WebTorrent). No frontend/UI — the root path `/` returns 404 by design. The preview will show a JSON 404; that is expected. The health endpoint is `/health`.

## Running
- `docker compose -f docker-compose.base44.yml up -d`
- Dev server: `tsx watch src/server.ts` with live reload on edits.
- Listens on port 3000 (mapped from container). HOST=0.0.0.0, ALLOWED_ORIGINS=*.
- `npm install` runs at container startup; `node_modules` persists in the bind-mounted repo dir.

## Environment / secrets
No external credentials are required to boot. Optional external integrations:
- `OPENSUBTITLES_API_KEY` — OpenSubtitles API (subtitles). Optional.
- `INDEXER_URL` + `INDEXER_API_KEY` — Jackett/Prowlarr Torznab indexer. Optional; the resolver works without these using built-in public adapters.
All other config has sensible defaults in `src/config.ts`.

## Key files
- `src/server.ts` — app bootstrap, Fastify plugins, route registration.
- `src/config.ts` — dotenv-backed config with all env var defaults.
- `src/routes/index.ts` — all REST routes including `/health`.
- `scripts/patch-webtorrent.mjs` — postinstall patch for webtorrent infoHash handling.

## Tests
- `npm test` (vitest) — run inside the container: `docker compose -f docker-compose.base44.yml exec app npm test`.
