import { describe, expect, it } from 'vitest';
import { TorrentEngine } from '../src/engine/torrent-engine.js';

describe('Torrent Lifecycle, Grace Period, and MAX_CONCURRENT_TORRENTS', () => {
  it('destroys idle torrent after grace period when all users leave', async () => {
    const engine = new TorrentEngine(undefined, { idleTorrentGracePeriodMs: 100 });
    const hash = '2233445566778899001122334455667788990011';
    engine.registerParsedManifest({
      infoHash: hash,
      name: 'show.mp4',
      pieceLength: 262144,
      pieceCount: 1,
      totalSize: 1000,
      files: [{ index: 0, path: 'show.mp4', name: 'show.mp4', size: 1000, mimeType: 'video/mp4', offset: 0, selected: false }]
    });

    expect(engine.getActiveTorrentsCount()).toBe(1);

    const handle = await engine.openStream(hash, 0);
    expect(engine.getActiveStreamsCount(hash)).toBe(1);

    // User leaves
    await handle.destroy();
    expect(engine.getActiveStreamsCount(hash)).toBe(0);
    // Still within grace period
    expect(engine.getActiveTorrentsCount()).toBe(1);

    // Wait for grace period to expire
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(engine.getActiveTorrentsCount()).toBe(0);

    await engine.destroy();
  });

  it('keeps torrent alive while at least one user is still streaming', async () => {
    const engine = new TorrentEngine(undefined, { idleTorrentGracePeriodMs: 100 });
    const hash = '3344556677889900112233445566778899001122';
    engine.registerParsedManifest({
      infoHash: hash,
      name: 'show.mp4',
      pieceLength: 262144,
      pieceCount: 1,
      totalSize: 1000,
      files: [{ index: 0, path: 'show.mp4', name: 'show.mp4', size: 1000, mimeType: 'video/mp4', offset: 0, selected: false }]
    });

    const userA = await engine.openStream(hash, 0);
    const userB = await engine.openStream(hash, 0);
    expect(engine.getActiveStreamsCount(hash)).toBe(2);

    // User A leaves, User B still streaming
    await userA.destroy();
    expect(engine.getActiveStreamsCount(hash)).toBe(1);

    // Wait past grace period
    await new Promise((resolve) => setTimeout(resolve, 150));
    // Torrent must still be alive!
    expect(engine.getActiveTorrentsCount()).toBe(1);

    // User B leaves
    await userB.destroy();
    expect(engine.getActiveStreamsCount(hash)).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(engine.getActiveTorrentsCount()).toBe(0);

    await engine.destroy();
  });

  it('cancels cleanup if reused before grace period expires', async () => {
    const engine = new TorrentEngine(undefined, { idleTorrentGracePeriodMs: 200 });
    const hash = '4455667788990011223344556677889900112233';
    engine.registerParsedManifest({
      infoHash: hash,
      name: 'show.mp4',
      pieceLength: 262144,
      pieceCount: 1,
      totalSize: 1000,
      files: [{ index: 0, path: 'show.mp4', name: 'show.mp4', size: 1000, mimeType: 'video/mp4', offset: 0, selected: false }]
    });

    const user1 = await engine.openStream(hash, 0);
    await user1.destroy();

    // Reopen stream at 50ms (before 200ms grace expires)
    await new Promise((resolve) => setTimeout(resolve, 50));
    const user2 = await engine.openStream(hash, 0);

    // Wait another 200ms
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(engine.getActiveTorrentsCount()).toBe(1);
    expect(engine.getActiveStreamsCount(hash)).toBe(1);

    await user2.destroy();
    await engine.destroy();
  });

  it('enforces MAX_CONCURRENT_TORRENTS = 4 and evicts idle torrents or rejects when active limit reached', async () => {
    const engine = new TorrentEngine(undefined, { maxConcurrentTorrents: 4, idleTorrentGracePeriodMs: 5000 });

    const createManifest = (id: number) => ({
      infoHash: `hash00000000000000000000000000000000000${id}`,
      name: `movie-${id}.mp4`,
      pieceLength: 262144,
      pieceCount: 1,
      totalSize: 1000,
      files: [{ index: 0, path: `movie-${id}.mp4`, name: `movie-${id}.mp4`, size: 1000, mimeType: 'video/mp4', offset: 0, selected: false }]
    });

    // Add 4 torrents with active streams
    const handles = [];
    for (let i = 1; i <= 4; i++) {
      const m = createManifest(i);
      engine.registerParsedManifest(m);
      const h = await engine.openStream(m.infoHash, 0);
      handles.push(h);
    }

    expect(engine.getActiveTorrentsCount()).toBe(4);

    // Adding 5th torrent while 4 are active should fail limit
    const m5 = createManifest(5);
    expect(() => engine.registerParsedManifest(m5)).toThrow(/Maximum concurrent torrents limit reached/);

    // If 1 torrent becomes idle (user leaves), capacity enforcement evicts the idle one
    await handles[0]?.destroy();
    expect(engine.getActiveStreamsCount(handles[0]!.infoHash)).toBe(0);

    // Now adding 5th should evict idle torrent and succeed
    engine.registerParsedManifest(m5);
    expect(engine.getActiveTorrentsCount()).toBe(4);

    // Cleanup
    for (const h of handles.slice(1)) {
      await h.destroy();
    }
    await engine.destroy();
  });
});
