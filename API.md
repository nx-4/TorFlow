# Streamix_Hub API

Streamix_Hub is a live WebTorrent-to-HTTP engine. It joins a WebTorrent swarm, resolves metadata, ranks healthy indexer results, prioritizes playback pieces, and streams physical file bytes through HTTP Range.

## Configuration

Copy `.env.example` to `.env`. Set `INDEXER_URL` to a Jackett/Prowlarr Torznab endpoint and `INDEXER_API_KEY` to its key. `RESOLVER_TIMEOUT_MS` defaults to 5000 milliseconds per candidate. `ALLOWED_ORIGINS` is a comma-separated CORS allowlist.

## Automated resolver

`POST /v1/resolver/find-stream`

```json
{ "title": "Dune", "year": 2021, "tmdb_id": "438631" }
```

TV example:

```json
{ "title": "The Last of Us", "season": 1, "episode": 3, "imdb_id": "tt3581920" }
```

The service queries the configured Torznab indexer, rejects candidates with fewer than 5 seeders, parses resolution/video/audio codec, and scores candidates using seed health plus player compatibility. It tries candidates in score order; if metadata or peers are unavailable within the timeout, it falls back automatically.

Successful response:

```json
{
  "data": {
    "streamId": "stream_abc",
    "infoHash": "...",
    "streamUrl": "/v1/torrents/.../files/0/stream",
    "fileIndex": 0,
    "quality": { "resolution": "1080p", "videoCodec": "h264", "audioCodec": "aac", "score": 74.2 },
    "audioTracks": ["movie.aac"],
    "subtitleTracks": ["movie.en.srt"],
    "candidate": { "title": "Dune.2021.1080p.x264.AAC", "seeders": 42, "score": 91.2 },
    "attempted": 1
  }
}
```

The client prefixes `streamUrl` with the API origin and passes it directly to Video.js, ExoPlayer, AVPlayer, Flutter, or React Native. The stream route supports `Range: bytes=start-end` and returns `206 Partial Content`.

## Metadata and streaming

- `POST /v1/metadata/inspect` accepts `{ "magnet": "magnet:?..." }` and joins the swarm directly.
- `GET /v1/torrents/:infoHash` returns a registered manifest.
- `GET /v1/torrents/:infoHash/files/:fileIndex/stream` returns the media stream.
- `GET /v1/streams/:streamId/status` returns progress.
- `GET /v1/streams/:streamId/events` opens an SSE status channel.

## Deployment

- Docker: `docker build -t streamix-hub . && docker run --rm -p 8080:8080 --env-file .env streamix-hub`
- Render: connect the repository and use `render.yaml`.
- Railway/VPS: `npm ci --omit=dev && npm run build && npm start`.
