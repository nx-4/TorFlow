# Streamix_Hub

Cloud-ready, developer-focused **WebTorrent-to-HTTP streaming engine** built with Node.js, TypeScript, Fastify, WebTorrent, HTTP Range streaming, SSE status events, and disk cache policies.

## Features

- Live swarm integration through `WebTorrent`: magnet links or `.torrent` buffers are added to the client and resolved when metadata arrives.
- Playback-first piece selection: header pieces, then a sequential look-ahead window, then the remaining pieces.
- Standard `206 Partial Content` streaming compatible with Video.js, AVPlayer, ExoPlayer, Flutter, and React Native clients.
- Dynamic `PORT`, `NODE_ENV`, and `ALLOWED_ORIGINS` configuration through dotenv.
- Docker and Render configuration included.

## Repository layout

```text
src/
  controllers/        REST request handlers
  engine/              WebTorrent adapter, metadata, priority, cache
  routes/              Fastify routes
  config.ts            dotenv-backed configuration
  server.ts            application bootstrap
test/                  unit and integration tests
API.md                 endpoint contract
Dockerfile             production container
render.yaml            Render deployment blueprint
```

## Quick start

```bash
cp .env.example .env
npm install
npm run build
npm test
npm start
```

## External Streamix integration

Inspect a magnet and list playable files:

```ts
const response = await fetch('https://api.example.com/v1/metadata/inspect', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ magnet: 'magnet:?xt=urn:btih:<INFO_HASH>&dn=movie' })
});
const { data: manifest } = await response.json();
const media = manifest.files.find((file: any) => file.mimeType.startsWith('video/'));
```

Use the returned `infoHash` and `file.index` as the native player URL:

```ts
const streamUrl = `https://api.example.com/v1/torrents/${manifest.infoHash}/files/${media.index}/stream`;
// Video.js: player.src({ src: streamUrl, type: media.mimeType })
// ExoPlayer/AVPlayer/Flutter: load streamUrl as a normal HTTP media URL.
```

For manual byte reads, send a Range request:

```bash
curl -i -H 'Range: bytes=0-1048575' \
  'https://api.example.com/v1/torrents/<INFO_HASH>/files/0/stream'
```

Monitor buffering from another client using:

```ts
const events = new EventSource(`https://api.example.com/v1/streams/${streamId}/events`);
events.onmessage = ({ data }) => console.log(JSON.parse(data));
```

See [API.md](./API.md) for complete request/response schemas.

## Deployment

```bash
docker build -t streamix-hub .
docker run --rm -p 8080:8080 --env-file .env streamix-hub
```

For Render, connect the repository and use the included `render.yaml`. Set `ALLOWED_ORIGINS` to a comma-separated list of trusted web origins; use `*` only for public development APIs.

> Legal note: use the engine only with content you are authorized to access and distribute.
