import { FileManifest } from '../types.js';

export interface SubtitleTrack { lang: string; label: string; isDefault: boolean; url: string; source: 'torrent' | 'wyzie'; fileIndex?: number; }
const LANGS: Record<string, { code: string; label: string }> = { ara: { code: 'ara', label: 'العربية' }, ar: { code: 'ara', label: 'العربية' }, arabic: { code: 'ara', label: 'العربية' }, eng: { code: 'eng', label: 'English' }, en: { code: 'eng', label: 'English' }, english: { code: 'eng', label: 'English' }, fre: { code: 'fra', label: 'Français' }, fra: { code: 'fra', label: 'Français' }, fr: { code: 'fra', label: 'Français' }, spa: { code: 'spa', label: 'Español' }, es: { code: 'spa', label: 'Español' }, ger: { code: 'deu', label: 'Deutsch' }, deu: { code: 'deu', label: 'Deutsch' }, de: { code: 'deu', label: 'Deutsch' } };
const SUB_EXT = /\.(srt|vtt|ass)$/i;
export function subtitleLanguage(name: string): { code: string; label: string } | undefined { const tokens = name.toLowerCase().replace(/[._()[\]-]+/g, ' ').split(/\s+/); return tokens.map((token) => LANGS[token]).find(Boolean) ?? undefined; }
export function selectSubtitleFiles(files: FileManifest[]): Array<{ file: FileManifest; lang: string; label: string }> { return files.filter((file) => SUB_EXT.test(file.name)).map((file) => { const lang = subtitleLanguage(file.name) ?? { code: 'und', label: 'Unknown' }; return { file, lang: lang.code, label: lang.label }; }).sort((a, b) => Number(b.lang === 'ara') - Number(a.lang === 'ara'));
}
export function isSubtitleFile(file: FileManifest): boolean { return SUB_EXT.test(file.name); }
