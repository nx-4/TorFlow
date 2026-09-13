import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import WebTorrent from 'webtorrent';
import { FileManifest, Source, StreamHandle, StreamStatus, TorrentManifest } from '../types.js';
import { mimeType, randomId } from '../utils.js';
import { prioritizePieces } from './piece-prioritizer.js';
import { parseMagnet } from './metadata-resolver.js';

type WebTorrentFile = { name: string; path: string; length: number; offset?: number; createReadStream: (options?: { start?: number; end?: number }) => NodeJS.ReadableStream };
type WebTorrentTorrent = { infoHash: string; name: string; pieceLength: number; pieces: string[]; files: WebTorrentFile[]; downloaded: number; uploaded: number; numPeers: number; progress: number; select: (start: number, end: number, priority?: number) => void; deselect: (start: number, end: number, priority?: number) => void; destroy: (callback?: (error?: Error) => void) => void; on?: (event: string, listener: (error: Error) => void) => void };
type WebTorrentClient = { add: (source: unknown, callback?: (torrent: WebTorrentTorrent) => void) => WebTorrentTorrent; destroy: (callback?: (error?: Error) => void) => void; on?: (event: string, listener: (error: Error) => void) => void; off?: (event: string, listener: (error: Error) => void) => void };

export class TorrentEngine extends EventEmitter {
  private manifests = new Map<string, TorrentManifest>();
  private streams = new Map<string, StreamStatus>();
  private torrents = new Map<string, WebTorrentTorrent>();
  private client: WebTorrentClient;

  constructor(client?: WebTorrentClient) {
    super();
    this.client = client ?? (new WebTorrent() as unknown as WebTorrentClient);
  }

  async inspect(source: Source): Promise<TorrentManifest> {
    return this.registerManifest(source);
  }

  /** Connects to the live swarm, waits for metadata, and registers physical files. */
  async registerManifest(source: Source): Promise<TorrentManifest> {
    const torrentSource = 'torrentBuffer' in source ? source.torrentBuffer : source.magnet;
    if ('magnet' in source) parseMagnet(source.magnet);
    return new Promise((resolve, reject) => {
      let settled = false;
      let activeTorrent: WebTorrentTorrent | undefined;
      const clientError = (error: Error) => finish(error);
      const timer = setTimeout(() => {
        try { activeTorrent?.destroy(); } catch { /* cleanup must not mask the timeout */ }
        finish(new Error('WebTorrent metadata timeout: no metadata received from the swarm'));
      }, 5000);
      const finish = (error?: Error, torrent?: WebTorrentTorrent) => {
        if (settled) return;
        clearTimeout(timer);
        this.client.off?.('error', clientError);
        if (error || !torrent) { settled = true; reject(error ?? new Error('WebTorrent did not return metadata')); return; }
        const files: FileManifest[] = torrent.files.map((file, index) => ({
          index, path: file.path || file.name, name: file.name, size: file.length,
          mimeType: mimeType(file.name),
          offset: torrent.files.slice(0, index).reduce((sum, item) => sum + item.length, 0), selected: false,
        }));
        const manifest: TorrentManifest = { infoHash: torrent.infoHash, name: torrent.name, pieceLength: torrent.pieceLength, pieceCount: torrent.pieces.length, files, totalSize: files.reduce((sum, file) => sum + file.size, 0) };
        this.manifests.set(manifest.infoHash, manifest);
        this.torrents.set(manifest.infoHash, torrent);
        settled = true;
        resolve(manifest);
      };
      try {
        this.client.on?.('error', clientError);
        activeTorrent = this.client.add(torrentSource, (ready) => finish(undefined, ready));
        activeTorrent?.on?.('error', (error) => finish(error));
        if (activeTorrent?.files?.length) finish(undefined, activeTorrent);
      } catch (error) { finish(error as Error); }
    });
  }

  registerParsedManifest(manifest: TorrentManifest): void { this.manifests.set(manifest.infoHash, manifest); }
  getManifest(infoHash: string): TorrentManifest | undefined { return this.manifests.get(infoHash); }

  async waitForPeers(infoHash: string, timeoutMs = 5000): Promise<void> {
    const torrent = this.torrents.get(infoHash);
    if (!torrent) return;
    const deadline = Date.now() + timeoutMs;
    while (torrent.numPeers < 1 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
    if (torrent.numPeers < 1) throw new Error('No active peers available');
  }

  async openStream(infoHash: string, fileIndex: number): Promise<StreamHandle> {
    const manifest = this.manifests.get(infoHash);
    if (!manifest) throw new Error('Torrent metadata is not loaded');
    const file = manifest.files[fileIndex];
    if (!file) throw new Error('File index is out of range');
    const torrent = this.torrents.get(infoHash);
    const streamId = randomId('stream');
    const status: StreamStatus = { streamId, infoHash, fileIndex, phase: 'buffering', progress: 0, downloaded: 0, uploaded: 0, peers: torrent?.numPeers ?? 0, bufferedBytes: 0, updatedAt: new Date().toISOString() };
    this.streams.set(streamId, status);
    const sourceFile = torrent?.files[fileIndex];
    if (torrent) {
      const first = Math.floor(file.offset / manifest.pieceLength);
      const last = Math.ceil((file.offset + file.size) / manifest.pieceLength) - 1;
      torrent.deselect(0, Math.max(0, torrent.pieces.length - 1), 0);
      for (const piece of prioritizePieces(torrent.pieces.length, manifest.pieceLength, file.offset)) torrent.select(piece, piece, 10);
      status.phase = 'buffering';
      status.updatedAt = new Date().toISOString();
      void first; void last;
    }
    const handle: StreamHandle = {
      streamId, infoHash, file, size: file.size,
      createReadStream: (range) => sourceFile ? sourceFile.createReadStream(range) : this.createTestReadable(streamId, file, range),
      status: () => ({ ...this.streams.get(streamId)! }),
      destroy: async () => { this.streams.delete(streamId); },
    };
    return handle;
  }

  private createTestReadable(streamId: string, file: FileManifest, range?: { start: number; end: number }): NodeJS.ReadableStream {
    const start = range?.start ?? 0; const end = Math.min(range?.end ?? file.size - 1, file.size - 1); const total = Math.max(0, end - start + 1); let sent = 0;
    const readable = new Readable({ read: () => { if (sent >= total) { readable.push(null); return; } const chunk = Buffer.alloc(Math.min(64 * 1024, total - sent)); sent += chunk.length; const status = this.streams.get(streamId); if (status) { status.phase = sent === total ? 'complete' : 'streaming'; status.downloaded = sent; status.progress = total ? sent / total : 1; status.bufferedBytes = Math.max(0, total - sent); status.updatedAt = new Date().toISOString(); this.emit('status', { ...status }); } readable.push(chunk); } });
    return readable;
  }

  getStatus(streamId: string): StreamStatus | undefined { return this.streams.get(streamId) ? { ...this.streams.get(streamId)! } : undefined; }
  async destroy(): Promise<void> { await new Promise<void>((resolve) => this.client.destroy(() => resolve())); }
}
