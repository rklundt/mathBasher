// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { PuzzleGameId } from '@/core/gameIds';

/**
 * Sprint 2.13 — the Puzzles subject's games, in picker order. A puzzle is a
 * game with its own setup screen (no challenge, Game Select or Difficulty).
 * Sprint 2.14 added the puzzle pack (one puzzle per family of question on
 * children's ability tests).
 *
 * A `PuzzleId` is not a `GameId`: a puzzle that isn't built yet can be
 * listed as "Coming soon" (`gameId: null`) without a row in every per-game
 * map. A built one names its game (`gameId`).
 */
export type PuzzleId = PuzzleGameId;

export interface Puzzle {
  readonly id: PuzzleId;
  /** The tile's name on the picker. */
  readonly label: string;
  /** The tile's line under the name. */
  readonly blurb: string;
  /** The game it starts, or null while it's still coming. */
  readonly gameId: PuzzleGameId | null;
}

export const PUZZLES: readonly Puzzle[] = [
  { id: 'pair-pals', label: 'Pair Pals', blurb: 'Find the matching pairs!', gameId: 'pair-pals' },
  { id: 'pattern-train', label: 'Pattern Train', blurb: 'What comes next?', gameId: 'pattern-train' },
  { id: 'missing-piece', label: 'Missing Piece', blurb: 'Which piece fits?', gameId: 'missing-piece' },
  { id: 'odd-one-out', label: 'Odd One Out', blurb: 'Spot the different one!', gameId: 'odd-one-out' },
  { id: 'magic-wand', label: 'Magic Wand', blurb: 'Make the same change!', gameId: 'magic-wand' },
  { id: 'spin-match', label: 'Spin Match', blurb: 'Same shape, just spun?', gameId: 'spin-match' },
  { id: 'copy-cat', label: 'Copy Cat', blurb: 'Watch, then copy!', gameId: 'copy-cat' },
  { id: 'symbol-hunt', label: 'Symbol Hunt', blurb: 'Find them all, fast!', gameId: 'symbol-hunt' },
];

export function puzzleById(id: PuzzleId): Puzzle {
  const puzzle = PUZZLES.find((p) => p.id === id);
  if (puzzle === undefined) throw new Error(`Unknown puzzle "${id}"`);
  return puzzle;
}
