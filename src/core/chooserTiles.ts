// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { GameId, MathGameId, PuzzleGameId } from '@/core/gameIds';
import type { GameGroupId } from '@/core/gameGroups';
import type { SubjectId } from '@/core/subjects';
import { puzzleById } from '@/core/puzzles';

/**
 * Sprint 2.15 — the words on the Game Chooser's tiles, as the owner approved
 * them in the wireframes ("New wording is MUCH better!!!"): a lively line
 * for each subject, group, game and puzzle (a puzzle's line is its `blurb`
 * in `core/puzzles.ts`). Which game sits in which group stays in
 * `core/gameGroups.ts`; the pictures are the tile sheets' frames.
 */

/** The chooser's title at each step. */
export const CHOOSER_TITLES = {
  subjects: 'What do you want to play?',
  groups: 'Aliens or animals?',
  games: { math: 'Pick a game!', puzzles: 'Pick a puzzle!' },
} as const satisfies {
  subjects: string;
  groups: string;
  games: Record<SubjectId, string>;
};

export interface SubjectTile {
  readonly name: string;
  readonly line: string;
  /** Three pictures across the top. */
  readonly pictures: readonly GameId[];
}

export const SUBJECT_TILES: Readonly<Record<SubjectId, SubjectTile>> = {
  math: {
    name: 'Math',
    line: 'Add, subtract, times, divide and fractions',
    pictures: ['alien-shoot', 'math-a-lotl', 'balance-scale'],
  },
  puzzles: {
    name: 'Puzzles',
    line: 'Shapes, patterns and memory',
    pictures: ['pattern-train', 'missing-piece', 'copy-cat'],
  },
};

/** The tile that can't be tapped yet (owner: "keep it… we'll use it"). */
export const MORE_COMING_SOON = { name: 'More Coming Soon', line: 'New subjects are on the way!' } as const;

export interface GroupTile {
  readonly tagline: string;
  /** "4 space games": the count comes from the group, the word from here. */
  readonly gamesNoun: string;
  readonly pictures: readonly MathGameId[];
}

export const GROUP_TILES: Readonly<Record<GameGroupId, GroupTile>> = {
  'math-basher': {
    tagline: 'Blast aliens with your brain power!',
    gamesNoun: 'space games',
    pictures: ['alien-shoot', 'asteroid-field', 'space-shooter'],
  },
  'math-fun': {
    tagline: 'Hop, splash and slide with animal pals!',
    gamesNoun: 'animal games',
    pictures: ['math-a-lotl', 'frog-splash', 'bunny-garden'],
  },
};

export interface GameTile {
  readonly name: string;
  readonly line: string;
}

export const MATH_GAME_TILES: Readonly<Record<MathGameId, GameTile>> = {
  'alien-shoot': { name: 'Alien Shoot', line: 'Zap the alien with the right answer before it lands!' },
  'asteroid-field': {
    name: 'Asteroid Field',
    line: 'Space rocks everywhere! Blast the right one before time runs out.',
  },
  'number-climb': { name: 'Space Escape!', line: 'The station is on fire! Climb up, up, up and get out!' },
  'space-shooter': { name: 'Space Shooter', line: 'Grab the controls, pilot! Blast the right alien ship.' },
  'math-a-lotl': { name: 'Math-a-lotl', line: 'Pop! Help your axolotl pal catch the right bubble.' },
  'frog-splash': { name: 'Frog Splash', line: 'Ribbit! Hop the right lily pads across the river.' },
  'penguin-slide': { name: 'Penguin Slide', line: 'Wheee! Slide down the ice and snag the right fish.' },
  'bunny-garden': { name: 'Bunny Garden', line: 'Hungry bunny! Pick the carrot with the right answer.' },
  'balance-scale': { name: 'Balance Scale', line: 'Wibble wobble! Find the number that makes it balance.' },
};

/** A game's name as its tile shows it. */
export function gameName(id: GameId): string {
  return id in MATH_GAME_TILES ? MATH_GAME_TILES[id as MathGameId].name : puzzleById(id as PuzzleGameId).label;
}
