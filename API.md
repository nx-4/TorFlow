# Streamix_Hub API

Streamix_Hub is a live WebTorrent-to-HTTP engine. It joins a WebTorrent swarm, resolves metadata, ranks healthy indexer results, prioritizes playback pieces, and streams physical file bytes through HTTP Range.

## Configuration

Copy `.env.example` to `.env`. The resolver is autonomous by default: it queries built-in public YTS and Torrentio adapters without an API key or Jackett deployment. `INDEXER_URL` and `INDEXER_API_KEY` are optional; when both are present, Torznab results are added to the public results. `RESOLVER_TIMEOUT_MS` is capped at 5000 milliseconds. `ALLOWED_ORIGINS` is a comma-separated CORS allowlist.

## Automated resolver

`POST /v1/resolver/find-stream`

```json
{ "title": "Dune", "year": 2021, "tmdb_id": "438631" }
```

TV example:

```json
{ "title": "The Last of Us", "season": 1, "episode": 3, "imdb_id": "tt3581920" }
```

Music example:

```json
{ "type": "music", "query": "Daft Punk Discovery", "artist": "Daft Punk", "album": "Discovery" }
```

For music, the built-in audio adapter searches public torrent JSON results, filters out candidates below 2 seeders, retries with a broader artist/album/track query when the detailed search has no healthy result, and prefers FLAC, ALAC, WAV, 320kbps MP3, AAC, and Opus in that order. The resolver inspects the returned torrent manifest and selects the individual `.mp3`, `.flac`, `.m4a`, `.aac`, `.wav`, `.ogg`, `.opus`, or `.alac` file rather than a cover image or unrelated file.

The service queries the built-in public adapters first, optionally queries Torznab, rejects candidates with fewer than 5 seeders, parses resolution/video/audio codec, and scores candidates using seed health plus player compatibility. It tries candidates in score order; if a public source times out or metadata/peers are unavailable, it falls back automatically.

Successful response:

```json
{
  "data": {
    "sourceType": "torrent",
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

The client prefixes `streamUrl` with the API origin and passes it directly to Video.js, ExoPlayer, AVPlayer, Flutter, or React Native. The stream route supports `Range: bytes=start-end` and returns `206 Partial Content`. If a public swarm cannot return metadata or peers within the timeout, the API returns structured `504` JSON with `code: "SWARM_TIMEOUT"` instead of terminating the process.

Public providers are queried in parallel with a maximum 3-second timeout per provider. For movies and series with an IMDb/TMDB identifier, if no healthy torrent remains or all torrent candidates fail, the response may use `sourceType: "embed"` and return a public embed URL such as `https://vidsrc.to/embed/movie/tt1160419`. Music never uses embed fallback.

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
