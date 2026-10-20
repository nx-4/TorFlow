# TorFlow on Fly.io

This repository includes a persistent Docker runtime for the WebTorrent engine. Vercel can continue serving the current API deployment; Fly.io is the intended target for long-lived torrent sessions and HTTP Range streaming.

## Prerequisites

Install `flyctl`, authenticate with `fly auth login`, and make sure the Fly organization has permission to use the app name in `fly.toml`. Do not commit API keys to this repository.

## Configure secrets

Set a long random API key and an administrator key that begins with `Admin`:

```bash
fly secrets set \
  TORFLOW_API_KEY='replace-with-a-long-random-secret' \
  TORFLOW_ADMIN_KEY='Admin_replace-with-a-different-long-random-secret' \
  --app torflow
```

Optional integrations can be configured as Fly secrets when they are available:

```bash
fly secrets set \
  INDEXER_URL='https://your-authorized-torznab.example/api' \
  INDEXER_API_KEY='your-indexer-key' \
  OPENSUBTITLES_API_KEY='your-opensubtitles-key' \
  --app torflow
```

Use only indexers and media that you are authorized to access. The application does not infer ownership or licensing from a torrent result.

## Deploy

The Dockerfile builds and validates the native `node-datachannel` and `utp-native` dependencies before copying the production runtime. Deploy from the repository root:

```bash
fly deploy --app torflow --remote-only
```

The `fly.toml` configuration keeps one machine running, disables automatic scale-to-zero, exposes port 8080, and checks `GET /ready` every 15 seconds. The image healthcheck also checks `GET /health`.

## Verify the deployment

```bash
fly status --app torflow
fly checks list --app torflow
fly logs --app torflow
curl -fsS https://torflow.fly.dev/health
curl -fsS https://torflow.fly.dev/ready
```

A deployment is not considered production-ready for streaming until a legal or owned test torrent completes all of these checks:

1. Metadata inspection returns HTTP 200 and a real `infoHash`.
2. The torrent has an available peer or usable webseed.
3. A small `Range: bytes=0-1023` request returns HTTP 206.
4. The response contains a valid `Content-Range` and 1024 payload bytes.
5. The stream remains available across a second request without a process restart.

## Rollback

The Vercel deployment and the `master` branch are not changed by this feature branch. If a Fly deployment fails, inspect logs first and roll back the Fly release without changing the source of the existing production deployment:

```bash
fly releases --app torflow
fly deploy --image <previous-image> --app torflow
```
