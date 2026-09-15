import { FastifyInstance } from 'fastify';
import { metadataController } from '../controllers/metadata-controller.js';
import { resolverController } from '../controllers/resolver-controller.js';
import { statusController, streamController } from '../controllers/stream-controller.js';
import { subtitleController } from '../controllers/subtitle-controller.js';
import { TorrentEngine } from '../engine/torrent-engine.js';
import { StreamResolver } from '../resolver/stream-resolver.js';

export async function registerRoutes(app: FastifyInstance, engine: TorrentEngine, resolver?: StreamResolver): Promise<void> {
  app.get('/health', async () => ({ status: 'ok', service: 'streamix-hub' }));
  app.post('/v1/metadata/inspect', { schema: { body: { type: 'object', properties: { magnet: { type: 'string' } } } } }, metadataController(engine));
  app.post('/v1/resolver/find-stream', { schema: { body: { type: 'object', properties: { type: { type: 'string', enum: ['movie', 'series', 'music'] }, title: { type: 'string' }, query: { type: 'string' }, artist: { type: 'string' }, album: { type: 'string' }, track: { type: 'string' }, year: { type: 'integer' }, season: { type: 'integer' }, episode: { type: 'integer' }, imdb_id: { type: 'string' }, tmdb_id: { type: 'string' }, preferredQuality: { type: 'string', enum: ['2160p', '1080p', '720p', '480p'] }, preferredSubtitleLanguages: { type: 'array', items: { type: 'string' } }, preferredSource: { type: 'string', enum: ['torrent', 'hls', 'auto'] }, hlsUrl: { type: 'string', format: 'uri' } } } } }, resolverController(resolver));
  app.get('/v1/torrents/:infoHash', async (request, reply) => {
    const data = engine.getManifest((request.params as { infoHash: string }).infoHash);
    return data ? reply.send({ data }) : reply.code(404).send({ error: 'Metadata not found' });
  });
  app.get('/v1/torrents/:infoHash/files/:fileIndex/stream', streamController(engine));
  app.get('/v1/subtitles/:infoHash/:fileIndex', subtitleController(engine));
  app.get('/v1/streams/:streamId/status', statusController(engine));
  app.get('/v1/streams/:streamId/events', async (request, reply) => {
    const id = (request.params as { streamId: string }).streamId;
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const listener = (event: unknown) => { if ((event as { streamId?: string }).streamId === id) reply.raw.write(`data: ${JSON.stringify(event)}\n\n`); };
    engine.on('status', listener);
    request.raw.on('close', () => engine.off('status', listener));
  });
}
