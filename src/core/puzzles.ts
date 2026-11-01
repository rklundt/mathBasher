// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { PuzzleGameId } from '@/core/gameIds';

/**
 * Sprint 2.13 — the Puzzles subject's games, in picker order. A puzzle is a
 * game with its own setup screen (no math type or speed).
 * Sprint 2.14 added the puzzle pack (one puzzle per family of question on
 * children's ability tests); sprint 2.16 the Words and Numbers puzzles
 * (which group each is in: `core/gameGroups.ts`).
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
  /** The tile's line under the name (sprint 2.15: the livelier wording from the wireframes). */
  readonly blurb: string;
  /** The game it starts, or null while it's still coming. */
  readonly gameId: PuzzleGameId | null;
}

export const PUZZLES: readonly Puzzle[] = [
  { id: 'pair-pals', label: 'Pair Pals', blurb: 'Flip two cards. Find the twins!', gameId: 'pair-pals' },
  { id: 'pattern-train', label: 'Pattern Train', blurb: 'Choo choo! What rides next?', gameId: 'pattern-train' },
  { id: 'missing-piece', label: 'Missing Piece', blurb: 'Oops, a hole! Which piece fits?', gameId: 'missing-piece' },
  { id: 'odd-one-out', label: 'Odd One Out', blurb: 'One of these is sneaky. Spot it!', gameId: 'odd-one-out' },
  { id: 'magic-wand', label: 'Magic Wand', blurb: 'Watch the magic, then do it again!', gameId: 'magic-wand' },
  { id: 'spin-match', label: 'Spin Match', blurb: 'Twirl it in your head. Same shape?', gameId: 'spin-match' },
  { id: 'copy-cat', label: 'Copy Cat', blurb: 'Watch, listen, then copy me!', gameId: 'copy-cat' },
  { id: 'symbol-hunt', label: 'Symbol Hunt', blurb: 'Find them all, fast as you can!', gameId: 'symbol-hunt' },
  // Sprint 2.16 — Words.
  { id: 'word-train', label: 'Word Train', blurb: 'All aboard! Which word rides next?', gameId: 'word-train' },
  { id: 'odd-word-out', label: 'Odd Word Out', blurb: "One word doesn't belong. Find it!", gameId: 'odd-word-out' },
  { id: 'word-wand', label: 'Word Wand', blurb: 'Zap! Do the same word magic again.', gameId: 'word-wand' },
  {
    id: 'missing-letter',
    label: 'Missing Letter',
    blurb: 'A letter fell out! Pop it back in.',
    gameId: 'missing-letter',
  },
  { id: 'word-snap', label: 'Word Snap', blurb: 'Snap two words into one big word!', gameId: 'word-snap' },
  {
    id: 'letter-garden',
    label: 'Letter Garden',
    blurb: 'Trace touching letters. Make words!',
    gameId: 'letter-garden',
  },
  // Sprint 2.16 — Numbers.
  { id: 'number-train', label: 'Number Train', blurb: '2, 4, 6… what number rides next?', gameId: 'number-train' },
  {
    id: 'number-machine',
    label: 'Number Machine',
    blurb: 'In goes a number. What pops out?',
    gameId: 'number-machine',
  },
  {
    id: 'odd-number-out',
    label: 'Odd Number Out',
    blurb: "One number doesn't fit. Which one?",
    gameId: 'odd-number-out',
  },
  { id: 'make-ten', label: 'Make Ten', blurb: 'Tap the numbers that add up!', gameId: 'make-ten' },
  { id: 'quick-count', label: 'Quick Count', blurb: 'Blink and count! How many were there?', gameId: 'quick-count' },
];

export function puzzleById(id: PuzzleId): Puzzle {
  const puzzle = PUZZLES.find((p) => p.id === id);
  if (puzzle === undefined) throw new Error(`Unknown puzzle "${id}"`);
  return puzzle;
}
