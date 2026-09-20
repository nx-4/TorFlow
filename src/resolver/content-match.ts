import { ResolverQuery } from './types.js';

function normalize(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function titleMatches(text: string, requested: string): boolean { const haystack = normalize(text); const needle = normalize(requested); return Boolean(needle) && (haystack.includes(needle) || needle.split(' ').filter(Boolean).every((token) => haystack.includes(token)));
}
export function matchesRequestedContent(query: ResolverQuery, candidateTitle: string, files: Array<{ name?: string; path?: string }> = []): boolean {
  const text = [candidateTitle, ...files.flatMap((file) => [file.name, file.path])].filter((value): value is string => Boolean(value)).join(' ');
  const requestedTitle = query.title ?? query.query ?? '';
  if (query.type === 'music') {
    const requestedParts = [query.artist, query.album, query.track, requestedTitle].filter((value): value is string => Boolean(value?.trim()));
    if (requestedParts.length && !requestedParts.some((part) => titleMatches(text, part))) return false;
    if (query.artist && !titleMatches(text, query.artist) && query.album && !titleMatches(text, query.album)) return false;
    if (query.track && !titleMatches(text, query.track)) return false;
    return true;
  }
  if (requestedTitle && !titleMatches(text, requestedTitle)) return false;
  if (query.type === 'series' || query.season !== undefined || query.episode !== undefined) {
    if (query.season === undefined || query.episode === undefined) return false;
    const season = String(query.season); const episode = String(query.episode);
    const seasonPattern = new RegExp(`(?:s|season\\s*)0?${season}(?:e|\\s|[^0-9])`, 'i');
    const episodePattern = new RegExp(`(?:e|episode\\s*)0?${episode}(?:[^0-9]|$)`, 'i');
    const compactPattern = new RegExp(`s0?${season}e0?${episode}`, 'i');
    if (!(compactPattern.test(text) || (seasonPattern.test(text) && episodePattern.test(text)))) return false;
  }
  if (query.year && !new RegExp(`(?:^|[^0-9])${query.year}(?:[^0-9]|$)`).test(text)) return false;
  return true;
}
