import { describe, expect, it } from 'vitest';
import { isTvProgram, tvProgramQueryVariants, cleanTvChannelPrefixes } from '../src/resolver/tv-program.js';
import { matchesRequestedContent } from '../src/resolver/content-match.js';
import { selectMediaFile } from '../src/resolver/file-selector.js';
import { rankCandidates } from '../src/resolver/ranking.js';
import { buildApp } from '../src/server.js';
import { TorrentEngine } from '../src/engine/torrent-engine.js';
import { FileManifest } from '../src/types.js';

describe('TV Program (Television Broadcast Shows) Specialized Path', () => {

  it('1. Correctly detects TV programs automatically and via explicit type', () => {
    expect(isTvProgram({ title: 'The Voice Kids', season: 1, episode: 3 })).toBe(true);
    expect(isTvProgram({ title: 'MasterChef Australia', season: 15, episode: 10 })).toBe(true);
    expect(isTvProgram({ title: 'America Got Talent', season: 18, episode: 2 })).toBe(true);
    expect(isTvProgram({ title: 'Random Broadcast Show', type: 'tv_program', season: 1, episode: 1 })).toBe(true);
    expect(isTvProgram({ title: 'Inception', type: 'movie' })).toBe(false);
    expect(isTvProgram({ title: 'Breaking Bad', type: 'series' })).toBe(false);
  });

  it('2. Generates comprehensive search query variants for TV broadcasts', () => {
    const variants = tvProgramQueryVariants({
      title: 'The Voice Kids',
      season: 1,
      episode: 3,
      country: 'UK',
      network: 'ITV'
    });

    expect(variants).toContain('The Voice Kids S01E03');
    expect(variants).toContain('The Voice Kids Season 1 Episode 3');
    expect(variants).toContain('The Voice Kids UK S01E03');
    expect(variants).toContain('The Voice Kids ITV S01E03');
  });

  it('3. Cleans TV network and release channel prefixes', () => {
    expect(cleanTvChannelPrefixes('[BBC] The Voice Kids S01E03')).toBe('The Voice Kids S01E03');
    expect(cleanTvChannelPrefixes('MBC The Voice Kids S01E03')).toBe('The Voice Kids S01E03');
    expect(cleanTvChannelPrefixes('[ITV] MasterChef UK S02E05')).toBe('MasterChef UK S02E05');
  });

  it('4. Matches actual TV program releases (The Voice Kids, MasterChef, Got Talent)', () => {
    // The Voice Kids S01E03 with UK prefix and HDTV tagging
    expect(matchesRequestedContent(
      { title: 'The Voice Kids', season: 1, episode: 3, type: 'tv_program' },
      'The.Voice.Kids.UK.S01E03.720p.HDTV.x264-LiNKLE'
    )).toBe(true);

    // MBC Arabic release with channel tag
    expect(matchesRequestedContent(
      { title: 'The Voice Kids', season: 1, episode: 3, type: 'tv_program' },
      '[MBC] The Voice Kids S01E03 1080p WEBRip x264'
    )).toBe(true);

    // MasterChef Australia episode
    expect(matchesRequestedContent(
      { title: 'MasterChef', season: 15, episode: 10, type: 'tv_program' },
      'MasterChef Australia S15E10 720p HDTV x264'
    )).toBe(true);

    // Auditions / Parts instead of standard SxxExx
    expect(matchesRequestedContent(
      { title: 'Got Talent', episode: 4, type: 'tv_program' },
      'Americas Got Talent Season 18 Auditions 4 720p HDTV'
    )).toBe(true);

    // Daily / weekly date-based show
    expect(matchesRequestedContent(
      { title: 'The Tonight Show', date: '2024-05-12', type: 'tv_program' },
      'The Tonight Show Starring Jimmy Fallon 2024 05 12 720p HDTV x264'
    )).toBe(true);
  });

  it('5. Selects the exact TV program episode from season packs or multi-file releases', () => {
    const files: FileManifest[] = [
      { name: 'sample.mp4', path: 'sample.mp4', index: 0, size: 5000000, mimeType: 'video/mp4', offset: 0, selected: false },
      { name: 'The Voice Kids S01E01.mp4', path: 'The Voice Kids S01E01.mp4', index: 1, size: 900000000, mimeType: 'video/mp4', offset: 5000000, selected: false },
      { name: 'The Voice Kids S01E02.mp4', path: 'The Voice Kids S01E02.mp4', index: 2, size: 950000000, mimeType: 'video/mp4', offset: 905000000, selected: false },
      { name: 'The Voice Kids S01E03.mp4', path: 'The Voice Kids S01E03.mp4', index: 3, size: 920000000, mimeType: 'video/mp4', offset: 1855000000, selected: false },
    ];

    const query = { title: 'The Voice Kids', season: 1, episode: 3, type: 'tv_program' as const };
    const selected = selectMediaFile(files, query);

    expect(selected).toBeDefined();
    expect(selected?.index).toBe(3);
    expect(selected?.name).toContain('S01E03');
  });

  it('6. Ranks TV program torrents by seeders and quality (1080p > 720p)', () => {
    const candidates = [
      { magnet: 'magnet:?xt=urn:btih:1111111111111111111111111111111111111111', title: 'The Voice Kids S01E03 720p HDTV x264', seeders: 12, source: 'eztv' },
      { magnet: 'magnet:?xt=urn:btih:2222222222222222222222222222222222222222', title: 'The Voice Kids S01E03 1080p WEB-DL H264', seeders: 45, source: 'apibay' },
    ];

    const ranked = rankCandidates(candidates, { title: 'The Voice Kids', season: 1, episode: 3, type: 'tv_program' });
    expect(ranked[0]?.title).toContain('1080p');
    expect(ranked[0]?.seeders).toBe(45);
  });

  it('7. TV program torrent flows into WebTorrent engine and streams with HTTP 206 Range requests', async () => {
    const app = await buildApp();
    const streamix = (app as unknown as { streamix: { engine: TorrentEngine } }).streamix;
    const engine = streamix.engine;

    const infoHash = 'abc000111222333444555666777888999000def1';
    const fileSize = 20 * 1024 * 1024; // 20 MB

    engine.registerParsedManifest({
      infoHash,
      name: 'The Voice Kids S01E03 HDTV',
      pieceLength: 131072,
      pieceCount: 160,
      totalSize: fileSize,
      files: [{
        index: 0,
        path: 'The Voice Kids S01E03.mp4',
        name: 'The Voice Kids S01E03.mp4',
        size: fileSize,
        mimeType: 'video/mp4',
        offset: 0,
        selected: true
      }]
    });

    // Request start of stream
    const res = await app.inject({
      method: 'GET',
      url: `/v1/torrents/${infoHash}/files/0/stream`,
      headers: { range: 'bytes=0-2047' }
    });

    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 0-2047/${fileSize}`);
    expect(res.headers['content-length']).toBe('2048');
    expect(res.rawPayload.length).toBe(2048);

    // Seeking into the middle of the show (10MB to 11MB)
    const resSeek = await app.inject({
      method: 'GET',
      url: `/v1/torrents/${infoHash}/files/0/stream`,
      headers: { range: 'bytes=10485760-11534335' }
    });

    expect(resSeek.statusCode).toBe(206);
    expect(resSeek.headers['content-range']).toBe(`bytes 10485760-11534335/${fileSize}`);
    expect(resSeek.rawPayload.length).toBe(1048576);

    await app.close();
  });

});
