// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { PuzzleGameId } from '@/core/gameIds';

/**
 * Sprint 2.13 — the Puzzles subject's games, in picker order. A puzzle is a
 * game with its own setup screen (no challenge, Game Select or Difficulty).
 *
 * A `PuzzleId` is not a `GameId`: a puzzle that isn't built yet (Pattern
 * Train) is listed here as "Coming soon" without needing a row in every
 * per-game map. A built one names its game (`gameId`).
 */
export type PuzzleId = 'pair-pals' | 'pattern-train';

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
  { id: 'pattern-train', label: 'Pattern Train', blurb: 'Coming soon', gameId: null },
];

export function puzzleById(id: PuzzleId): Puzzle {
  const puzzle = PUZZLES.find((p) => p.id === id);
  if (puzzle === undefined) throw new Error(`Unknown puzzle "${id}"`);
  return puzzle;
}
