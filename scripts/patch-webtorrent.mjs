import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('node_modules/webtorrent/lib/torrent.js');
if (!fs.existsSync(file)) process.exit(0);
const source = fs.readFileSync(file, 'utf8');
const oldLine = 'this._debugId = arr2hex(parsedTorrent.infoHash).substring(0, 7)';
const newLine = 'this._debugId = arr2hex(parsedTorrent.infoHashBuffer ?? parsedTorrent.infoHash).substring(0, 7)';
if (source.includes(oldLine)) fs.writeFileSync(file, source.replaceAll(oldLine, newLine));
