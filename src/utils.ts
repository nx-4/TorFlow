import crypto from 'node:crypto';
import path from 'node:path';

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav',
  '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t',
};

export function mimeType(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

export function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
}

export function sha256(value: Buffer | string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
