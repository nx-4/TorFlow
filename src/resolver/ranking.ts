import { QualityMetadata, RankedCandidate, ResolverQuery, TorrentCandidate } from './types.js';

const resolutionScore: Record<QualityMetadata['resolution'], number> = { '2160p': 40, '1080p': 32, '720p': 22, '480p': 10, unknown: 0 };
const codecScore: Record<QualityMetadata['videoCodec'], number> = { h264: 30, hevc: 16, vp9: 10, av1: 5, unknown: 0 };
const audioScore: Record<QualityMetadata['audioCodec'], number> = { aac: 12, mp3: 10, ac3: 8, eac3: 6, opus: 4, unknown: 0 };

export function parseQuality(title: string): QualityMetadata {
  const normalized = title.toLowerCase();
  const resolution = normalized.includes('2160p') || normalized.includes('4k') ? '2160p' : normalized.includes('1080p') ? '1080p' : normalized.includes('720p') ? '720p' : normalized.includes('480p') ? '480p' : 'unknown';
  const videoCodec = normalized.includes('h264') || normalized.includes('h.264') || normalized.includes('x264') ? 'h264' : normalized.includes('hevc') || normalized.includes('h265') || normalized.includes('x265') ? 'hevc' : normalized.includes('av1') ? 'av1' : normalized.includes('vp9') ? 'vp9' : 'unknown';
  const audioCodec = normalized.includes('eac3') || normalized.includes('ddp') ? 'eac3' : normalized.includes('ac3') || normalized.includes('dd5') ? 'ac3' : normalized.includes('aac') ? 'aac' : normalized.includes('mp3') ? 'mp3' : normalized.includes('opus') ? 'opus' : 'unknown';
  return { resolution, videoCodec, audioCodec, score: resolutionScore[resolution] + codecScore[videoCodec] + audioScore[audioCodec] };
}

export function queryText(query: ResolverQuery): string {
  const parts = [query.title.trim(), query.year, query.season !== undefined ? `S${String(query.season).padStart(2, '0')}` : undefined, query.episode !== undefined ? `E${String(query.episode).padStart(2, '0')}` : undefined, query.imdb_id, query.tmdb_id];
  return parts.filter(Boolean).join(' ');
}

export function rankCandidates(candidates: TorrentCandidate[], query?: ResolverQuery): RankedCandidate[] {
  void query;
  return candidates.filter((candidate) => candidate.magnet.startsWith('magnet:?') && Number(candidate.seeders) >= 5).map((candidate) => {
    const quality = parseQuality(candidate.title);
    const seedScore = Math.min(100, Math.log10(candidate.seeders + 1) * 45);
    return { ...candidate, seeders: Number(candidate.seeders), quality, score: Number((seedScore + quality.score).toFixed(3)) };
  }).sort((a, b) => b.score - a.score || b.seeders - a.seeders);
}
