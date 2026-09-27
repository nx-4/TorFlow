import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import { registerRoutes } from '../src/routes/index.js';
import { TorrentEngine } from '../src/engine/torrent-engine.js';
import { StreamResolver } from '../src/resolver/stream-resolver.js';

describe('API Schema & TV Program Route Integration', () => {
  it('accepts type=tv_program with date, network, country, and part without Fastify schema validation error', async () => {
    const app = Fastify();
    await app.register(sensible);
    const engine = new TorrentEngine();
    let receivedQuery: any = null;
    const mockResolver = {
      findStream: async (q: any) => {
        receivedQuery = q;
        return {
          sourceType: 'torrent',
          subtitles: [],
          candidate: {} as any,
          infoHash: 'test',
          streamId: 's1',
          streamUrl: '/stream',
          fileIndex: 0,
          files: [],
          quality: {} as any,
          audioTracks: [],
          subtitleTracks: [],
          attempted: 1
        };
      }
    } as unknown as StreamResolver;

    await registerRoutes(app, engine, mockResolver);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/resolver/find-stream',
      payload: {
        type: 'tv_program',
        title: 'The Voice Kids',
        season: 1,
        episode: 3,
        date: '2023-05-10',
        network: 'ITV',
        country: 'UK',
        part: 3
      }
    });

    expect(response.statusCode).toBe(200);
    expect(receivedQuery.type).toBe('tv_program');
    expect(receivedQuery.network).toBe('ITV');
    expect(receivedQuery.country).toBe('UK');
    expect(receivedQuery.part).toBe(3);
    expect(receivedQuery.date).toBe('2023-05-10');

    await app.close();
    await engine.destroy();
  });
});
