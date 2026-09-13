import { ResolverQuery } from './types.js';
import { SubtitleTrack } from './file-selector.js';

const TARGETS = new Set(['ara', 'eng', 'fra', 'spa', 'deu']);
export class WyzieSubtitleClient {
  constructor(private readonly apiKey = process.env.WYZIE_API_KEY, private readonly baseUrl = 'https://sub.wyzie.io', private readonly timeoutMs = 2500) {}
  async search(query: ResolverQuery, existing: Set<string>): Promise<SubtitleTrack[]> {
    if (!this.apiKey || query.type === 'music' || (!query.imdb_id && !query.tmdb_id)) return [];
    const url = new URL(`${this.baseUrl}/search`); url.searchParams.set('id', query.imdb_id ?? `tmdb:${query.tmdb_id}`); url.searchParams.set('key', this.apiKey); if (query.season !== undefined) url.searchParams.set('season', String(query.season)); if (query.episode !== undefined) url.searchParams.set('episode', String(query.episode));
    const response = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs), headers: { accept: 'application/json' } }); if (!response.ok) return [];
    const payload = await response.json() as Array<{ url?: string; download?: string; language?: string; lang?: string; display?: string; label?: string }>;
    return payload.map((item) => { const lang = (item.lang ?? item.language ?? '').toLowerCase().slice(0, 3); return { lang, label: item.label ?? item.display ?? lang, isDefault: lang === 'ara' && !existing.has('ara'), url: item.url ?? item.download ?? '', source: 'wyzie' as const }; }).filter((item) => TARGETS.has(item.lang) && item.url && !existing.has(item.lang));
  }
}
