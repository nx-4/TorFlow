import { FastifyReply, FastifyRequest } from 'fastify';
import { TorrentEngine } from '../engine/torrent-engine.js';
import { StreamHandle } from '../types.js';

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
    let handle: StreamHandle | undefined;
    let stream: (NodeJS.ReadableStream & { destroy?: (err?: Error) => void }) | undefined;
    let cleanedUp = false;

    const cleanup = async () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (stream && typeof stream.destroy === 'function') {
        try { stream.destroy(); } catch {}
      }
      if (handle) {
        try { await handle.destroy(); } catch {}
      }
    };

    try {
      const fileIndex = Number(params.fileIndex);
      if (Number.isNaN(fileIndex)) {
        return reply.code(400).send({ error: 'Invalid file index' });
      }

      handle = await engine.openStream(params.infoHash, fileIndex);
      const range = parseRange(request.headers.range, handle.size);
      const start = range?.start ?? 0;
      const end = range?.end ?? handle.size - 1;

      reply.header('Accept-Ranges', 'bytes')
           .header('Content-Type', handle.file.mimeType)
           .header('Content-Length', end - start + 1)
           .header('Cache-Control', 'no-store');

      if (range) {
        reply.header('Content-Range', `bytes ${start}-${end}/${handle.size}`);
        reply.code(206);
      } else {
        reply.code(200);
      }

      stream = handle.createReadStream(range) as NodeJS.ReadableStream & { destroy?: (err?: Error) => void };

      // Bind cleanup to connection closure, stream completion, or errors
      request.raw.on('close', cleanup);
      request.raw.on('error', cleanup);
      stream.on('end', cleanup);
      stream.on('close', cleanup);
      stream.on('error', cleanup);

      return reply.send(stream);
    } catch (error) {
      await cleanup();
      const message = (error as Error).message;
      if (message.includes('Range') || message.includes('range')) {
        const manifest = engine.getManifest(params.infoHash);
        const file = manifest?.files[Number(params.fileIndex)];
        if (file) {
          reply.header('Content-Range', `bytes */${file.size}`);
        }
        return reply.code(416).send({ error: message });
      }
      return reply.code(404).send({ error: message });
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
