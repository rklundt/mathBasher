// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { PuzzleLevel } from '@/core/config';
import { defaultRng } from '@/math/rng';
import { randInt } from '@/game/systems/puzzles/tokens';
import { KID_WORDS } from '@/game/systems/puzzles/wordData';

/**
 * Sprint 2.16 — Letter Garden's rules: trace touching letters (across, down
 * or diagonal, each tile once) to make a word from the list. The words and
 * the boards come from one file made by `scripts/words/build-word-list.mjs`
 * (checked there: every board holds enough common words at its level and
 * nothing rude can be traced). Pure logic; the scene draws and drags.
 */

/** The words and boards file, as loaded. */
export interface LetterGardenData {
  /** Space-separated: the words a kid most likely knows. */
  readonly common: string;
  /** Space-separated: every other word that counts. */
  readonly more: string;
  readonly boards: Readonly<Record<PuzzleLevel, readonly string[]>>;
}

/** The word list, ready to check words and find them on a board. */
export class WordList {
  readonly common: ReadonlySet<string>;
  private readonly all: ReadonlySet<string>;
  private readonly prefixes: ReadonlySet<string>;

  constructor(data: Pick<LetterGardenData, 'common' | 'more'>) {
    const common = data.common.split(' ').filter(Boolean);
    const more = data.more.split(' ').filter(Boolean);
    this.common = new Set(common);
    this.all = new Set([...common, ...more]);
    const prefixes = new Set<string>();
    for (const w of this.all) for (let k = 1; k <= w.length; k++) prefixes.add(w.slice(0, k));
    this.prefixes = prefixes;
  }

  has(word: string): boolean {
    return this.all.has(word);
  }

  /** The same as `has` (so a word list can be handed to the puzzle generators as `PuzzleWords`). */
  isWord(word: string): boolean {
    return this.all.has(word);
  }

  isPrefix(s: string): boolean {
    return this.prefixes.has(s);
  }
}

let cachedList: WordList | null = null;

/** The word list from the loaded file, built once a visit (it's large; Letter Garden and Missing Letter share it). */
export function wordListFrom(data: Pick<LetterGardenData, 'common' | 'more'>): WordList {
  return (cachedList ??= new WordList(data));
}

/** The tiles touching tile `i` on a `size` × `size` board (diagonals too). */
export function neighbours(i: number, size: number): number[] {
  const x = i % size;
  const y = Math.floor(i / size);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) out.push(ny * size + nx);
    }
  return out;
}

/** True if each tile in the path touches the one before and none is used twice. */
export function isPath(path: readonly number[], size: number): boolean {
  if (new Set(path).size !== path.length) return false;
  return path.every((t, k) => t >= 0 && t < size * size && (k === 0 || neighbours(path[k - 1], size).includes(t)));
}

/** The word a path spells. */
export function wordOf(board: string, path: readonly number[]): string {
  return path.map((i) => board[i]).join('');
}

/** What a traced word is: a new word, too short, already found, or not in the list. */
export type TraceResult = 'word' | 'short' | 'again' | 'unknown';

export function checkTrace(word: string, minLetters: number, list: WordList, found: ReadonlySet<string>): TraceResult {
  if (word.length < minLetters) return 'short';
  if (!list.has(word)) return 'unknown';
  return found.has(word) ? 'again' : 'word';
}

/** Every word (at least `minLetters` long) that can be traced on the board, with a path for each. */
export function wordsOnBoard(board: string, size: number, list: WordList, minLetters: number): Map<string, number[]> {
  const found = new Map<string, number[]>();
  const path: number[] = [];
  const walk = (i: number, prefix: string): void => {
    const w = prefix + board[i];
    if (!list.isPrefix(w)) return;
    path.push(i);
    if (w.length >= minLetters && list.has(w) && !found.has(w)) found.set(w, [...path]);
    for (const n of neighbours(i, size)) if (!path.includes(n)) walk(n, w);
    path.pop();
  };
  for (let i = 0; i < board.length; i++) walk(i, '');
  return found;
}

/** A path that spells `word` on the board, or null (typing a word on a keyboard finds its tiles). */
export function pathFor(board: string, size: number, word: string): number[] | null {
  const path: number[] = [];
  const walk = (i: number, k: number): boolean => {
    if (board[i] !== word[k]) return false;
    path.push(i);
    if (k === word.length - 1) return true;
    for (const n of neighbours(i, size)) if (!path.includes(n) && walk(n, k + 1)) return true;
    path.pop();
    return false;
  };
  for (let i = 0; i < board.length; i++) if (walk(i, 0)) return path;
  return null;
}

/**
 * A word still on the board (not found yet), to show when the sand runs
 * out: one from the puzzles' own kid words if there is one, else a common
 * word; the shortest first, so it's one a kid can read.
 */
export function revealWord(
  board: string,
  size: number,
  list: WordList,
  minLetters: number,
  found: ReadonlySet<string>,
  rng: () => number = defaultRng,
): { word: string; path: number[] } | null {
  const all = [...wordsOnBoard(board, size, list, minLetters)].filter(([w]) => !found.has(w));
  const kid = all.filter(([w]) => KID_WORDS.has(w));
  const common = all.filter(([w]) => list.common.has(w));
  const pool = kid.length ? kid : common.length ? common : all;
  if (!pool.length) return null;
  const shortest = Math.min(...pool.map(([w]) => w.length));
  const short = pool.filter(([w]) => w.length === shortest);
  const [word, path] = short[randInt(short.length, rng)];
  return { word, path };
}

/** A board for this level (never the one just played). */
export function pickBoard(
  data: LetterGardenData,
  level: PuzzleLevel,
  avoid: string | null,
  rng: () => number = defaultRng,
): string {
  const boards = data.boards[level];
  for (let guard = 0; guard < 20; guard++) {
    const b = boards[randInt(boards.length, rng)];
    if (b !== avoid) return b;
  }
  return boards[0];
}
