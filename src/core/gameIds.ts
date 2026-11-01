// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * The math game modes. Sprint 2.1 widened a bare `'alien-shoot'` string to this
 * union when Asteroid Field landed; a new game adds a literal here and
 * TypeScript then flags every place that has to handle it (ADR-0011).
 *
 * Lives in `core` since sprint 2.9.1 (it was in `services/Settings.ts`, so
 * `core` files had to import from `services`, a known ADR-0006 exception).
 * `Settings` re-exports it, so `import { type GameId } from
 * '@/services/Settings'` still works outside `core`.
 */
export type MathGameId =
  | 'alien-shoot'
  | 'asteroid-field'
  | 'number-climb'
  | 'math-a-lotl'
  | 'frog-splash'
  | 'space-shooter'
  | 'penguin-slide'
  | 'bunny-garden'
  | 'balance-scale';

/**
 * Sprint 2.13 — the puzzle games (the Puzzles subject). They have no
 * math type or speed: each has its own setup screen. Math-only code (the
 * math setup, Game Over, round scoring) takes
 * `MathGameId`, so a puzzle can't reach it by mistake.
 */
export type PuzzleGameId = 'pair-pals' | RoundPuzzleId;

/**
 * Sprint 2.14 — the puzzle pack: rounds of 8 puzzles, one per family of
 * question on children's ability tests. The first five are "pick one"
 * puzzles (one scene draws them all); Copy Cat and Symbol Hunt have their own.
 */
export type PickPuzzleId = 'pattern-train' | 'missing-piece' | 'odd-one-out' | 'magic-wand' | 'spin-match';
/** The puzzle pack (the Visual group, with Pair Pals). */
export type VisualPuzzleId = PickPuzzleId | 'copy-cat' | 'symbol-hunt';

/**
 * Sprint 2.16 — the Words and Numbers puzzles. Same rounds of 8 as the
 * puzzle pack, and each plays in either look (`core/puzzleThemes.ts`).
 * The "pick one" ones share a scene; Make Ten and Letter Garden have their own.
 */
export type WordPuzzleId =
  'word-train' | 'odd-word-out' | 'word-wand' | 'missing-letter' | 'word-snap' | 'letter-garden';
export type NumberPuzzleId = 'number-train' | 'number-machine' | 'odd-number-out' | 'make-ten' | 'quick-count';
export type ThemedPuzzleId = WordPuzzleId | NumberPuzzleId;
export type ThemedPickId = Exclude<ThemedPuzzleId, 'letter-garden' | 'make-ten'>;

/** Every puzzle played as a round of 8 (all but Pair Pals). */
export type RoundPuzzleId = VisualPuzzleId | ThemedPuzzleId;

/** The puzzle pack, in picker order. */
export const VISUAL_PUZZLE_IDS: readonly VisualPuzzleId[] = [
  'pattern-train',
  'missing-piece',
  'odd-one-out',
  'magic-wand',
  'spin-match',
  'copy-cat',
  'symbol-hunt',
];

export const WORD_PUZZLE_IDS: readonly WordPuzzleId[] = [
  'word-train',
  'odd-word-out',
  'word-wand',
  'missing-letter',
  'word-snap',
  'letter-garden',
];

export const NUMBER_PUZZLE_IDS: readonly NumberPuzzleId[] = [
  'number-train',
  'number-machine',
  'odd-number-out',
  'make-ten',
  'quick-count',
];

export const THEMED_PUZZLE_IDS: readonly ThemedPuzzleId[] = [...WORD_PUZZLE_IDS, ...NUMBER_PUZZLE_IDS];

/** Every round puzzle: the puzzle pack, then Words, then Numbers. */
export const ROUND_PUZZLE_IDS: readonly RoundPuzzleId[] = [...VISUAL_PUZZLE_IDS, ...THEMED_PUZZLE_IDS];

const PICK_PUZZLE_IDS: readonly PickPuzzleId[] = [
  'pattern-train',
  'missing-piece',
  'odd-one-out',
  'magic-wand',
  'spin-match',
];

export function isRoundPuzzleId(id: GameId): id is RoundPuzzleId {
  return (ROUND_PUZZLE_IDS as readonly GameId[]).includes(id);
}

export function isPickPuzzleId(id: GameId): id is PickPuzzleId {
  return (PICK_PUZZLE_IDS as readonly GameId[]).includes(id);
}

export function isThemedPuzzleId(id: GameId): id is ThemedPuzzleId {
  return (THEMED_PUZZLE_IDS as readonly GameId[]).includes(id);
}

export function isThemedPickId(id: GameId): id is ThemedPickId {
  return isThemedPuzzleId(id) && id !== 'letter-garden' && id !== 'make-ten';
}

/** Every game: the nine math games and the puzzle games. */
export type GameId = MathGameId | PuzzleGameId;

/** Every math game (a test keeps it complete); the chooser's order is the groups'. */
export const MATH_GAME_IDS: readonly MathGameId[] = [
  'alien-shoot',
  'asteroid-field',
  'number-climb',
  'math-a-lotl',
  'frog-splash',
  'space-shooter',
  'penguin-slide',
  'bunny-garden',
  'balance-scale',
];

/** True for the math games (they go through the math setup screen and Game Over). */
export function isMathGameId(id: GameId): id is MathGameId {
  return (MATH_GAME_IDS as readonly GameId[]).includes(id);
}
