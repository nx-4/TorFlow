# Streamix_Hub API

Streamix_Hub is a live WebTorrent-to-HTTP engine. It joins a WebTorrent swarm, waits for metadata, exposes the resolved file tree, prioritizes playback pieces, and streams physical file bytes through HTTP Range.

## Configuration

Copy `.env.example` to `.env`. The service reads `PORT`, `NODE_ENV`, and comma-separated `ALLOWED_ORIGINS` with dotenv. `ALLOWED_ORIGINS=*` enables all origins; production deployments should use explicit trusted origins.

## Inspect metadata and join a swarm

`POST /v1/metadata/inspect`

```json
{ "magnet": "magnet:?xt=urn:btih:<INFO_HASH>&dn=movie" }
```

The endpoint adds the magnet to WebTorrent and waits for live peer metadata. A torrent buffer can be passed by the hosting upload middleware as `request.file.buffer`.

```json
{
  "data": {
    "infoHash": "...",
    "name": "Movie",
    "pieceLength": 262144,
    "pieceCount": 120,
    "totalSize": 314572800,
    "files": [{ "index": 0, "path": "Movie/movie.mp4", "name": "movie.mp4", "size": 314572800, "mimeType": "video/mp4", "offset": 0, "selected": false }]
  }
}
```

`GET /v1/torrents/:infoHash` returns the registered manifest.

## Progressive streaming

`GET /v1/torrents/:infoHash/files/:fileIndex/stream`

The route supports `Range: bytes=start-end` and returns `206 Partial Content` with `Accept-Ranges`, `Content-Range`, `Content-Length`, and the detected `Content-Type`. The engine deselects low-priority pieces, then calls WebTorrent `select(piece, piece, 10)` in playback-first order before creating the physical WebTorrent file stream.

## Status and events

`GET /v1/streams/:streamId/status` returns current progress. `GET /v1/streams/:streamId/events` opens an SSE channel. Events use phases `queued`, `resolving`, `buffering`, `streaming`, `complete`, or `error`.

## Deployment

- Docker: `docker build -t streamix-hub . && docker run --rm -p 8080:8080 --env-file .env streamix-hub`
- Render: connect the repository and use the included `render.yaml` blueprint.
- Railway/VPS: run `npm ci --omit=dev && npm run build && npm start`, setting `PORT` and `ALLOWED_ORIGINS` in the service environment.
