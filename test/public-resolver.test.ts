import { describe, expect, it, vi } from 'vitest';
import { MultiIndexerClient, YtsClient } from '../src/resolver/public-clients.js';

describe('public resolver adapters', () => {
  it('turns YTS torrent metadata into magnets without an API key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { movies: [{ title: 'Dune', year: 2021, torrents: [{ hash: '0123456789abcdef0123456789abcdef01234567', quality: '1080p', type: 'BluRay', seeds: 42, peers: 3, size_bytes: 1000 }] }] } }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const results = await new YtsClient('https://public.example/api/v2', 100).search({ title: 'Dune', year: 2021 });
    expect(results[0]?.magnet).toContain('urn:btih:0123456789abcdef0123456789abcdef01234567');
    expect(results[0]?.seeders).toBe(42);
    vi.unstubAllGlobals();
  });

  it('continues when one public adapter fails', async () => {
    const working = { search: async () => [{ magnet: 'magnet:?xt=urn:btih:ok', title: 'ok 1080p x264', seeders: 10 }] };
    const failing = { search: async () => { throw new Error('timeout'); } };
    const results = await new MultiIndexerClient([failing, working]).search({ title: 'Dune' });
    expect(results).toHaveLength(1);
  });
});
