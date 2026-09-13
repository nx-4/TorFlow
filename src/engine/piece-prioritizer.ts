export interface PiecePriorityOptions { lookAhead?: number; headerPieces?: number; }

/**
 * Playback-first ordering: header pieces, then a contiguous window from the
 * requested offset, followed by the remaining pieces. This keeps startup
 * latency low while still allowing the swarm to fill in the tail.
 */
export function prioritizePieces(pieceCount: number, pieceLength: number, startOffset = 0, options: PiecePriorityOptions = {}): number[] {
  const lookAhead = options.lookAhead ?? 32;
  const headerPieces = Math.min(options.headerPieces ?? 2, pieceCount);
  const start = Math.max(0, Math.min(pieceCount - 1, Math.floor(startOffset / pieceLength)));
  const ordered: number[] = [];
  const add = (piece: number) => { if (piece >= 0 && piece < pieceCount && !ordered.includes(piece)) ordered.push(piece); };
  for (let i = 0; i < headerPieces; i++) add(i);
  for (let i = start; i < Math.min(pieceCount, start + lookAhead); i++) add(i);
  for (let i = 0; i < pieceCount; i++) add(i);
  return ordered;
}
