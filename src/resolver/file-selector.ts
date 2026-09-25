import { FileManifest } from '../types.js';

export interface SubtitleTrack { lang: string; label: string; isDefault: boolean; url: string; source: 'torrent' | 'opensubtitles'; fileIndex?: number; }
const LANGS: Record<string, { code: string; label: string }> = { ara: { code: 'ara', label: 'العربية' }, ar: { code: 'ara', label: 'العربية' }, arabic: { code: 'ara', label: 'العربية' }, eng: { code: 'eng', label: 'English' }, en: { code: 'eng', label: 'English' }, english: { code: 'eng', label: 'English' }, fre: { code: 'fra', label: 'Français' }, fra: { code: 'fra', label: 'Français' }, fr: { code: 'fra', label: 'Français' }, spa: { code: 'spa', label: 'Español' }, es: { code: 'spa', label: 'Español' }, ger: { code: 'deu', label: 'Deutsch' }, deu: { code: 'deu', label: 'Deutsch' }, de: { code: 'deu', label: 'Deutsch' } };
const SUB_EXT = /\.(srt|vtt|ass)$/i;
export function subtitleLanguage(name: string): { code: string; label: string } | undefined { const tokens = name.toLowerCase().replace(/[._()[\]-]+/g, ' ').split(/\s+/); return tokens.map((token) => LANGS[token]).find(Boolean) ?? undefined; }
export function selectSubtitleFiles(files: FileManifest[]): Array<{ file: FileManifest; lang: string; label: string }> { return files.filter((file) => SUB_EXT.test(file.name)).map((file) => { const lang = subtitleLanguage(file.name) ?? { code: 'und', label: 'Unknown' }; return { file, lang: lang.code, label: lang.label }; }).sort((a, b) => Number(b.lang === 'ara') - Number(a.lang === 'ara'));
}
export function isSubtitleFile(file: FileManifest): boolean { return SUB_EXT.test(file.name); }

const VIDEO_EXT = /\.(mp4|m4v|mkv|webm|avi|mov|flv|wmv|mpg|mpeg|3gp|ogv|ts|m2ts)$/i;
const AUDIO_EXT = /\.(mp3|flac|m4a|aac|wav|ogg|opus|alac)$/i;
const SAMPLE_PATTERN = /\bsample\b/i;
const EXTRAS_PATTERN = /\b(trailer|extras?|featurette|behind[ .-]?the[ .-]?scenes|deleted[ .-]?scenes|bonus|opening|ending|nc(?:op|ed)|preview|interview)\b/i;

function isVideoFile(file: FileManifest): boolean { return Boolean(file.mimeType?.startsWith('video/')) || VIDEO_EXT.test(file.name); }
function isAudioFile(file: FileManifest): boolean { return Boolean(file.mimeType?.startsWith('audio/')) || AUDIO_EXT.test(file.name); }
function isJunkFile(file: FileManifest): boolean { return SAMPLE_PATTERN.test(file.name) || EXTRAS_PATTERN.test(file.name); }

/** Filters candidates down to real (non-sample, non-extra) media files when possible, without dropping the only options available. */
function preferSubstantiveFiles(files: FileManifest[]): FileManifest[] {
  if (!files.length) return files;
  const clean = files.filter((file) => !isJunkFile(file));
  return clean.length ? clean : files;
}

function seasonEpisodePatterns(season: number, episode: number): RegExp[] {
  const s = String(season);
  const e = String(episode);
  return [
    new RegExp(`s0?${s}e0?${e}(?:[^0-9]|$)`, 'i'),
    new RegExp(`${s}x0?${e}(?:[^0-9]|$)`, 'i'),
    new RegExp(`(?:^|[^0-9a-z])(?:e|ep|episode)[ ._-]?0?${e}(?:v\\d)?(?:[^0-9]|$)`, 'i'),
    new RegExp(`(?:^|[^0-9a-z])0?${e}(?:v\\d)?(?:[^0-9a-z]|$)`, 'i'),
  ];
}

/**
 * Picks the video file that actually corresponds to the requested content out of a torrent's
 * file list. For single-file (or single-video-file) torrents this is unambiguous. For multi-file
 * torrents (season packs, batches) it requires an exact season/episode match in the filename
 * rather than guessing, so an episode is never served under another episode's title.
 */
export function selectVideoFile(files: FileManifest[], query: { season?: number; episode?: number } = {}): FileManifest | undefined {
  const videoFiles = files.filter(isVideoFile);
  const pool = preferSubstantiveFiles(videoFiles.length ? videoFiles : files.filter((file) => !isSubtitleFile(file)));
  if (!pool.length) return undefined;
  if (pool.length === 1) return pool[0];

  if (query.season !== undefined && query.episode !== undefined) {
    const patterns = seasonEpisodePatterns(query.season, query.episode);
    for (const pattern of patterns) {
      const matches = pool.filter((file) => pattern.test(file.name) || pattern.test(file.path));
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) return matches.slice().sort((a, b) => b.size - a.size)[0];
    }
    return undefined;
  }

  return pool.slice().sort((a, b) => b.size - a.size)[0];
}

/** Picks the audio file for music queries, preferring the largest non-sample track when several exist. */
export function selectAudioFile(files: FileManifest[]): FileManifest | undefined {
  const audioFiles = files.filter(isAudioFile);
  const pool = preferSubstantiveFiles(audioFiles);
  if (!pool.length) return undefined;
  return pool.slice().sort((a, b) => b.size - a.size)[0];
}
