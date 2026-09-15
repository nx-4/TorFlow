import { ResolverQuery } from './types.js';

export interface HlsResult { sourceType: 'hls'; streamUrl: string; subtitles: []; quality: { resolution: 'unknown'; videoCodec: 'unknown'; audioCodec: 'unknown'; score: 0 }; fileIndex?: number; streamId?: string; infoHash?: string; }

export class HlsSource {
  constructor(private readonly enabled = process.env.HLS_ENABLED === 'true') {}
  resolve(query: ResolverQuery): HlsResult | undefined {
    if (!this.enabled || query.preferredSource !== 'hls' || !query.hlsUrl) return undefined;
    let url: URL;
    try { url = new URL(query.hlsUrl); } catch { return undefined; }
    if (url.protocol !== 'https:' || !url.pathname.toLowerCase().endsWith('.m3u8')) return undefined;
    return { sourceType: 'hls', streamUrl: url.toString(), subtitles: [], quality: { resolution: 'unknown', videoCodec: 'unknown', audioCodec: 'unknown', score: 0 } };
  }
}
