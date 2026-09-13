import { FastifyReply, FastifyRequest } from 'fastify';
import { TorrentEngine } from '../engine/torrent-engine.js';

export function metadataController(engine: TorrentEngine) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { magnet?: string } | undefined;
    const torrent = (request as FastifyRequest & { file?: { buffer: Buffer } }).file;
    if (!body?.magnet && !torrent?.buffer) return reply.code(400).send({ error: 'Provide magnet or torrent upload' });
    try {
      const manifest = await engine.inspect(body?.magnet ? { magnet: body.magnet } : { torrentBuffer: torrent!.buffer });
      return reply.send({ data: manifest });
    } catch (error) { return reply.code(422).send({ error: (error as Error).message }); }
  };
}
