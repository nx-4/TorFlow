import { randomId } from '../utils.js';
import { QualityMetadata, RankedCandidate, ResolverQuery, ResolverResult } from './types.js';
import { parseQuality } from './ranking.js';

export interface EmbedFallback { resolve(query: ResolverQuery): Promise<Omit<ResolverResult, 'attempted'> | undefined>; }

export class PublicEmbedFallback implements EmbedFallback {
  constructor(private readonly enabled = true) {}
  async resolve(query: ResolverQuery): Promise<Omit<ResolverResult, 'attempted'> | undefined> {
    if (!this.enabled || query.type === 'music' || (!query.imdb_id && !query.tmdb_id)) return undefined;
    const id = query.imdb_id ?? `tmdb-${query.tmdb_id}`;
    const streamUrl = query.season !== undefined || query.episode !== undefined
      ? `https://vidsrc.to/embed/tv/${encodeURIComponent(id)}/${query.season ?? 1}/${query.episode ?? 1}`
      : `https://vidsrc.to/embed/movie/${encodeURIComponent(id)}`;
    const candidate: RankedCandidate = { magnet: '', title: query.title ?? query.query ?? id, seeders: 0, source: 'public-embed', quality: parseQuality(query.title ?? query.query ?? ''), score: 0 };
    return { sourceType: 'embed', candidate, infoHash: '', streamId: randomId('embed'), streamUrl, fileIndex: -1, files: [], quality: candidate.quality, audioTracks: [], subtitleTracks: [] };
  }
}
