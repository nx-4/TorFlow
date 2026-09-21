import { TorrentEngine } from '../engine/torrent-engine.js';
import { rankCandidates } from './ranking.js';
import { IndexerClient } from './torznab-client.js';
import { selectSubtitleFiles, SubtitleTrack } from './file-selector.js';
import { OpenSubtitlesClient } from './subtitles.js';
import { RankedCandidate, ResolverQuery, ResolverResult } from './types.js';
import { ResolutionCache, resolutionCacheKey } from './resolution-cache.js';
import { HlsResult, HlsSource } from './hls-source.js';
import { matchesRequestedContent } from './content-match.js';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); });
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

const resolverDebug = process.env.RESOLVER_DEBUG === 'true';
const MAX_RANKED_ATTEMPTS = 16;

export class StreamResolver {
  private readonly inFlight = new Map<string, Promise<ResolverResult | HlsResult>>();

  constructor(private readonly indexer: IndexerClient, private readonly engine: TorrentEngine, private readonly perCandidateTimeoutMs = 5000, private readonly subtitleClient = new OpenSubtitlesClient(), private readonly cache?: ResolutionCache<ResolverResult>, private readonly hlsSource = new HlsSource()) {}

  async findStream(query: ResolverQuery): Promise<ResolverResult | HlsResult> {
    if (!(query.title?.trim() || query.query?.trim() || query.artist?.trim() || query.album?.trim() || query.track?.trim() || query.imdb_id || query.tmdb_id)) throw new Error('title, query, artist, album, track, imdb_id, or tmdb_id is required');
    const hls = this.hlsSource.resolve(query);
    if (hls) return hls;
    const cacheKey = resolutionCacheKey(query as unknown as Record<string, unknown>);
    const pending = this.inFlight.get(cacheKey);
    if (pending) return pending;
    const operation = this.resolveTorrent(query, cacheKey);
    this.inFlight.set(cacheKey, operation);
    try { return await operation; } finally { this.inFlight.delete(cacheKey); }
  }

  private async resolveTorrent(query: ResolverQuery, cacheKey: string): Promise<ResolverResult> {
    const cached = this.cache?.get(cacheKey);
    if (cached && this.engine.getManifest(cached.infoHash)) return { ...cached, cacheHit: true };
    if (cached) this.cache?.delete(cacheKey);
    const candidates = await withTimeout(this.indexer.search(query), Math.max(10000, this.perCandidateTimeoutMs * 2), 'indexer search timeout');
    if (resolverDebug) console.log(JSON.stringify({ scope: 'resolver', event: 'rank_input', type: query.type, count: candidates.length, seeders: candidates.slice(0, 10).map((candidate) => candidate.seeders) }));
    const ranked = rankCandidates(candidates, query).slice(0, MAX_RANKED_ATTEMPTS);
    if (!ranked.length) throw new Error(`No healthy torrent found (seeders must be >= ${query.type === 'music' ? 2 : 1})`);
    const failures: string[] = [];
    for (const candidate of ranked) {
      try {
        const result = await withTimeout(this.tryCandidate(candidate, query), this.perCandidateTimeoutMs, 'candidate timeout');
        const finalResult = { ...result, attempted: failures.length + 1 };
        this.cache?.set(cacheKey, finalResult);
        return finalResult;
      } catch (error) {
        if (resolverDebug) console.log(JSON.stringify({ scope: 'resolver', event: 'candidate_failure', source: candidate.source, seeders: candidate.seeders, error: String(error) }));
        failures.push(`${candidate.title}: ${(error as Error).message}`);
      }
    }
    throw new Error(`All ranked torrent candidates failed: ${failures.join('; ')}`);
  }

  private async tryCandidate(candidate: RankedCandidate, query: ResolverQuery): Promise<Omit<ResolverResult, 'attempted'>> {
    let infoHash: string | undefined;
    try {
      const manifest = await this.engine.registerManifest({ magnet: candidate.magnet }); infoHash = manifest.infoHash;
      const files = Array.isArray(manifest.files) ? manifest.files : [];
      if (!manifest.infoHash || !files.length) throw new Error('Torrent metadata contains no files');
      await this.engine.waitForPeers(manifest.infoHash, Math.min(4000, Math.max(1000, this.perCandidateTimeoutMs - 500)));
      const audioExtensions = /\.(mp3|flac|m4a|aac|wav|ogg|opus|alac)$/i;
      const file = query.type === 'music' ? files.find((item) => audioExtensions.test(item.name) || item.mimeType?.startsWith('audio/')) : files.find((item) => item.mimeType?.startsWith('video/') || item.mimeType?.startsWith('audio/')) ?? files[0];
      if (!file) throw new Error('Torrent contains no playable media file');
      if (!matchesRequestedContent(query, `${candidate.title} ${manifest.name}`, files)) throw new Error('Torrent content does not match the requested title, season, or episode');
      await this.engine.verifyDataFlow(manifest.infoHash, file.index, Math.min(5000, Math.max(1000, this.perCandidateTimeoutMs - 250)));
      const handle = await this.engine.openStream(manifest.infoHash, file.index);
      const audioTracks = files.filter((item) => item.mimeType?.startsWith('audio/')).map((item) => item.name);
      const subtitleTracks = files.filter((item) => /\.(srt|vtt|ass|ssa)$/i.test(item.name)).map((item) => item.name);
      const local = selectSubtitleFiles(files); const existing = new Set(local.map((item) => item.lang));
      const subtitles: SubtitleTrack[] = local.map((item, index) => ({ lang: item.lang, label: item.label, isDefault: item.lang === 'ara' || (!existing.has('ara') && item.lang === 'eng' && index === 0), url: `/v1/subtitles/${manifest.infoHash}/${item.file.index}`, source: 'torrent' as const, fileIndex: item.file.index }));
      if (query.type !== 'music' && !subtitles.length) {
        try {
          const core = await withTimeout(this.subtitleClient.searchCore(query, existing, query.preferredSubtitleLanguages), 2500, 'subtitle core timeout');
          subtitles.push(...core);
          if (!core.length) subtitles.push(...await withTimeout(this.subtitleClient.search(query, existing), 2500, 'subtitle fallback timeout'));
        } catch { /* subtitle providers are optional and never block playback */ }
      }
      const defaultIndex = subtitles.findIndex((item) => item.lang === 'ara'); if (defaultIndex >= 0) subtitles.forEach((item, index) => { item.isDefault = index === defaultIndex; });
      return { sourceType: 'torrent', subtitles, candidate, infoHash: manifest.infoHash, streamId: handle.streamId, streamUrl: `/v1/torrents/${manifest.infoHash}/files/${file.index}/stream`, fileIndex: file.index, files, quality: candidate.quality, audioTracks, subtitleTracks };
    } catch (error) { if (infoHash) await this.engine.destroyTorrent(infoHash); throw error; }
  }
}
