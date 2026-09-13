import bencode from 'bencode';
import crypto from 'node:crypto';
import path from 'node:path';
import { FileManifest, Source, TorrentManifest } from '../types.js';
import { mimeType } from '../utils.js';

type TorrentDict = { announce?: unknown; info?: { name?: Buffer; 'piece length'?: number; pieces?: Buffer; length?: number; files?: Array<{ path?: Buffer[]; length?: number }> } };

function text(value: unknown): string { return Buffer.isBuffer(value) ? value.toString('utf8') : String(value ?? ''); }

function decodeBase32(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let current = 0;
  const bytes: number[] = [];
  for (const character of value.toUpperCase().replace(/=+$/, '')) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error('Invalid base32 info hash');
    current = (current << 5) | digit;
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((current >> bits) & 0xff); }
  }
  return Buffer.from(bytes);
}

export function parseMagnet(magnet: string): { infoHash: string; name?: string } {
  if (!magnet.startsWith('magnet:?')) throw new Error('Invalid magnet URI');
  const params = new URL(magnet).searchParams;
  const xt = params.get('xt') ?? '';
  const match = xt.match(/^urn:btih:([a-zA-Z0-9]+)$/);
  if (!match) throw new Error('Magnet URI must include an urn:btih identifier');
  const raw = match[1] ?? '';
  if (/^0+$/.test(raw)) throw new Error('Invalid magnet info hash');
  const infoHash = /^[a-fA-F0-9]{40}$/.test(raw) ? raw.toLowerCase() : decodeBase32(raw).toString('hex');
  return { infoHash, name: params.get('dn') ?? undefined };
}

export function parseTorrent(buffer: Buffer): TorrentManifest {
  const decoded = bencode.decode(buffer) as TorrentDict;
  if (!decoded.info) throw new Error('Torrent metadata does not contain an info dictionary');
  const info = decoded.info;
  const name = text(info.name) || 'unnamed-torrent';
  const pieceLength = Number(info['piece length'] ?? 0);
  if (!pieceLength) throw new Error('Torrent metadata has no valid piece length');
  const rawFiles = info.files?.length ? info.files : [{ length: Number(info.length ?? 0), path: [Buffer.from(name)] }];
  let offset = 0;
  const files: FileManifest[] = rawFiles.map((file, index) => {
    const filePath = (file.path ?? []).map(text).join('/');
    const size = Number(file.length ?? 0);
    const result: FileManifest = { index, path: filePath, name: path.basename(filePath), size, mimeType: mimeType(filePath), offset, selected: false };
    offset += size;
    return result;
  });
  const pieces = info.pieces?.length ? Math.ceil(info.pieces.length / 20) : Math.ceil(offset / pieceLength);
  const infoHash = crypto.createHash('sha1').update(bencode.encode(info)).digest('hex');
  return { infoHash, name, pieceLength, pieceCount: pieces, files, totalSize: offset };
}

export async function resolveSource(source: Source, fetchMagnet: (magnet: string) => Promise<TorrentManifest>): Promise<TorrentManifest> {
  return 'torrentBuffer' in source ? parseTorrent(source.torrentBuffer) : fetchMagnet(source.magnet);
}
