import { FastifyReply, FastifyRequest } from 'fastify';
import { TorrentEngine } from '../engine/torrent-engine.js';

function parseRange(value: string | undefined, size: number): { start: number; end: number } | undefined {
  if (!value) return undefined;
  const match = value.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) throw new Error('Invalid Range header');
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2] || 0));
  const end = match[2] ? Number(match[2]) : size - 1;
  if (start < 0 || end < start || start >= size) throw new Error('Range not satisfiable');
  return { start, end: Math.min(end, size - 1) };
}

export function streamController(engine: TorrentEngine) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { infoHash: string; fileIndex: string };
    try {
      const handle = await engine.openStream(params.infoHash, Number(params.fileIndex));
      const range = parseRange(request.headers.range, handle.size);
      const start = range?.start ?? 0;
      const end = range?.end ?? handle.size - 1;
      reply.header('Accept-Ranges', 'bytes').header('Content-Type', handle.file.mimeType).header('Content-Length', end - start + 1).header('Content-Range', `bytes ${start}-${end}/${handle.size}`).header('Cache-Control', 'no-store');
      reply.code(range ? 206 : 200);
      return reply.send(handle.createReadStream(range));
    } catch (error) {
      const message = (error as Error).message;
      return reply.code(message.includes('Range') ? 416 : 404).send({ error: message });
    }
  };
}

export function statusController(engine: TorrentEngine) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as { streamId: string }).streamId;
    const status = engine.getStatus(id);
    return status ? reply.send({ data: status }) : reply.code(404).send({ error: 'Stream not found' });
  };
}
