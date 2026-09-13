import { describe, expect, it } from 'vitest';
import { rankCandidates, parseAudioQuality, parseQuality, queryText } from '../src/resolver/ranking.js';
import { StreamResolver } from '../src/resolver/stream-resolver.js';
import { StaticIndexerClient } from '../src/resolver/torznab-client.js';
import { TorrentManifest } from '../src/types.js';
import { selectSubtitleFiles } from '../src/resolver/file-selector.js';

const manifest = (hash: string): TorrentManifest => ({ infoHash: hash, name: 'movie', pieceLength: 100, pieceCount: 1, totalSize: 100, files: [{ index: 0, path: 'movie.mp4', name: 'movie.mp4', size: 100, mimeType: 'video/mp4', offset: 0, selected: false }] });

describe('resolver ranking', () => {
  it('parses query and prefers compatible quality while excluding dead torrents', () => {
    expect(queryText({ title: 'Dune', year: 2021, tmdb_id: '438631' })).toContain('Dune 2021');
    expect(parseQuality('Dune.2021.1080p.x264.AAC').videoCodec).toBe('h264');
    const ranked = rankCandidates([
      { magnet: 'magnet:?xt=urn:btih:dead', title: 'Dune 4K AV1', seeders: 2 },
      { magnet: 'magnet:?xt=urn:btih:a', title: 'Dune 720p x264 AAC', seeders: 50 },
      { magnet: 'magnet:?xt=urn:btih:b', title: 'Dune 1080p HEVC', seeders: 60 },
    ]);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.title).toBe('Dune 720p x264 AAC');
  });
});

describe('resolver fallback', () => {
  it('tries the next candidate after the primary fails', async () => {
    const calls: string[] = [];
    const engine = {
      registerManifest: async ({ magnet }: { magnet: string }) => { calls.push(magnet); if (magnet.includes('bad')) throw new Error('metadata timeout'); return manifest('good-hash'); },
      waitForPeers: async () => undefined,
      openStream: async () => ({ streamId: 'stream_1' }),
    } as never;
    const resolver = new StreamResolver(new StaticIndexerClient([
      { magnet: 'magnet:?xt=urn:btih:bad', title: 'Movie 1080p x264', seeders: 100 },
      { magnet: 'magnet:?xt=urn:btih:good', title: 'Movie 720p x264 AAC', seeders: 20 },
    ]), engine, 500);
    const result = await resolver.findStream({ title: 'Movie' });
    expect(calls).toEqual(['magnet:?xt=urn:btih:bad', 'magnet:?xt=urn:btih:good']);
    expect(result.streamId).toBe('stream_1');
  });
});

describe('music resolver', () => {
  it('prefers FLAC and selects an individual playable audio file', async () => {
    expect(parseAudioQuality('Daft Punk Discovery FLAC 24bit').audioFormat).toBe('flac');
    const ranked = rankCandidates([
      { magnet: 'magnet:?xt=urn:btih:mp3', title: 'Discovery 320kbps MP3', seeders: 40 },
      { magnet: 'magnet:?xt=urn:btih:flac', title: 'Discovery FLAC Lossless', seeders: 40 },
      { magnet: 'magnet:?xt=urn:btih:low', title: 'Discovery AAC', seeders: 1 },
    ], { type: 'music', query: 'Daft Punk Discovery' });
    expect(ranked[0]?.quality.audioFormat).toBe('flac');
    expect(rankCandidates([{ magnet: 'magnet:?xt=urn:btih:two', title: 'Discovery AAC', seeders: 2 }], { type: 'music', query: 'Discovery' })).toHaveLength(1);
    const engine = {
      registerManifest: async () => ({ infoHash: 'audio-hash', files: [
        { index: 0, path: 'cover.jpg', name: 'cover.jpg', size: 10, mimeType: 'image/jpeg', offset: 0, selected: false },
        { index: 1, path: 'track.flac', name: 'track.flac', size: 100, mimeType: 'audio/flac', offset: 10, selected: false },
      ] }), waitForPeers: async () => undefined, openStream: async (_hash: string, fileIndex: number) => ({ streamId: `audio_stream_${fileIndex}` }),
    } as never;
    const resolver = new StreamResolver(new StaticIndexerClient([{ magnet: 'magnet:?xt=urn:btih:flac', title: 'Discovery FLAC', seeders: 40 }]), engine, 500);
    const result = await resolver.findStream({ type: 'music', artist: 'Daft Punk', album: 'Discovery' });
    expect(result.fileIndex).toBe(1);
    expect(result.streamUrl).toBe('/v1/torrents/audio-hash/files/1/stream');
  });
});


describe('torrent-only policy', () => {
  it('returns NO_HEALTHY_TORRENT when no healthy torrent exists', async () => {
    const resolver = new StreamResolver(new StaticIndexerClient([]), {} as never, 100);
    await expect(resolver.findStream({ title: 'Dune', imdb_id: 'tt1160419' })).rejects.toThrow('No healthy torrent');
  });
});

describe('subtitle selection', () => {
  it('prioritizes Arabic and detects major language codes', () => {
    const tracks = selectSubtitleFiles([
      { index: 0, path: 'movie.eng.srt', name: 'movie.eng.srt', size: 10, mimeType: 'text/plain', offset: 0, selected: false },
      { index: 1, path: 'movie.ara.srt', name: 'movie.ara.srt', size: 10, mimeType: 'text/plain', offset: 10, selected: false },
      { index: 2, path: 'movie.fra.vtt', name: 'movie.fra.vtt', size: 10, mimeType: 'text/vtt', offset: 20, selected: false },
    ]);
    expect(tracks.map((track) => track.lang)).toEqual(['ara', 'eng', 'fra']);
  });
});
