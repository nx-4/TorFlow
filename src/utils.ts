import crypto from 'node:crypto';
import path from 'node:path';

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.avi': 'video/x-msvideo', '.mov': 'video/quicktime', '.flv': 'video/x-flv', '.wmv': 'video/x-ms-wmv', '.mpg': 'video/mpeg', '.mpeg': 'video/mpeg', '.3gp': 'video/3gpp', '.ogv': 'video/ogg', '.m2ts': 'video/mp2t',
  '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/opus', '.alac': 'audio/alac',
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
