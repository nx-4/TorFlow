import { FileManifest } from '../types.js';
import { ResolverQuery } from './types.js';
import { isTvProgram } from './tv-program.js';

export interface SubtitleTrack {
  lang: string;
  label: string;
  isDefault: boolean;
  url: string;
  source: 'torrent' | 'opensubtitles';
  fileIndex?: number;
}

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

const AUDIO_FORMAT_RANK: Record<string, number> = {
  '.flac': 100,
  '.alac': 90,
  '.wav': 80,
  '.mp3': 70,
  '.aac': 60,
  '.m4a': 55,
  '.opus': 50,
  '.ogg': 40
};

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

function getAudioRank(filename: string): number {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return AUDIO_FORMAT_RANK[ext] ?? 10;
}

export function selectMediaFile(files: FileManifest[], query: ResolverQuery): FileManifest | undefined {
  if (!files || !files.length) return undefined;

  // Music handling
  if (query.type === 'music') {
    const audioFiles = files.filter((f) => AUDIO_EXT.test(f.name) || f.mimeType?.startsWith('audio/'));
    const candidateFiles = audioFiles.length ? audioFiles : files;

    if (query.track) {
      const trackTarget = query.track.toLowerCase().trim();
      const trackNum = parseInt(trackTarget, 10);
      const isNumeric = !Number.isNaN(trackNum) && String(trackNum) === trackTarget;

      // 1. Exact or bounded title / number match
      const matched = candidateFiles.filter((f) => {
        const nameLower = f.name.toLowerCase();
        if (isNumeric) {
          const numRegex = new RegExp(`(?:^|[^0-9])0*${trackNum}(?:[^0-9]|$)`);
          return numRegex.test(nameLower);
        }
        return nameLower.includes(trackTarget);
      });

      if (matched.length > 0) {
        return matched.sort((a, b) => {
          let scoreA = getAudioRank(a.name);
          let scoreB = getAudioRank(b.name);
          if (query.artist && a.name.toLowerCase().includes(query.artist.toLowerCase())) scoreA += 50;
          if (query.artist && b.name.toLowerCase().includes(query.artist.toLowerCase())) scoreB += 50;
          if (query.album && a.name.toLowerCase().includes(query.album.toLowerCase())) scoreA += 30;
          if (query.album && b.name.toLowerCase().includes(query.album.toLowerCase())) scoreB += 30;
          return scoreB - scoreA || b.size - a.size;
        })[0];
      }

      if (candidateFiles.length > 1) {
        return undefined;
      }
    }

    return [...candidateFiles].sort((a, b) => (getAudioRank(b.name) - getAudioRank(a.name)) || (b.size - a.size))[0];
  }

  // Video / TV Program handling
  const videoFiles = files.filter((f) => VIDEO_EXT.test(f.name) || f.mimeType?.startsWith('video/'));
  const candidatePool = videoFiles.length > 0 ? videoFiles : files.filter((f) => !isSubtitleFile(f));
  if (!candidatePool.length) return undefined;

  const nonSamples = candidatePool.filter((f) => !/(?:^|[._\-\s])sample(?:[._\-\s]|$)/i.test(f.name));
  const activeVideos = nonSamples.length > 0 ? nonSamples : candidatePool;

  // TV program with date
  if ((query.type === 'tv_program' || isTvProgram(query)) && query.date) {
    const parts = query.date.split(/[-./ ]/).filter(Boolean);
    const dateMatch = activeVideos.find((f) => parts.every((p) => f.name.includes(p)));
    if (dateMatch) return dateMatch;
  }

  // Season and episode specified
  if (query.season !== undefined && (query.episode !== undefined || query.part !== undefined)) {
    const s = query.season;
    const ep = query.episode ?? query.part!;

    const seasonEpPatterns = [
      new RegExp(`s0*${s}[._\\-\\s]*e0*${ep}(?![0-9])`, 'i'),
      new RegExp(`(?<![0-9])0*${s}x0*${ep}(?![0-9])`, 'i'),
      new RegExp(`season[._\\-\\s]*0*${s}[._\\-\\s]+episode[._\\-\\s]*0*${ep}(?![0-9])`, 'i')
    ];

    const matched = activeVideos.find((f) => {
      const full = `${f.path ? f.path + ' ' : ''}${f.name}`;
      if (seasonEpPatterns.some((pat) => pat.test(full))) return true;

      const seasonFolder = new RegExp(`(?:^|[\\\\/])(?:season[._\\-\\s]*0*${s}|s0*${s})(?:[\\\\/]|$)`, 'i');
      if (f.path && seasonFolder.test(f.path)) {
        const epInFile = new RegExp(`(?:e|ep|episode)[._\\-\\s]*0*${ep}(?![0-9])`, 'i');
        const standaloneEp = new RegExp(`(?<![0-9])0*${ep}(?![0-9])`, 'i');
        if (epInFile.test(f.name) || standaloneEp.test(f.name)) return true;
      }

      return false;
    });

    if (matched) return matched;
    return undefined;
  }

  // Only episode / part specified
  if (query.episode !== undefined || query.part !== undefined) {
    const ep = query.episode ?? query.part!;
    const epPatterns = [
      new RegExp(`(?:e|ep|episode|part)[._\\-\\s]*0*${ep}(?![0-9])`, 'i'),
      new RegExp(`(?<![0-9])(?:[\\s._\\-]|\\[|\\()0*${ep}(?:[\\s._\\-]|\\]|\\))(?![0-9])`, 'i'),
      new RegExp(`(?<![0-9])0*${ep}(?![0-9])`, 'i')
    ];

    for (const pat of epPatterns) {
      const match = activeVideos.find((f) => pat.test(f.name) || (f.path && pat.test(f.path)));
      if (match) return match;
    }

    return undefined;
  }

  // Movies or general streams: pick the largest video file
  return [...activeVideos].sort((a, b) => b.size - a.size)[0];
}
