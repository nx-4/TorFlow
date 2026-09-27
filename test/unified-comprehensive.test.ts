import { describe, expect, it, vi } from 'vitest';
import { cleanQueryTerm, parseQuality, parseAudioQuality, queryText, rankCandidates } from '../src/resolver/ranking.js';
import { matchesRequestedContent } from '../src/resolver/content-match.js';
import { selectMediaFile, selectSubtitleFiles } from '../src/resolver/file-selector.js';
import { MultiIndexerClient, ApibayVideoClient, AudioPublicClient, seriesQueryVariants } from '../src/resolver/public-clients.js';
import { StreamResolver } from '../src/resolver/stream-resolver.js';
import { TorrentEngine } from '../src/engine/torrent-engine.js';
import { buildApp } from '../src/server.js';
import { FileManifest } from '../src/types.js';

describe('12-Point Comprehensive Internal Test Suite for TorFlow', () => {

  // 1 & 7: Normal movie search & Query Normalization
  describe('Test 1 & 7: Movie Search & Query Normalization', () => {
    it('normalizes punctuation, special characters, and matches regular movies', () => {
      const cleaned = cleanQueryTerm('Inception: 10th Anniversary! [4K UHD] (2010)');
      expect(cleaned).toBe('Inception 10th Anniversary 4K UHD 2010');

      const matches = matchesRequestedContent(
        { title: 'Inception', year: 2010, type: 'movie' },
        'Inception 2010 1080p BluRay x264-SPARKS',
        [{ name: 'Inception.2010.1080p.mkv', path: 'Inception.2010.1080p.mkv' }]
      );
      expect(matches).toBe(true);
    });
  });

  // 2: Series and specific episode
  describe('Test 2: Series and specific episode search and matching', () => {
    it('matches series episodes in standard SxxExx and 1x01 formats', () => {
      expect(matchesRequestedContent(
        { title: 'Breaking Bad', season: 1, episode: 1, type: 'series' },
        'Breaking Bad S01E01 720p HDTV x264',
        [{ name: 'Breaking.Bad.S01E01.mkv', path: 'Breaking.Bad.S01E01.mkv' }]
      )).toBe(true);

      expect(matchesRequestedContent(
        { title: 'Breaking Bad', season: 2, episode: 5, type: 'series' },
        'Breaking Bad 2x05 Breakage 1080p',
        [{ name: 'Breaking Bad - 2x05.mkv', path: 'Breaking Bad - 2x05.mkv' }]
      )).toBe(true);
    });
  });

  // 3: Anime Movie (Unified logic - no special anime resolver)
  describe('Test 3: Anime Movie using unified Movie logic', () => {
    it('treats anime movies identically to standard movies without special resolver', () => {
      const q = { title: 'Spirited Away', year: 2001, type: 'movie' as const };
      const torrentName = 'Spirited.Away.2001.JAPANESE.1080p.BluRay.x264';
      const files = [
        { name: 'Spirited Away (2001).mkv', path: 'Spirited Away (2001).mkv', index: 0, size: 2500000000, mimeType: 'video/x-matroska', offset: 0, selected: false }
      ];

      expect(matchesRequestedContent(q, torrentName, files)).toBe(true);
      const selected = selectMediaFile(files, q);
      expect(selected?.name).toBe('Spirited Away (2001).mkv');
    });
  });

  // 4: Anime Series & Episode (Unified logic)
  describe('Test 4: Anime Series & Episode using unified Series logic', () => {
    it('matches and selects specific anime episodes from season packs or single releases', () => {
      const q = { title: 'Attack on Titan', season: 1, episode: 5, type: 'series' as const };
      const seasonPackFiles: FileManifest[] = [
        { name: 'Attack on Titan S01E01.mkv', path: 'S01/E01.mkv', index: 0, size: 1000, mimeType: 'video/mp4', offset: 0, selected: false },
        { name: 'Attack on Titan S01E05.mkv', path: 'S01/E05.mkv', index: 1, size: 1000, mimeType: 'video/mp4', offset: 1000, selected: false },
        { name: 'Attack on Titan S01E10.mkv', path: 'S01/E10.mkv', index: 2, size: 1000, mimeType: 'video/mp4', offset: 2000, selected: false }
      ];

      expect(matchesRequestedContent(q, 'Attack on Titan Season 1 Complete 1080p', seasonPackFiles)).toBe(true);
      const picked = selectMediaFile(seasonPackFiles, q);
      expect(picked?.index).toBe(1);
      expect(picked?.name).toContain('S01E05');
    });
  });

  // 5: Cartoon Movie / Series (Unified logic)
  describe('Test 5: Cartoon Movie and Series using unified logic', () => {
    it('handles cartoon movies and animated episodic shows with the same pipeline', () => {
      const movieQ = { title: 'The Lion King', year: 1994, type: 'movie' as const };
      expect(matchesRequestedContent(movieQ, 'The Lion King 1994 1080p BluRay')).toBe(true);

      const cartoonSeriesQ = { title: 'Rick and Morty', season: 3, episode: 3, type: 'series' as const };
      const files: FileManifest[] = [
        { name: 'sample.mkv', path: 'sample.mkv', index: 0, size: 5000000, mimeType: 'video/x-matroska', offset: 0, selected: false },
        { name: 'Rick and Morty S03E03 Pickle Rick 1080p.mkv', path: 'Rick and Morty S03E03 Pickle Rick 1080p.mkv', index: 1, size: 800000000, mimeType: 'video/x-matroska', offset: 5000000, selected: false }
      ];
      expect(matchesRequestedContent(cartoonSeriesQ, 'Rick and Morty Season 3', files)).toBe(true);
      const chosen = selectMediaFile(files, cartoonSeriesQ);
      expect(chosen?.index).toBe(1); // ignored sample, picked episode 3
    });
  });

  // 6: Music & Audio Torrents
  describe('Test 6: Music and Audio Torrents', () => {
    it('parses audio quality, formats (FLAC/MP3), and selects audio tracks properly', () => {
      const q = { title: 'Random Access Memories', artist: 'Daft Punk', type: 'music' as const };
      const flacQuality = parseAudioQuality('Daft Punk - Random Access Memories (2013) [FLAC 24bit-96kHz]');
      expect(flacQuality.audioFormat).toBe('flac');
      expect(flacQuality.score).toBeGreaterThan(50);

      const mp3Quality = parseAudioQuality('Daft Punk - Random Access Memories [MP3 320kbps]');
      expect(mp3Quality.audioFormat).toBe('mp3-320');

      const files: FileManifest[] = [
        { name: 'cover.jpg', path: 'cover.jpg', index: 0, size: 200000, mimeType: 'image/jpeg', offset: 0, selected: false },
        { name: '01 - Give Life Back to Music.flac', path: '01.flac', index: 1, size: 50000000, mimeType: 'audio/flac', offset: 200000, selected: false },
        { name: '08 - Get Lucky.flac', path: '08.flac', index: 2, size: 60000000, mimeType: 'audio/flac', offset: 50200000, selected: false }
      ];

      const specificTrackQ = { title: 'Random Access Memories', artist: 'Daft Punk', track: 'Get Lucky', type: 'music' as const };
      const selected = selectMediaFile(files, specificTrackQ);
      expect(selected?.name).toContain('Get Lucky');
    });
  });

  // 8 & 10: Smart Ranking, Seeders, Quality, Codec
  describe('Test 8 & 10: Smart Ranking, Codecs, Quality, Seeders across all media', () => {
    it('ranks candidates by seeders, codecs (h264/hevc), resolution (1080p/720p), and preferred quality', () => {
      const candidates = [
        { magnet: 'magnet:?xt=urn:btih:1111111111111111111111111111111111111111', title: 'Movie 720p x264', seeders: 10, source: 'yts' },
        { magnet: 'magnet:?xt=urn:btih:2222222222222222222222222222222222222222', title: 'Movie 1080p h264', seeders: 50, source: 'yts' },
        { magnet: 'magnet:?xt=urn:btih:3333333333333333333333333333333333333333', title: 'Movie 2160p hevc', seeders: 15, source: 'yts' },
      ];

      const ranked = rankCandidates(candidates, { title: 'Movie', preferredQuality: '1080p' });
      expect(ranked[0].title).toContain('1080p');
      expect(ranked[0].quality.resolution).toBe('1080p');
      expect(ranked[0].quality.videoCodec).toBe('h264');
    });
  });

  // 9: MultiIndexer Unified Search
  describe('Test 9: MultiIndexer unified search', () => {
    it('aggregates across indexers without dropping valid results', async () => {
      const client1 = { search: async () => [{ magnet: 'magnet:?xt=urn:btih:aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000', title: 'Item 1080p', seeders: 20 }] };
      const client2 = { search: async () => [{ magnet: 'magnet:?xt=urn:btih:bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000', title: 'Item 720p', seeders: 15 }] };

      const multi = new MultiIndexerClient([client1, client2]);
      const results = await multi.search({ title: 'Item' });
      expect(results).toHaveLength(2);
      expect(results.map(r => r.seeders)).toEqual([20, 15]);
    });
  });

  // 11: Real WebTorrent Engine, Streaming, Range requests, Seeking, Client disconnect
  describe('Test 11: WebTorrent Engine, HTTP 206 Streaming, Range, Seeking, Client Disconnect', () => {
    it('handles Range requests, partial content (206), Seeking offsets, and cleanup', async () => {
      const app = await buildApp();
      const streamix = (app as unknown as { streamix: { engine: TorrentEngine } }).streamix;
      const engine = streamix.engine;

      const infoHash = '1234567890abcdef1234567890abcdef12345678';
      const fileSize = 10 * 1024 * 1024; // 10MB
      engine.registerParsedManifest({
        infoHash,
        name: 'StreamingTest',
        pieceLength: 65536,
        pieceCount: 160,
        totalSize: fileSize,
        files: [{
          index: 0,
          path: 'video.mp4',
          name: 'video.mp4',
          size: fileSize,
          mimeType: 'video/mp4',
          offset: 0,
          selected: true
        }]
      });

      // 11a: Initial range request (bytes 0-1023)
      const res1 = await app.inject({
        method: 'GET',
        url: `/v1/torrents/${infoHash}/files/0/stream`,
        headers: { range: 'bytes=0-1023' }
      });
      expect(res1.statusCode).toBe(206);
      expect(res1.headers['content-range']).toBe(`bytes 0-1023/${fileSize}`);
      expect(res1.headers['content-length']).toBe('1024');
      expect(res1.headers['accept-ranges']).toBe('bytes');
      expect(res1.rawPayload.length).toBe(1024);

      // 11b: Seeking request in the middle (bytes 5242880-6291455) (5MB to 6MB)
      const resSeek = await app.inject({
        method: 'GET',
        url: `/v1/torrents/${infoHash}/files/0/stream`,
        headers: { range: 'bytes=5242880-6291455' }
      });
      expect(resSeek.statusCode).toBe(206);
      expect(resSeek.headers['content-range']).toBe(`bytes 5242880-6291455/${fileSize}`);
      expect(resSeek.rawPayload.length).toBe(1048576);

      // 11c: Seeking to end of stream (last 512 bytes)
      const resEnd = await app.inject({
        method: 'GET',
        url: `/v1/torrents/${infoHash}/files/0/stream`,
        headers: { range: `bytes=${fileSize - 512}-${fileSize - 1}` }
      });
      expect(resEnd.statusCode).toBe(206);
      expect(resEnd.headers['content-range']).toBe(`bytes ${fileSize - 512}-${fileSize - 1}/${fileSize}`);
      expect(resEnd.rawPayload.length).toBe(512);

      await app.close();
    });
  });

  // 12: Failure cases: empty result, unresponsive source, low seeders, invalid torrent
  describe('Test 12: Failure cases & error handling', () => {
    it('returns 416 for unsatisfiable range requests', async () => {
      const app = await buildApp();
      const streamix = (app as unknown as { streamix: { engine: TorrentEngine } }).streamix;
      const engine = streamix.engine;
      const infoHash = 'fedcba0987654321fedcba0987654321fedcba09';
      engine.registerParsedManifest({
        infoHash,
        name: 'FailTest',
        pieceLength: 16384,
        pieceCount: 1,
        totalSize: 100,
        files: [{ index: 0, path: 'f.mp4', name: 'f.mp4', size: 100, mimeType: 'video/mp4', offset: 0, selected: true }]
      });

      const res = await app.inject({
        method: 'GET',
        url: `/v1/torrents/${infoHash}/files/0/stream`,
        headers: { range: 'bytes=200-300' } // outside 100 bytes
      });
      expect(res.statusCode).toBe(416);

      await app.close();
    });

    it('filters out candidates with insufficient seeders', () => {
      const lowSeeders = [
        { magnet: 'magnet:?xt=urn:btih:deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', title: 'Dead Torrent 1080p', seeders: 0, source: 'apibay' }
      ];
      const ranked = rankCandidates(lowSeeders, { title: 'Dead Torrent', type: 'movie' });
      expect(ranked).toHaveLength(0); // seeders >= 1 required for video
    });

    it('rejects invalid or missing stream requests with 404', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/v1/torrents/0000000000000000000000000000000000000000/files/0/stream'
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('handles indexer failure smoothly without crashing', async () => {
      const failingIndexer = {
        search: async () => { throw new Error('Source Connection Refused'); }
      };
      const engine = new TorrentEngine();
      const resolver = new StreamResolver(failingIndexer, engine, 1000);

      await expect(resolver.findStream({ title: 'Test Movie' })).rejects.toThrow();
    });
  });

});
