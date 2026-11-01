// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, type PuzzleLevel } from '@/core/config';
import { mulberry32 } from '@/test-utils/mulberry32';
import {
  WordList,
  checkTrace,
  isPath,
  neighbours,
  pathFor,
  pickBoard,
  revealWord,
  wordOf,
  wordsOnBoard,
  type LetterGardenData,
} from '@/game/systems/puzzles/letterGarden';

const ROOT = resolve(__dirname, '../../../..');
const LG = config.puzzles.letterGarden;
const LEVELS: PuzzleLevel[] = ['easy', 'medium', 'hard'];
const data = JSON.parse(readFileSync(resolve(ROOT, 'public', LG.wordsUrl), 'utf8')) as LetterGardenData;
const list = new WordList(data);
const script = readFileSync(resolve(ROOT, 'scripts/words/build-word-list.mjs'), 'utf8');

/** The blocklist, decoded (ROT13), as the build script reads it. */
function blocklist(): { stems: string[]; words: string[] } {
  const rot = (s: string) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 84) % 26) + 97));
  const lines = readFileSync(resolve(ROOT, 'scripts/words/blocklist.rot13.txt'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'));
  const [stems, words] = lines.map((l) => l.trim().split(/\s+/).map(rot));
  return { stems, words };
}

describe('Letter Garden words and boards (sprint 2.16)', () => {
  it('the config and the build script agree on each level’s board and shortest word', () => {
    for (const level of LEVELS) {
      const m = new RegExp(`${level}: \\{ size: (\\d), minLetters: (\\d)`).exec(script);
      expect(m, level).not.toBeNull();
      expect(LG.size[level], level).toBe(Number(m?.[1]));
      expect(LG.minLetters[level], level).toBe(Number(m?.[2]));
    }
  });

  it('the word list is lower-case a–z, 3–8 letters, with nothing on the blocklist', () => {
    const { stems, words } = blocklist();
    expect(words.length).toBeGreaterThan(50);
    const all = `${data.common} ${data.more}`.split(' ');
    expect(all.length).toBeGreaterThan(20000);
    for (const w of all) {
      expect(w, w).toMatch(/^[a-z]{3,8}$/);
    }
    const blocked = all.filter((w) => words.includes(w) || stems.some((s) => w.includes(s)));
    expect(blocked.length).toBe(0);
  });

  it('every board: its size, a–z, enough common words at its level, nothing rude traceable', () => {
    const { stems, words } = blocklist();
    const bad = new WordList({ common: '', more: [...stems, ...words].join(' ') });
    for (const level of LEVELS) {
      const size = LG.size[level];
      expect(data.boards[level].length, level).toBeGreaterThanOrEqual(200);
      for (const board of data.boards[level]) {
        expect(board, level).toMatch(new RegExp(`^[a-z]{${String(size * size)}}$`));
        const found = wordsOnBoard(board, size, list, LG.minLetters[level]);
        const common = [...found.keys()].filter((w) => list.common.has(w));
        expect(common.length, `${level} ${board}`).toBeGreaterThanOrEqual(8);
        expect([...wordsOnBoard(board, size, bad, 3).keys()], board).toEqual([]);
      }
    }
  });
});

describe('Letter Garden rules (sprint 2.16)', () => {
  const board = 'catsdogxbirdmoon';
  // c a t s
  // d o g x
  // b i r d
  // m o o n

  it('tiles touch across, down and on the diagonal', () => {
    expect(neighbours(0, 4).sort((a, b) => a - b)).toEqual([1, 4, 5]);
    expect(neighbours(5, 4).length).toBe(8);
  });

  it('a path must touch each step and never reuse a tile', () => {
    expect(isPath([0, 1, 2], 4)).toBe(true);
    expect(isPath([0, 2], 4)).toBe(false);
    expect(isPath([0, 1, 0], 4)).toBe(false);
    expect(wordOf(board, [0, 1, 2])).toBe('cat');
  });

  it('a trace is a word, too short, already found or not in the list', () => {
    expect(checkTrace('cat', 3, list, new Set())).toBe('word');
    expect(checkTrace('cat', 4, list, new Set())).toBe('short');
    expect(checkTrace('cat', 3, list, new Set(['cat']))).toBe('again');
    expect(checkTrace('cxz', 3, list, new Set())).toBe('unknown');
  });

  it('typing a word finds its tiles; the board’s words include the obvious ones', () => {
    expect(pathFor(board, 4, 'cat')).toEqual([0, 1, 2]);
    expect(pathFor(board, 4, 'dog')).not.toBeNull();
    expect(pathFor(board, 4, 'zebra')).toBeNull();
    const found = wordsOnBoard(board, 4, list, 3);
    expect(found.has('cat')).toBe(true);
    expect(found.has('moon')).toBe(true);
    for (const [w, path] of found) expect(wordOf(board, path), w).toBe(w);
  });

  it('the reveal is a short common word not found yet; a new board differs from the last', () => {
    const r = revealWord(board, 4, list, 3, new Set(['cat']), mulberry32(3));
    expect(r).not.toBeNull();
    expect(r?.word).not.toBe('cat');
    expect(list.common.has(r?.word ?? '')).toBe(true);
    const first = pickBoard(data, 'easy', null, mulberry32(1));
    for (let s = 2; s < 30; s++) expect(pickBoard(data, 'easy', first, mulberry32(s))).not.toBe(first);
  });
});
