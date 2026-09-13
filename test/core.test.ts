import { describe, expect, it } from 'vitest';
import { prioritizePieces } from '../src/engine/piece-prioritizer.js';
import { parseMagnet } from '../src/engine/metadata-resolver.js';
import { TorrentEngine } from '../src/engine/torrent-engine.js';

describe('piece prioritizer', () => {
  it('starts with header and sequential playback pieces', () => {
    expect(prioritizePieces(10, 100, 300, { headerPieces: 2, lookAhead: 3 })).toEqual([0, 1, 3, 4, 5, 2, 6, 7, 8, 9]);
  });
});

describe('metadata', () => {
  it('validates and parses magnet info hash', () => {
    expect(parseMagnet('magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=demo').infoHash).toBe('0123456789abcdef0123456789abcdef01234567');
  });
});

describe('engine', () => {
  it('serves range-readable stream and status', async () => {
    const engine = new TorrentEngine();
    engine.registerParsedManifest({
      infoHash: '0123456789abcdef0123456789abcdef01234567', name: 'demo', pieceLength: 262144,
      pieceCount: 1, totalSize: 100, files: [{ index: 0, path: 'demo.mp4', name: 'demo.mp4', size: 100, mimeType: 'video/mp4', offset: 0, selected: false }],
    });
    const handle = await engine.openStream('0123456789abcdef0123456789abcdef01234567', 0);
    const chunks: Buffer[] = [];
    for await (const chunk of handle.createReadStream({ start: 0, end: 9 }) as AsyncIterable<Buffer>) chunks.push(chunk);
    expect(Buffer.concat(chunks)).toHaveLength(10);
    expect(handle.status().phase).toBe('complete');
  });
});
