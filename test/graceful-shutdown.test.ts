import { describe, expect, it } from 'vitest';
import { buildApp, gracefulShutdown } from '../src/server.js';
import { TorrentEngine } from '../src/engine/torrent-engine.js';

describe('Graceful Shutdown', () => {
  it('stops server and destroys active engine streams and torrents', async () => {
    const app = await buildApp();
    const engine = (app as any).streamix.engine as TorrentEngine;

    const hash = '7788990011223344556677889900112233445566';
    engine.registerParsedManifest({
      infoHash: hash,
      name: 'shutdown-test.mp4',
      pieceLength: 262144,
      pieceCount: 1,
      totalSize: 1000,
      files: [{ index: 0, path: 'shutdown-test.mp4', name: 'shutdown-test.mp4', size: 1000, mimeType: 'video/mp4', offset: 0, selected: false }]
    });

    await engine.openStream(hash, 0);
    expect(engine.getActiveStreamsCount()).toBe(1);
    expect(engine.getActiveTorrentsCount()).toBe(1);

    await gracefulShutdown(app);

    expect(engine.getActiveStreamsCount()).toBe(0);
    expect(engine.getActiveTorrentsCount()).toBe(0);
  });
});
