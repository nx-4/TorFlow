declare module 'webtorrent' {
  class WebTorrent {
    add(source: unknown, callback?: (torrent: unknown) => void): unknown;
    destroy(callback?: (error?: Error) => void): void;
  }
  export default WebTorrent;
}
