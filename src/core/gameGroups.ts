// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { MathGameId } from '@/core/gameIds';

/**
 * Sprint 2.13.1 — the math games in two groups (sprint 2.15: the Game
 * Chooser's group step): **mathBasher** (the original space and arcade games) and **Math Fun** (the
 * cute animal games and Balance Scale). Every math game is in exactly one
 * group (a test checks), so a new game has to pick one.
 *
 * Only which game sits where; each tile's name and line live in
 * `core/chooserTiles.ts`, its picture in `GAME_ICON_SHEET`.
 */
export type GameGroupId = 'math-basher' | 'math-fun';

export interface GameGroup {
  readonly id: GameGroupId;
  /** The group's name (its chooser tile and trail chip). */
  readonly label: string;
  /** Its games, in tile order. */
  readonly games: readonly MathGameId[];
}

/** Every group, in tab order. */
export const GAME_GROUPS: readonly GameGroup[] = [
  {
    id: 'math-basher',
    // Sprint 2.15 — one word, like the game's name (owner, 2026-10-30).
    label: 'mathBasher',
    games: ['alien-shoot', 'asteroid-field', 'number-climb', 'space-shooter'],
  },
  {
    id: 'math-fun',
    label: 'Math Fun',
    games: ['math-a-lotl', 'frog-splash', 'penguin-slide', 'bunny-garden', 'balance-scale'],
  },
];

/** The group a game belongs to. */
export function gameGroupOf(id: MathGameId): GameGroup {
  const group = GAME_GROUPS.find((g) => g.games.includes(id));
  if (group === undefined) throw new Error(`Game "${id}" is not in any group`);
  return group;
}

/** A group by id. */
export function gameGroupById(id: GameGroupId): GameGroup {
  const group = GAME_GROUPS.find((g) => g.id === id);
  if (group === undefined) throw new Error(`No game group "${id}"`);
  return group;
}
