import { ResolverQuery } from './types.js';
import { cleanQueryTerm, queryText } from './ranking.js';

const TV_PATTERNS = [
  /\bthe voice\b/i,
  /\bthe voice kids\b/i,
  /\bgot talent\b/i,
  /\bmasterchef\b/i,
  /\bsurvivor\b/i,
  /\bbig brother\b/i,
  /\bamerican idol\b/i,
  /\bx factor\b/i,
  /\btop gear\b/i,
  /\bgrand tour\b/i,
  /\bshark tank\b/i,
  /\bdrag race\b/i,
  /\bdancing with the stars\b/i,
  /\bstrictly come dancing\b/i,
  /\bthe tonight show\b/i,
  /\blate night\b/i,
  /\bdaily show\b/i,
  /\blast week tonight\b/i,
  /\bhell['\\s]?s kitchen\b/i,
  /\bbake off\b/i,
  /\bgreat british baking\b/i,
  /\blove island\b/i,
  /\bthe bachelor\b/i,
  /\bthe bachelorette\b/i,
  /\bmasked singer\b/i,
  /\bبرنامج\b/i,
  /\bذا فويس\b/i,
  /\bاراب كاستينج\b/i,
  /\bاراب غوت تالنت\b/i,
  /\bسيرفايفر\b/i
];

const CHANNEL_PREFIXES = /^(?:\[?(?:bbc|nbc|mbc|itv|cbs|abc|fox|hbo|netflix|discovery|tlc|hgtv|mtv|e!|channel\s*4|channel\s*5)\]?[\s._\-]+)/i;

export function isTvProgram(query: ResolverQuery): boolean {
  if (query.type === 'tv_program') return true;
  const raw = `${query.title ?? ''} ${query.query ?? ''}`;
  return TV_PATTERNS.some((pat) => pat.test(raw));
}

export function cleanTvChannelPrefixes(text: string): string {
  return text.replace(CHANNEL_PREFIXES, '').trim();
}

export function tvProgramQueryVariants(query: ResolverQuery): string[] {
  const base = cleanQueryTerm(query.title ?? query.query ?? '') || (query.title ?? query.query ?? '');
  const variants: string[] = [];

  const networkStr = query.network ? ` ${cleanQueryTerm(query.network)}` : '';
  const countryStr = query.country ? ` ${cleanQueryTerm(query.country)}` : '';

  // Base combinations
  const showBases = [base];
  if (countryStr) showBases.push(`${base}${countryStr}`);
  if (networkStr) showBases.push(`${base}${networkStr}`);

  for (const b of showBases) {
    if (query.season !== undefined && query.episode !== undefined) {
      const s = query.season;
      const e = query.episode;
      const sPadded = String(s).padStart(2, '0');
      const ePadded = String(e).padStart(2, '0');

      variants.push(`${b} S${sPadded}E${ePadded}`);
      variants.push(`${b} S${s} E${e}`);
      variants.push(`${b} Season ${s} Episode ${e}`);
      variants.push(`${b} ${s}x${ePadded}`);
      variants.push(`${b} Episode ${e}`);
      variants.push(`${b} S${sPadded}`); // season pack
    } else if (query.episode !== undefined) {
      variants.push(`${b} Episode ${query.episode}`);
      variants.push(`${b} E${String(query.episode).padStart(2, '0')}`);
      variants.push(`${b} Part ${query.episode}`);
    } else if (query.part !== undefined) {
      variants.push(`${b} Part ${query.part}`);
      variants.push(`${b} Episode ${query.part}`);
    }

    if (query.date) {
      const cleanDate = query.date.replace(/[^0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      variants.push(`${b} ${cleanDate}`);
      variants.push(`${b} ${query.date.replace(/\-/g, '.')}`);
    }

    if (query.year) {
      variants.push(`${b} ${query.year}`);
    }

    variants.push(b);
  }

  return [...new Set(variants.filter(Boolean))];
}
