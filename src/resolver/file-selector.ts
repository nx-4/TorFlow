import { FileManifest } from '../types.js';
import { ResolverQuery } from './types.js';

export interface SubtitleTrack { lang: string; label: string; isDefault: boolean; url: string; source: 'torrent' | 'opensubtitles'; fileIndex?: number; }
const LANGS: Record<string, { code: string; label: string }> = {
  ara: { code: 'ara', label: 'العربية' }, ar: { code: 'ara', label: 'العربية' }, arabic: { code: 'ara', label: 'العربية' },
  eng: { code: 'eng', label: 'English' }, en: { code: 'eng', label: 'English' }, english: { code: 'eng', label: 'English' },
  fre: { code: 'fra', label: 'Français' }, fra: { code: 'fra', label: 'Français' }, fr: { code: 'fra', label: 'Français' },
  spa: { code: 'spa', label: 'Español' }, es: { code: 'spa', label: 'Español' },
  ger: { code: 'deu', label: 'Deutsch' }, deu: { code: 'deu', label: 'Deutsch' }, de: { code: 'deu', label: 'Deutsch' }
};

const SUB_EXT = /\.(srt|vtt|ass|ssa)$/i;
const AUDIO_EXT = /\.(mp3|flac|m4a|aac|wav|ogg|opus|alac)$/i;
const VIDEO_EXT = /\.(mp4|mkv|webm|avi|mov|m4v|ts|flv)$/i;

export function subtitleLanguage(name: string): { code: string; label: string } | undefined {
  const tokens = name.toLowerCase().replace(/[._()[\]-]+/g, ' ').split(/\s+/);
  return tokens.map((token) => LANGS[token]).find(Boolean) ?? undefined;
}

export function selectSubtitleFiles(files: FileManifest[]): Array<{ file: FileManifest; lang: string; label: string }> {
  return files
    .filter((file) => SUB_EXT.test(file.name))
    .map((file) => {
      const lang = subtitleLanguage(file.name) ?? { code: 'und', label: 'Unknown' };
      return { file, lang: lang.code, label: lang.label };
    })
    .sort((a, b) => Number(b.lang === 'ara') - Number(a.lang === 'ara'));
}

export function isSubtitleFile(file: FileManifest): boolean {
  return SUB_EXT.test(file.name);
}

export function selectMediaFile(files: FileManifest[], query: ResolverQuery): FileManifest | undefined {
  if (!files || !files.length) return undefined;

  if (query.type === 'music') {
    const audioFiles = files.filter((f) => AUDIO_EXT.test(f.name) || f.mimeType?.startsWith('audio/'));
    if (!audioFiles.length) return files[0];
    if (query.track) {
      const trackTarget = query.track.toLowerCase().trim();
      const matched = audioFiles.find((f) => f.name.toLowerCase().includes(trackTarget));
      if (matched) return matched;
    }
    return [...audioFiles].sort((a, b) => b.size - a.size)[0];
  }

  const videoFiles = files.filter((f) => VIDEO_EXT.test(f.name) || f.mimeType?.startsWith('video/'));
  if (!videoFiles.length) {
    // If no explicit video extension, check if audio or return largest file
    const mediaFiles = files.filter((f) => f.mimeType?.startsWith('video/') || f.mimeType?.startsWith('audio/'));
    return (mediaFiles.length ? mediaFiles : files).sort((a, b) => b.size - a.size)[0];
  }

  // If specific episode requested (series, anime series, cartoon series)
  if (query.episode !== undefined) {
    const ep = String(query.episode);
    const season = query.season !== undefined ? String(query.season) : undefined;

    const patterns: RegExp[] = [];
    if (season) {
      patterns.push(new RegExp(`s0?${season}[._\\-\s]*e0?${ep}(?:[^0-9]|$)`, 'i'));
      patterns.push(new RegExp(`(?:^|[^0-9])0?${season}x0?${ep}(?:[^0-9]|$)`, 'i'));
      patterns.push(new RegExp(`season[._\-\s]*0?${season}[._\-\s]+episode[._\-\s]*0?${ep}(?:[^0-9]|$)`, 'i'));
    }
    patterns.push(new RegExp(`(?:e|ep|episode)[._\\-\s]*0?${ep}(?:[^0-9]|$)`, 'i'));
    patterns.push(new RegExp(`(?:[\\s._\-]|\\[|\\()0?${ep}(?:[\\s._\-]|\\]|\\))`, 'i'));

    for (const pat of patterns) {
      const match = videoFiles.find((f) => pat.test(f.name) || (f.path && pat.test(f.path)));
      if (match) return match;
    }
  }

  // Filter out sample clips if main content video files exist
  const nonSamples = videoFiles.filter((f) => !/(?:^|[._\-\s])sample(?:[._\-\s]|$)/i.test(f.name));
  const pool = nonSamples.length > 0 ? nonSamples : videoFiles;

  // For movies or general streams, pick the largest video file
  return [...pool].sort((a, b) => b.size - a.size)[0];
}
