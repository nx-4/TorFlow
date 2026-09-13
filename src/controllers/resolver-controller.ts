import { FastifyReply, FastifyRequest } from 'fastify';
import { StreamResolver } from '../resolver/stream-resolver.js';
import { ResolverQuery } from '../resolver/types.js';

export function resolverController(resolver?: StreamResolver) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!resolver) return reply.code(503).send({ error: 'Indexer is not configured. Set INDEXER_URL and INDEXER_API_KEY.' });
    const query = request.body as ResolverQuery;
    try {
      const result = await resolver.findStream(query);
      return reply.send({ data: result });
    } catch (error) { return reply.code(404).send({ error: (error as Error).message }); }
  };
}
