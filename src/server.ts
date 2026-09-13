import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { loadConfig } from './config.js';
import { CacheManager } from './engine/cache-manager.js';
import { TorrentEngine } from './engine/torrent-engine.js';
import { registerRoutes } from './routes/index.js';

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
  await registerRoutes(app, engine);
  app.decorate('streamix', { engine, cache, config });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const app = await buildApp();
  await app.listen({ host: config.host, port: config.port });
}
