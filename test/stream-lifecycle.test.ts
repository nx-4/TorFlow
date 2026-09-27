import { describe, expect, it } from 'vitest';
import { TorrentEngine } from '../src/engine/torrent-engine.js';
import { buildApp } from '../src/server.js';

describe('Stream Lifecycle & Resource Cleanup', () => {
  it('cleans up stream status and handles when destroyed', async () => {
    const engine = new TorrentEngine();
    const hash = '0123456789abcdef0123456789abcdef01234567';
    engine.registerParsedManifest({
      infoHash: hash,
      name: 'test-stream',
      pieceLength: 262144,
      pieceCount: 2,
      totalSize: 200,
      files: [{ index: 0, path: 'test.mp4', name: 'test.mp4', size: 200, mimeType: 'video/mp4', offset: 0, selected: false }]
    });

    expect(engine.getActiveStreamsCount()).toBe(0);

    const handle = await engine.openStream(hash, 0);
    expect(engine.getActiveStreamsCount()).toBe(1);
    expect(engine.getStatus(handle.streamId)).toBeDefined();

    await handle.destroy();
    expect(engine.getActiveStreamsCount()).toBe(0);
    expect(engine.getStatus(handle.streamId)).toBeUndefined();

    await engine.destroy();
  });

  it('HTTP stream request decrements active streams when completed or closed', async () => {
    const app = await buildApp();
    const engine = (app as any).streamix.engine as TorrentEngine;

    const hash = 'abcdef0123456789abcdef0123456789abcdef01';
    engine.registerParsedManifest({
      infoHash: hash,
      name: 'video.mp4',
      pieceLength: 262144,
      pieceCount: 1,
      totalSize: 1000,
      files: [{ index: 0, path: 'video.mp4', name: 'video.mp4', size: 1000, mimeType: 'video/mp4', offset: 0, selected: false }]
    });

    const initialCount = engine.getActiveStreamsCount();
    expect(initialCount).toBe(0);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/torrents/${hash}/files/0/stream`,
      headers: { range: 'bytes=0-99' }
    });

    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 0-99/1000');
    expect(res.headers['content-length']).toBe('100');

    // Give microtask tick for close/cleanup to complete
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(engine.getActiveStreamsCount()).toBe(0);

    await app.close();
  });

  it('returns HTTP 416 with Content-Range for invalid range and does not leak stream', async () => {
    const app = await buildApp();
    const engine = (app as any).streamix.engine as TorrentEngine;

    const hash = '1122334455667788990011223344556677889900';
    engine.registerParsedManifest({
      infoHash: hash,
      name: 'video.mp4',
      pieceLength: 262144,
      pieceCount: 1,
      totalSize: 500,
      files: [{ index: 0, path: 'video.mp4', name: 'video.mp4', size: 500, mimeType: 'video/mp4', offset: 0, selected: false }]
    });

    const res = await app.inject({
      method: 'GET',
      url: `/v1/torrents/${hash}/files/0/stream`,
      headers: { range: 'bytes=600-700' }
    });

    expect(res.statusCode).toBe(416);
    expect(res.headers['content-range']).toBe('bytes */500');

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(engine.getActiveStreamsCount()).toBe(0);

    await app.close();
  });
});
