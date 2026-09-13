# Streamix_Hub

Cloud-ready, developer-focused **WebTorrent-to-HTTP streaming engine** built with Node.js, TypeScript, Fastify, WebTorrent, HTTP Range streaming, SSE status events, and disk cache policies.

## Features

- Live swarm integration through `WebTorrent`: magnet links or `.torrent` buffers are added to the client and resolved when metadata arrives.
- Playback-first piece selection: header pieces, then a sequential look-ahead window, then the remaining pieces.
- Standard `206 Partial Content` streaming compatible with Video.js, AVPlayer, ExoPlayer, Flutter, and React Native clients.
- Dynamic `PORT`, `NODE_ENV`, and `ALLOWED_ORIGINS` configuration through dotenv.
- Autonomous public resolver adapters for YTS movies and Torrentio streams; Jackett/Prowlarr is optional.
- Parallel public adapters for Torrentio, 1337x, EZTV, TorrentGalaxy, YTS, and public audio search, with a movie/series embed fallback when IMDb/TMDB identifiers are supplied.
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

## Automated torrent resolver

No indexer server is required. The resolver queries built-in public YTS and Torrentio adapters by default. Optionally set `INDEXER_URL` and `INDEXER_API_KEY` to add Jackett/Prowlarr Torznab results. Streamix clients can go directly from TMDB/IMDb metadata to a playable URL:

```ts
const response = await fetch('https://api.example.com/v1/resolver/find-stream', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'Dune', year: 2021, tmdb_id: '438631' })
});
const { data } = await response.json();
const playableUrl = new URL(data.streamUrl, 'https://api.example.com').toString();
// data.quality, data.audioTracks, data.subtitleTracks are ready for the player UI.
// data.sourceType is "torrent" or "embed".
```

For series, send `season`, `episode`, and optionally `imdb_id`. The resolver filters out torrents below 5 seeders, prefers H.264/x264 and mobile-friendly audio, ranks by seed health plus quality, and retries the next candidate when metadata or peers do not arrive within `RESOLVER_TIMEOUT_MS`.

For music, send `type: "music"` with any combination of generic query, artist, album, and track. Audio requires at least 2 seeders (video remains at 5); if the detailed search is empty or unhealthy, the public adapter retries with a broader query. The audio ranking prefers lossless FLAC/ALAC/WAV, then 320kbps MP3, AAC, and Opus, and chooses the best playable audio file inside the selected torrent:

```ts
const response = await fetch('https://api.example.com/v1/resolver/find-stream', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'music', query: 'Daft Punk Discovery', artist: 'Daft Punk', album: 'Discovery' })
});
const audio = await response.json();
// audio.data.streamUrl is an HTTP Range-compatible .flac/.mp3/.m4a stream.
```

```bash
curl -X POST https://api.example.com/v1/resolver/find-stream \
  -H 'content-type: application/json' \
  -d '{"title":"The Last of Us","season":1,"episode":3,"imdb_id":"tt3581920"}'
```
