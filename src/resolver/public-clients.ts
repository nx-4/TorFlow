import { IndexerClient } from './torznab-client.js';
import { ResolverQuery, TorrentCandidate } from './types.js';
import { queryText } from './ranking.js';

const TRACKERS = ['udp://open.stealth.si:80/announce', 'udp://tracker.opentrackr.org:1337/announce', 'udp://tracker.openbittorrent.com:6969/announce'];

function timeoutSignal(ms: number, signal?: AbortSignal): AbortSignal { const timeout = AbortSignal.timeout(ms); return signal ? AbortSignal.any([signal, timeout]) : timeout; }
function magnet(hash: string, name: string): string { const params = [`xt=urn:btih:${encodeURIComponent(hash)}`, `dn=${encodeURIComponent(name)}`]; for (const tracker of TRACKERS) params.push(`tr=${encodeURIComponent(tracker)}`); return `magnet:?${params.join('&')}`; }

export class YtsClient implements IndexerClient {
  constructor(private readonly baseUrl = 'https://movies-api.accel.li/api/v2', private readonly timeoutMs = 3500) {}
  async search(query: ResolverQuery, signal?: AbortSignal): Promise<TorrentCandidate[]> {
    if (query.type === 'music' || query.season !== undefined || query.episode !== undefined) return [];
    const url = new URL(`${this.baseUrl}/list_movies.json`);
    url.searchParams.set('query_term', query.imdb_id ?? query.title ?? query.query ?? ''); url.searchParams.set('limit', '20');
    if (query.year) url.searchParams.set('year', String(query.year));
    const response = await fetch(url, { signal: timeoutSignal(this.timeoutMs, signal), headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`YTS HTTP ${response.status}`);
    const payload = await response.json() as { data?: { movies?: Array<{ title?: string; year?: number; torrents?: Array<{ hash?: string; quality?: string; type?: string; seeds?: number; peers?: number; size_bytes?: number }> }> } };
    return (payload.data?.movies ?? []).flatMap((movie) => (movie.torrents ?? []).map((torrent) => { const title = `${movie.title ?? query.title ?? query.query ?? ''} ${movie.year ?? query.year ?? ''} ${torrent.quality ?? ''} ${torrent.type ?? ''} x264`; return { magnet: torrent.hash ? magnet(torrent.hash, title) : '', title, seeders: Number(torrent.seeds ?? torrent.peers ?? 0), leechers: Number(torrent.peers ?? 0), size: Number(torrent.size_bytes ?? 0), source: 'yts' }; })).filter((candidate) => candidate.magnet);
  }
}

export class TorrentioClient implements IndexerClient {
  constructor(private readonly baseUrl = 'https://torrentio.strem.fun', private readonly timeoutMs = 3500) {}
  async search(query: ResolverQuery, signal?: AbortSignal): Promise<TorrentCandidate[]> {
    if (query.type === 'music') return [];
    const kind = query.season !== undefined || query.episode !== undefined ? 'series' : 'movie';
    const id = query.imdb_id ?? (query.tmdb_id ? `tmdb:${query.tmdb_id}` : encodeURIComponent(query.title ?? query.query ?? ''));
    const suffix = kind === 'series' ? `:${query.season ?? 1}:${query.episode ?? 1}` : '';
    const response = await fetch(`${this.baseUrl}/stream/${kind}/${id}${suffix}.json`, { signal: timeoutSignal(this.timeoutMs, signal), headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`Torrentio HTTP ${response.status}`);
    const payload = await response.json() as { streams?: Array<{ name?: string; title?: string; url?: string; infoHash?: string }> };
    return (payload.streams ?? []).map((stream) => { const title = stream.name ?? stream.title ?? 'Torrentio result'; const hash = stream.infoHash ?? stream.url?.match(/urn:btih:([^&/]+)/i)?.[1]; const seedMatch = title.match(/(?:👤|seed(?:s|ers)?[: ]*)\s*(\d+)/i); return { magnet: hash ? magnet(hash, title) : (stream.url?.startsWith('magnet:?') ? stream.url : ''), title, seeders: Number(seedMatch?.[1] ?? 0), source: 'torrentio' }; }).filter((candidate) => candidate.magnet);
  }
}

/** Public Pirate Bay-compatible JSON search used only for music queries. */
export class AudioPublicClient implements IndexerClient {
  constructor(private readonly baseUrl = 'https://apibay.org', private readonly timeoutMs = 3500) {}
  async search(query: ResolverQuery, signal?: AbortSignal): Promise<TorrentCandidate[]> {
    if (query.type !== 'music') return [];
    const text = queryText(query); const response = await fetch(`${this.baseUrl}/q.php?q=${encodeURIComponent(text)}`, { signal: timeoutSignal(this.timeoutMs, signal), headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`Audio indexer HTTP ${response.status}`);
    const payload = await response.json() as Array<{ name?: string; info_hash?: string; seeders?: number; leechers?: number; size?: string }>;
    return payload.map((item) => { const title = item.name ?? text; return { magnet: item.info_hash ? magnet(item.info_hash, title) : '', title, seeders: Number(item.seeders ?? 0), leechers: Number(item.leechers ?? 0), size: Number(item.size ?? 0), source: 'public-audio' }; }).filter((candidate) => candidate.magnet);
  }
}

export class MultiIndexerClient implements IndexerClient {
  constructor(private readonly clients: IndexerClient[]) {}
  async search(query: ResolverQuery, signal?: AbortSignal): Promise<TorrentCandidate[]> { const results: TorrentCandidate[] = []; for (const client of this.clients) { try { results.push(...await client.search(query, signal)); } catch { /* continue when a public source is unavailable */ } } return results; }
}
export function createPublicIndexer(timeoutMs = 3500): IndexerClient { return new MultiIndexerClient([new YtsClient(undefined, timeoutMs), new TorrentioClient(undefined, timeoutMs), new AudioPublicClient(undefined, timeoutMs)]); }
export function buildPublicQuery(query: ResolverQuery): string { return queryText(query); }
