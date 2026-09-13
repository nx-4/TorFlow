import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { loadConfig } from './config.js';
import { CacheManager } from './engine/cache-manager.js';
import { TorrentEngine } from './engine/torrent-engine.js';
import { registerRoutes } from './routes/index.js';
import { StreamResolver } from './resolver/stream-resolver.js';
import { TorznabClient } from './resolver/torznab-client.js';
import { MultiIndexerClient, createPublicIndexer } from './resolver/public-clients.js';
import { OpenSubtitlesClient } from './resolver/subtitles.js';

export async function buildApp() {
  const config = loadConfig();
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  await app.register(cors, {
    origin: config.allowedOrigins.includes('*') ? true : config.allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: false,
  });
  await app.register(helmet);
  await app.register(sensible);
  const cache = new CacheManager(config.cacheDir, config.cacheMaxBytes, config.cacheTtlSeconds * 1000);
  await cache.init();
  const engine = new TorrentEngine();
  const publicIndexer = createPublicIndexer(Math.min(config.resolverTimeoutMs, 3000));
  const indexer = config.indexerUrl && config.indexerApiKey ? new MultiIndexerClient([publicIndexer, new TorznabClient(config.indexerUrl, config.indexerApiKey, config.resolverTimeoutMs)]) : publicIndexer;
  const resolver = new StreamResolver(indexer, engine, Math.min(config.resolverTimeoutMs, 8000), new OpenSubtitlesClient(config.openSubtitlesApiKey));
  await registerRoutes(app, engine, resolver);
  app.decorate('streamix', { engine, cache, config });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const app = await buildApp();
  await app.listen({ host: config.host, port: config.port });
}
