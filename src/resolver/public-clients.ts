import { IndexerClient } from './torznab-client.js';
import { ResolverQuery, TorrentCandidate } from './types.js';
import { queryText } from './ranking.js';

const TRACKERS = ['udp://open.stealth.si:80/announce', 'udp://tracker.opentrackr.org:1337/announce', 'udp://tracker.openbittorrent.com:6969/announce'];
function timeoutSignal(ms: number, signal?: AbortSignal): AbortSignal { const timeout = AbortSignal.timeout(ms); return signal ? AbortSignal.any([signal, timeout]) : timeout; }
function magnet(hash: string, name: string): string { if (!/^(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(hash)) return ''; const params = [`xt=urn:btih:${hash}`, `dn=${encodeURIComponent(name)}`]; for (const tracker of TRACKERS) params.push(`tr=${encodeURIComponent(tracker)}`); return `magnet:?${params.join('&')}`; }
function normalizeMagnet(value: string, name: string): string { const decoded = decodeURIComponent(value); const match = decoded.match(/[?&]xt=urn:btih:([a-f0-9]{40}|[a-z2-7]{32})/i); return match?.[1] ? magnet(match[1], name) : ''; }
function isVideo(query: ResolverQuery): boolean { return query.type !== 'music'; }
function parseHtmlResults(html: string, source: string, fallback: string): TorrentCandidate[] {
  const results: TorrentCandidate[] = []; const seen = new Set<string>();
  const magnetPattern = /magnet:\?[^"'<>\s]+/gi;
  for (const raw of html.match(magnetPattern) ?? []) {
    const match = raw.match(/xt=urn%3Abtih%3A([^&]+)|xt=urn:btih:([^&]+)/i); const hash = match?.[1] ?? match?.[2]; if (!hash || seen.has(hash.toLowerCase())) continue;
    seen.add(hash.toLowerCase()); const title = decodeURIComponent(raw.match(/[?&]dn=([^&]+)/i)?.[1] ?? fallback).replace(/[+]/g, ' ');
    const context = html.slice(Math.max(0, html.indexOf(raw) - 180), html.indexOf(raw) + raw.length + 180); const seeders = Number(context.match(/(?:seed(?:s|ers)?|👤)[^0-9]{0,12}(\d+)/i)?.[1] ?? 0);
    const normalized = normalizeMagnet(raw, title); if (normalized) results.push({ magnet: normalized, title, seeders, source });
  }
  return results;
}

export class YtsClient implements IndexerClient {
  constructor(private readonly baseUrl = 'https://movies-api.accel.li/api/v2', private readonly timeoutMs = 3000) {}
  async search(query: ResolverQuery, signal?: AbortSignal): Promise<TorrentCandidate[]> {
    if (query.type === 'music' || query.season !== undefined || query.episode !== undefined) return [];
    const url = new URL(`${this.baseUrl}/list_movies.json`); url.searchParams.set('query_term', query.imdb_id ?? query.title ?? query.query ?? ''); url.searchParams.set('limit', '20'); if (query.year) url.searchParams.set('year', String(query.year));
    const response = await fetch(url, { signal: timeoutSignal(this.timeoutMs, signal), headers: { accept: 'application/json' } }); if (!response.ok) throw new Error(`YTS HTTP ${response.status}`);
    const payload = await response.json() as { data?: { movies?: Array<{ title?: string; year?: number; torrents?: Array<{ hash?: string; quality?: string; type?: string; seeds?: number; peers?: number; size_bytes?: number }> }> } };
    return (payload.data?.movies ?? []).flatMap((movie) => (movie.torrents ?? []).map((torrent) => { const title = `${movie.title ?? query.title ?? query.query ?? ''} ${movie.year ?? query.year ?? ''} ${torrent.quality ?? ''} ${torrent.type ?? ''} x264`; return { magnet: torrent.hash ? magnet(torrent.hash, title) : '', title, seeders: Number(torrent.seeds ?? torrent.peers ?? 0), leechers: Number(torrent.peers ?? 0), size: Number(torrent.size_bytes ?? 0), source: 'yts' }; })).filter((candidate) => candidate.magnet);
  }
}

export class TorrentioClient implements IndexerClient {
  constructor(private readonly baseUrl = 'https://torrentio.strem.fun', private readonly timeoutMs = 3000) {}
  async search(query: ResolverQuery, signal?: AbortSignal): Promise<TorrentCandidate[]> { if (query.type === 'music') return []; const kind = query.season !== undefined || query.episode !== undefined ? 'series' : 'movie'; const id = query.imdb_id ?? (query.tmdb_id ? `tmdb:${query.tmdb_id}` : encodeURIComponent(query.title ?? query.query ?? '')); const suffix = kind === 'series' ? `:${query.season ?? 1}:${query.episode ?? 1}` : ''; const response = await fetch(`${this.baseUrl}/stream/${kind}/${id}${suffix}.json`, { signal: timeoutSignal(this.timeoutMs, signal), headers: { accept: 'application/json' } }); if (!response.ok) throw new Error(`Torrentio HTTP ${response.status}`); const payload = await response.json() as { streams?: Array<{ name?: string; title?: string; url?: string; infoHash?: string }> }; return (payload.streams ?? []).map((stream) => { const title = stream.name ?? stream.title ?? 'Torrentio result'; const hash = stream.infoHash ?? stream.url?.match(/urn:btih:([^&/]+)/i)?.[1]; const seedMatch = title.match(/(?:👤|seed(?:s|ers)?[: ]*)\s*(\d+)/i); const candidateMagnet = hash ? magnet(hash, title) : (stream.url?.startsWith('magnet:?') ? normalizeMagnet(stream.url, title) : ''); return { magnet: candidateMagnet, title, seeders: Number(seedMatch?.[1] ?? 0), source: 'torrentio' }; }).filter((candidate) => candidate.magnet); }
}

class HtmlTorrentClient implements IndexerClient {
  constructor(private readonly url: (query: ResolverQuery) => string, private readonly source: string, private readonly timeoutMs = 3000) {}
  async search(query: ResolverQuery, signal?: AbortSignal): Promise<TorrentCandidate[]> { if (!isVideo(query)) return []; const response = await fetch(this.url(query), { signal: timeoutSignal(this.timeoutMs, signal), headers: { accept: 'text/html,application/xhtml+xml' } }); if (!response.ok) throw new Error(`${this.source} HTTP ${response.status}`); return parseHtmlResults(await response.text(), this.source, queryText(query)); }
}
export class X1337Client extends HtmlTorrentClient { constructor(timeoutMs = 3000) { super((q) => `https://1337x.to/search/${encodeURIComponent(queryText(q))}/1/`, '1337x', timeoutMs); } }
export class EztvClient extends HtmlTorrentClient { constructor(timeoutMs = 3000) { super((q) => `https://eztv.re/search/${encodeURIComponent(queryText(q))}`, 'eztv', timeoutMs); } }
export class TorrentGalaxyClient extends HtmlTorrentClient { constructor(timeoutMs = 3000) { super((q) => `https://torrentgalaxy.to/torrents.php?search=${encodeURIComponent(queryText(q))}`, 'torrentgalaxy', timeoutMs); } }

export class AudioPublicClient implements IndexerClient {
  constructor(private readonly baseUrl = 'https://apibay.org', private readonly timeoutMs = 3000) {}
  async search(query: ResolverQuery, signal?: AbortSignal): Promise<TorrentCandidate[]> { if (query.type !== 'music') return []; const detailed = queryText(query); const terms = [...new Set([detailed, [query.artist, query.album, query.track, query.query].filter(Boolean).join(' '), query.track, query.album, query.artist].filter((value): value is string => Boolean(value)))]; const search = async (text: string): Promise<TorrentCandidate[]> => { const response = await fetch(`${this.baseUrl}/q.php?q=${encodeURIComponent(text)}`, { signal: timeoutSignal(this.timeoutMs, signal), headers: { accept: 'application/json' } }); if (!response.ok) throw new Error(`Audio indexer HTTP ${response.status}`); const payload = await response.json() as Array<{ name?: string; info_hash?: string; seeders?: number; leechers?: number; size?: string }>; return payload.map((item) => { const title = item.name ?? text; return { magnet: item.info_hash ? magnet(item.info_hash, title) : '', title, seeders: Number(item.seeders ?? 0), leechers: Number(item.leechers ?? 0), size: Number(item.size ?? 0), source: 'public-audio' }; }).filter((candidate) => candidate.magnet); }; const all: TorrentCandidate[] = []; for (const term of terms) { const found = await search(term); all.push(...found); if (found.some((candidate) => candidate.seeders >= 2)) break; } return all; }
}

export class MultiIndexerClient implements IndexerClient {
  constructor(private readonly clients: IndexerClient[]) {}
  async search(query: ResolverQuery, signal?: AbortSignal): Promise<TorrentCandidate[]> { const settled = await Promise.allSettled(this.clients.map((client) => client.search(query, signal))); return settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []); }
}
export function createPublicIndexer(timeoutMs = 3000): IndexerClient { return new MultiIndexerClient([new YtsClient(undefined, timeoutMs), new TorrentioClient(undefined, timeoutMs), new X1337Client(timeoutMs), new EztvClient(timeoutMs), new TorrentGalaxyClient(timeoutMs), new AudioPublicClient(undefined, timeoutMs)]); }
export function buildPublicQuery(query: ResolverQuery): string { return queryText(query); }
