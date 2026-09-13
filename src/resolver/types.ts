export interface ResolverQuery {
  title: string;
  year?: number;
  season?: number;
  episode?: number;
  imdb_id?: string;
  tmdb_id?: string;
}

export interface TorrentCandidate {
  magnet: string;
  title: string;
  seeders: number;
  leechers?: number;
  size?: number;
  source?: string;
  indexer?: string;
}

export interface QualityMetadata {
  resolution: '2160p' | '1080p' | '720p' | '480p' | 'unknown';
  videoCodec: 'h264' | 'hevc' | 'av1' | 'vp9' | 'unknown';
  audioCodec: 'aac' | 'mp3' | 'ac3' | 'eac3' | 'opus' | 'unknown';
  score: number;
}

export interface RankedCandidate extends TorrentCandidate {
  quality: QualityMetadata;
  score: number;
}

export interface ResolverResult {
  candidate: RankedCandidate;
  infoHash: string;
  streamId: string;
  streamUrl: string;
  fileIndex: number;
  files: unknown[];
  quality: QualityMetadata;
  audioTracks: string[];
  subtitleTracks: string[];
  attempted: number;
}
