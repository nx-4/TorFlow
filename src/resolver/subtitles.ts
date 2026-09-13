import { ResolverQuery } from './types.js';
import { SubtitleTrack } from './file-selector.js';

const LANGUAGE_MAP: Record<string, string> = { ar: 'ara', en: 'eng', fr: 'fra', es: 'spa', de: 'deu', ara: 'ara', eng: 'eng', fra: 'fra', spa: 'spa', deu: 'deu' };
type OpenSubtitleFile = { file_id?: number; file_name?: string };
type OpenSubtitleItem = { attributes?: { language?: string; release?: string; files?: OpenSubtitleFile[] } };
type SearchResponse = { data?: OpenSubtitleItem[] };
type DownloadResponse = { link?: string; file_name?: string };

export class OpenSubtitlesClient {
  constructor(
    private readonly apiKey = process.env.OPENSUBTITLES_API_KEY,
    private readonly baseUrl = 'https://api.opensubtitles.com/api/v1',
    private readonly timeoutMs = 4000,
  ) {}

  async searchCore(query: ResolverQuery, existing: Set<string>): Promise<SubtitleTrack[]> {
    for (const language of ['ar', 'fr', 'en']) {
      const tracks = await this.search(query, existing, language);
      if (tracks.length) return tracks;
    }
    return [];
  }

  async search(query: ResolverQuery, existing: Set<string>, requestedLanguage?: string): Promise<SubtitleTrack[]> {
    if (!this.apiKey || query.type === 'music' || (!query.imdb_id && !query.tmdb_id)) return [];
    const headers = { accept: 'application/json', 'Api-Key': this.apiKey, 'User-Agent': 'Streamix_Hub v1.2.0' };
    const url = new URL(`${this.baseUrl}/subtitles`);
    url.searchParams.set('languages', requestedLanguage ?? 'ar,en,fr,es,de');
    url.searchParams.set('order_by', 'download_count');
    url.searchParams.set('order_direction', 'desc');
    if (query.type === 'series' && query.season !== undefined && query.episode !== undefined) {
      url.searchParams.set('season_number', String(query.season));
      url.searchParams.set('episode_number', String(query.episode));
      if (query.imdb_id) url.searchParams.set('parent_imdb_id', query.imdb_id.replace(/^tt/, ''));
      if (query.tmdb_id) url.searchParams.set('parent_tmdb_id', query.tmdb_id);
    } else if (query.imdb_id) url.searchParams.set('imdb_id', query.imdb_id.replace(/^tt/, ''));
    else if (query.tmdb_id) url.searchParams.set('tmdb_id', query.tmdb_id);
    const response = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs), headers });
    if (!response.ok) return [];
    const payload = await response.json() as SearchResponse;
    const results: SubtitleTrack[] = [];
    for (const item of payload.data ?? []) {
      const rawLanguage = (item.attributes?.language ?? '').toLowerCase();
      const lang = LANGUAGE_MAP[rawLanguage] ?? '';
      const file = item.attributes?.files?.[0];
      if (!lang || (requestedLanguage && lang !== LANGUAGE_MAP[requestedLanguage]) || !file?.file_id || existing.has(lang)) continue;
      const link = await this.download(file.file_id, headers);
      if (!link) continue;
      results.push({ lang, label: lang === 'ara' ? 'العربية' : lang === 'eng' ? 'English' : lang === 'fra' ? 'Français' : lang === 'spa' ? 'Español' : 'Deutsch', isDefault: lang === 'ara' && !existing.has('ara'), url: link, source: 'opensubtitles' });
    }
    const arabic = results.find((track) => track.lang === 'ara');
    if (arabic) results.forEach((track) => { track.isDefault = track === arabic; });
    return results;
  }

  private async download(fileId: number, headers: Record<string, string>): Promise<string | undefined> {
    try {
      const response = await fetch(`${this.baseUrl}/download`, { method: 'POST', signal: AbortSignal.timeout(this.timeoutMs), headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ file_id: fileId, sub_format: 'vtt' }) });
      if (!response.ok) return undefined;
      const payload = await response.json() as DownloadResponse;
      return payload.link;
    } catch { return undefined; }
  }
}
