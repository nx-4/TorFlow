import { FastifyInstance } from 'fastify';
import { metadataController } from '../controllers/metadata-controller.js';
import { statusController, streamController } from '../controllers/stream-controller.js';
import { TorrentEngine } from '../engine/torrent-engine.js';

export async function registerRoutes(app: FastifyInstance, engine: TorrentEngine): Promise<void> {
  app.get('/health', async () => ({ status: 'ok', service: 'streamix-hub' }));
  app.post('/v1/metadata/inspect', { schema: { body: { type: 'object', properties: { magnet: { type: 'string' } } } } }, metadataController(engine));
  app.get('/v1/torrents/:infoHash', async (request, reply) => {
    const data = engine.getManifest((request.params as { infoHash: string }).infoHash);
    return data ? reply.send({ data }) : reply.code(404).send({ error: 'Metadata not found' });
  });
  app.get('/v1/torrents/:infoHash/files/:fileIndex/stream', streamController(engine));
  app.get('/v1/streams/:streamId/status', statusController(engine));
  app.get('/v1/streams/:streamId/events', async (request, reply) => {
    const id = (request.params as { streamId: string }).streamId;
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const listener = (event: unknown) => { if ((event as { streamId?: string }).streamId === id) reply.raw.write(`data: ${JSON.stringify(event)}\n\n`); };
    engine.on('status', listener);
    request.raw.on('close', () => engine.off('status', listener));
  });
}
