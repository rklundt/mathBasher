// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { GameId, MathGameId, PuzzleGameId } from '@/core/gameIds';
import type { SubjectId } from '@/core/subjects';

/**
 * Sprint 2.13.1 — the math games in two groups (sprint 2.15: the Game
 * Chooser's group step): **mathBasher** (the original space and arcade games) and **Math Fun** (the
 * cute animal games and Balance Scale). Every math game is in exactly one
 * group (a test checks), so a new game has to pick one.
 *
 * Sprint 2.16 — the puzzles in three groups too: **Visual** (Pair Pals and
 * the puzzle pack), **Words** and **Numbers**. Every puzzle is in exactly
 * one (a test checks).
 *
 * Only which game sits where; each tile's name and line live in
 * `core/chooserTiles.ts`, its picture in `GAME_ICON_SHEET` /
 * `PUZZLE_ICON_SHEETS`.
 */
export type MathGroupId = 'math-basher' | 'math-fun';
export type PuzzleGroupId = 'visual' | 'words' | 'numbers';
export type GameGroupId = MathGroupId | PuzzleGroupId;

export interface GameGroup {
  readonly id: GameGroupId;
  /** The subject it's in. */
  readonly subject: SubjectId;
  /** The group's name (its chooser tile and trail chip). */
  readonly label: string;
  /** Its games, in tile order. */
  readonly games: readonly GameId[];
}

/** The math games' groups, in tab order. */
export const GAME_GROUPS: readonly (GameGroup & { readonly games: readonly MathGameId[] })[] = [
  {
    id: 'math-basher',
    subject: 'math',
    // Sprint 2.15 — one word, like the game's name (owner, 2026-10-30).
    label: 'mathBasher',
    games: ['alien-shoot', 'asteroid-field', 'number-climb', 'space-shooter'],
  },
  {
    id: 'math-fun',
    subject: 'math',
    label: 'Math Fun',
    games: ['math-a-lotl', 'frog-splash', 'penguin-slide', 'bunny-garden', 'balance-scale'],
  },
];

/** Sprint 2.16 — the puzzles' groups, in tab order. */
export const PUZZLE_GROUPS: readonly (GameGroup & { readonly games: readonly PuzzleGameId[] })[] = [
  {
    id: 'visual',
    subject: 'puzzles',
    label: 'Visual',
    games: [
      'pair-pals',
      'pattern-train',
      'missing-piece',
      'odd-one-out',
      'magic-wand',
      'spin-match',
      'copy-cat',
      'symbol-hunt',
    ],
  },
  {
    id: 'words',
    subject: 'puzzles',
    label: 'Words',
    games: ['word-train', 'odd-word-out', 'word-wand', 'missing-letter', 'word-snap', 'letter-garden'],
  },
  {
    id: 'numbers',
    subject: 'puzzles',
    label: 'Numbers',
    games: ['number-train', 'number-machine', 'odd-number-out', 'make-ten', 'quick-count'],
  },
];

/** Every group, math then puzzles. */
export const ALL_GROUPS: readonly GameGroup[] = [...GAME_GROUPS, ...PUZZLE_GROUPS];

/** The group a game belongs to. */
export function gameGroupOf(id: GameId): GameGroup {
  const group = ALL_GROUPS.find((g) => g.games.includes(id));
  if (group === undefined) throw new Error(`Game "${id}" is not in any group`);
  return group;
}

/** A group by id. */
export function gameGroupById(id: GameGroupId): GameGroup {
  const group = ALL_GROUPS.find((g) => g.id === id);
  if (group === undefined) throw new Error(`No game group "${id}"`);
  return group;
}
