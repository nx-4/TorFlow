import 'dotenv/config';
import path from 'node:path';

export interface AppConfig {
  host: string;
  port: number;
  nodeEnv: string;
  cacheDir: string;
  cacheMaxBytes: number;
  cacheTtlSeconds: number;
  maxConcurrentTorrents: number;
  allowedOrigins: string[];
  indexerUrl?: string;
  indexerApiKey?: string;
  resolverTimeoutMs: number;
}

export function loadConfig(env = process.env): AppConfig {
  const origins = env.ALLOWED_ORIGINS ?? env.CORS_ORIGIN ?? '*';
  return {
    host: env.HOST ?? '0.0.0.0', port: Number(env.PORT ?? 8080), nodeEnv: env.NODE_ENV ?? 'development',
    cacheDir: path.resolve(env.CACHE_DIR ?? '.cache'), cacheMaxBytes: Number(env.CACHE_MAX_BYTES ?? 2_147_483_648), cacheTtlSeconds: Number(env.CACHE_TTL_SECONDS ?? 3600), maxConcurrentTorrents: Number(env.MAX_CONCURRENT_TORRENTS ?? 4),
    allowedOrigins: origins.split(',').map((origin) => origin.trim()).filter(Boolean),
    indexerUrl: env.INDEXER_URL, indexerApiKey: env.INDEXER_API_KEY, resolverTimeoutMs: Number(env.RESOLVER_TIMEOUT_MS ?? 5000),
  };
}
