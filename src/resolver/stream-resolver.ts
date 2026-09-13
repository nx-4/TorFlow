import { TorrentEngine } from '../engine/torrent-engine.js';
import { rankCandidates } from './ranking.js';
import { IndexerClient } from './torznab-client.js';
import { selectSubtitleFiles, SubtitleTrack } from './file-selector.js';
import { OpenSubtitlesClient } from './subtitles.js';
import { RankedCandidate, ResolverQuery, ResolverResult } from './types.js';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> { return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs))]); }

export class StreamResolver {
  constructor(private readonly indexer: IndexerClient, private readonly engine: TorrentEngine, private readonly perCandidateTimeoutMs = 5000, private readonly subtitleClient = new OpenSubtitlesClient()) {}

  async findStream(query: ResolverQuery): Promise<ResolverResult> {
    if (!(query.title?.trim() || query.query?.trim() || query.artist?.trim() || query.album?.trim() || query.track?.trim() || query.imdb_id || query.tmdb_id)) throw new Error('title, query, artist, album, track, imdb_id, or tmdb_id is required');
    const ranked = rankCandidates(await this.indexer.search(query), query);
    if (!ranked.length) throw new Error(`No healthy torrent found (seeders must be >= ${query.type === 'music' ? 2 : 1})`);
    const failures: string[] = [];
    for (const candidate of ranked) { try { const result = await withTimeout(this.tryCandidate(candidate, query), this.perCandidateTimeoutMs, 'candidate timeout'); return { ...result, attempted: failures.length + 1 }; } catch (error) { failures.push(`${candidate.title}: ${(error as Error).message}`); } }
    throw new Error(`All ranked torrent candidates failed: ${failures.join('; ')}`);
  }

  private async tryCandidate(candidate: RankedCandidate, query: ResolverQuery): Promise<Omit<ResolverResult, 'attempted'>> {
    const manifest = await this.engine.registerManifest({ magnet: candidate.magnet });
    await this.engine.waitForPeers(manifest.infoHash, Math.min(2500, this.perCandidateTimeoutMs - 250));
    const audioExtensions = /\.(mp3|flac|m4a|aac|wav|ogg|opus|alac)$/i;
    const file = query.type === 'music' ? manifest.files.find((item) => audioExtensions.test(item.name) || item.mimeType.startsWith('audio/')) : manifest.files.find((item) => item.mimeType.startsWith('video/') || item.mimeType.startsWith('audio/')) ?? manifest.files[0];
    if (!file) throw new Error('Torrent contains no playable media file');
    const handle = await this.engine.openStream(manifest.infoHash, file.index);
    const audioTracks = manifest.files.filter((item) => item.mimeType.startsWith('audio/')).map((item) => item.name);
    const subtitleTracks = manifest.files.filter((item) => /\.(srt|vtt|ass|ssa)$/i.test(item.name)).map((item) => item.name);
    const local = selectSubtitleFiles(manifest.files); const existing = new Set(local.map((item) => item.lang));
    const subtitles: SubtitleTrack[] = local.map((item, index) => ({ lang: item.lang, label: item.label, isDefault: item.lang === 'ara' || (!existing.has('ara') && item.lang === 'eng' && index === 0), url: `/v1/subtitles/${manifest.infoHash}/${item.file.index}`, source: 'torrent' as const, fileIndex: item.file.index }));
    if (query.type !== 'music' && (!existing.has('ara') || !existing.has('eng'))) { try { subtitles.push(...await this.subtitleClient.search(query, existing)); } catch { /* optional provider failure does not break torrent playback */ } }
    const defaultIndex = subtitles.findIndex((item) => item.lang === 'ara'); if (defaultIndex >= 0) subtitles.forEach((item, index) => { item.isDefault = index === defaultIndex; });
    return { sourceType: 'torrent', subtitles, candidate, infoHash: manifest.infoHash, streamId: handle.streamId, streamUrl: `/v1/torrents/${manifest.infoHash}/files/${file.index}/stream`, fileIndex: file.index, files: manifest.files, quality: candidate.quality, audioTracks, subtitleTracks };
  }
}
