import { ResolverQuery } from './types.js';
import { isTvProgram, cleanTvChannelPrefixes } from './tv-program.js';

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function titleMatches(candidateText: string, requestedTitle: string): boolean {
  const cleanCand = cleanTvChannelPrefixes(candidateText);
  const haystack = normalize(cleanCand);
  const needle = normalize(requestedTitle);

  if (!needle || !haystack) return false;

  if (haystack === needle || haystack.includes(needle)) {
    // Check if needle is followed immediately by a sequel indicator (e.g. "Spider-Man 2" when requested "Spider-Man")
    const idx = haystack.indexOf(needle);
    const after = haystack.slice(idx + needle.length).trim();
    const sequelMatch = after.match(/^(?:part|vol|volume)?\s*([2-9]|ii|iii|iv|v|vi|vii|viii|ix|x)\b/i);
    if (sequelMatch) {
      const reqSequel = needle.match(/\b([2-9]|ii|iii|iv|v|vi|vii|viii|ix|x)$/i);
      if (!reqSequel) return false;
    }
    return true;
  }

  const needleTokens = needle.split(' ').filter(Boolean);
  if (!needleTokens.length) return false;
  return needleTokens.every((token) => haystack.includes(token));
}

export function matchesRequestedContent(query: ResolverQuery, candidateTitle: string, files: Array<{ name?: string; path?: string }> = []): boolean {
  const fileNames = files.flatMap((file) => [file.name, file.path]).filter((v): v is string => Boolean(v));
  const fullText = [candidateTitle, ...fileNames].join(' ');
  const requestedTitle = query.title ?? query.query ?? '';

  if (query.type === 'music') {
    const requestedParts = [query.artist, query.album, query.track, requestedTitle].filter((value): value is string => Boolean(value?.trim()));
    if (requestedParts.length && !requestedParts.some((part) => titleMatches(fullText, part))) return false;
    if (query.artist && !titleMatches(fullText, query.artist) && query.album && !titleMatches(fullText, query.album)) return false;
    if (query.track && !titleMatches(fullText, query.track)) return false;
    return true;
  }

  if (requestedTitle && !titleMatches(fullText, requestedTitle)) {
    return false;
  }

  // TV Programs specific matching
  if (query.type === 'tv_program' || isTvProgram(query)) {
    if (query.date) {
      const dateParts = query.date.split(/[-./ ]/).filter(Boolean);
      if (dateParts.length >= 2) {
        const matchesDate = dateParts.every((part) => fullText.includes(part));
        if (matchesDate) return true;
      }
    }

    if (query.season !== undefined && (query.episode !== undefined || query.part !== undefined)) {
      const s = query.season;
      const ep = query.episode ?? query.part!;

      const seasonEpPatterns = [
        new RegExp(`s0*${s}[._\\-\\s]*e0*${ep}(?![0-9])`, 'i'),
        new RegExp(`(?<![0-9])0*${s}x0*${ep}(?![0-9])`, 'i'),
        new RegExp(`season[._\\-\\s]*0*${s}[._\\-\\s]+episode[._\\-\\s]*0*${ep}(?![0-9])`, 'i')
      ];

      const matchesSpecific = seasonEpPatterns.some((p) => p.test(fullText));
      if (!matchesSpecific) return false;
      return true;
    }

    if (query.episode !== undefined || query.part !== undefined) {
      const ep = query.episode ?? query.part!;
      const epPattern = new RegExp(`(?:e|ep|episode|part|week|auditions)[._\\-\\s]*0*${ep}(?![0-9])`, 'i');
      const standalone = new RegExp(`(?<![0-9])0*${ep}(?![0-9])`, 'i');
      if (!epPattern.test(fullText) && !standalone.test(fullText)) return false;
      return true;
    }
  }

  // Standard series matching
  if (query.type === 'series' || query.season !== undefined || query.episode !== undefined) {
    if (query.season === undefined || query.episode === undefined) return false;
    const s = query.season;
    const ep = query.episode;

    const seasonEpPatterns = [
      new RegExp(`s0*${s}[._\\-\\s]*e0*${ep}(?![0-9])`, 'i'),
      new RegExp(`(?<![0-9])0*${s}x0*${ep}(?![0-9])`, 'i'),
      new RegExp(`season[._\\-\\s]*0*${s}[._\\-\\s]+episode[._\\-\\s]*0*${ep}(?![0-9])`, 'i')
    ];

    const matchesSpecific = seasonEpPatterns.some((p) => p.test(fullText));
    if (!matchesSpecific) return false;
  }

  // Year matching
  if (query.year) {
    const yearPattern = new RegExp(`(?<![0-9])${query.year}(?![0-9])`);
    if (!yearPattern.test(fullText)) return false;
  }

  return true;
}
