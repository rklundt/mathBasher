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
 * challenge, points, Game Select or Difficulty: each has its own setup
 * screen. Math-only code (Difficulty, Game Over, round scoring) takes
 * `MathGameId`, so a puzzle can't reach it by mistake.
 */
export type PuzzleGameId = 'pair-pals';

/** Every game: the nine math games and the puzzle games. */
export type GameId = MathGameId | PuzzleGameId;

/** The math games, in Game Select order (a test keeps it complete). */
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

/** True for the math games (they go through Game Select, Difficulty and Game Over). */
export function isMathGameId(id: GameId): id is MathGameId {
  return (MATH_GAME_IDS as readonly GameId[]).includes(id);
}
