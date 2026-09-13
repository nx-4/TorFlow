export type Source = { magnet: string } | { torrentBuffer: Buffer };

export interface FileManifest {
  index: number;
  path: string;
  name: string;
  size: number;
  mimeType: string;
  offset: number;
  selected: boolean;
}

export interface TorrentManifest {
  infoHash: string;
  name: string;
  pieceLength: number;
  pieceCount: number;
  files: FileManifest[];
  totalSize: number;
}

export interface StreamStatus {
  streamId: string;
  infoHash: string;
  fileIndex: number;
  phase: 'queued' | 'resolving' | 'buffering' | 'streaming' | 'complete' | 'error';
  progress: number;
  downloaded: number;
  uploaded: number;
  peers: number;
  bufferedBytes: number;
  updatedAt: string;
  error?: string;
}

export interface StreamHandle {
  streamId: string;
  infoHash: string;
  file: FileManifest;
  size: number;
  createReadStream(range?: { start: number; end: number }): NodeJS.ReadableStream;
  status(): StreamStatus;
  destroy(): Promise<void>;
}
