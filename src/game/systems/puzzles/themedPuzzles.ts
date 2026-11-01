// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { PuzzleLevel } from '@/core/config';
import type { ThemedPickId } from '@/core/gameIds';
import { defaultRng } from '@/math/rng';
import type { PuzzleWords, ThemedPuzzle } from '@/game/systems/puzzles/themedTypes';
import { generateWordPuzzle } from '@/game/systems/puzzles/wordPuzzles';
import { generateNumberPuzzle } from '@/game/systems/puzzles/numberPuzzles';

export type { PuzzleWords, ThemedPuzzle, ThemedStage } from '@/game/systems/puzzles/themedTypes';

/** Sprint 2.16 — one Words or Numbers "pick one" puzzle (`themedTypes.ts` says what it holds). */
export function generateThemed(
  id: ThemedPickId,
  level: PuzzleLevel,
  rng: () => number = defaultRng,
  words?: PuzzleWords,
): ThemedPuzzle {
  switch (id) {
    case 'word-train':
    case 'odd-word-out':
    case 'word-wand':
    case 'missing-letter':
    case 'word-snap':
      return generateWordPuzzle(id, level, rng, words);
    case 'number-train':
    case 'number-machine':
    case 'odd-number-out':
    case 'quick-count':
      return generateNumberPuzzle(id, level, rng);
  }
}

/** A round: `count` puzzles, no two alike. */
export function generateThemedRound(
  id: ThemedPickId,
  level: PuzzleLevel,
  count: number,
  rng: () => number = defaultRng,
  words?: PuzzleWords,
): ThemedPuzzle[] {
  const out: ThemedPuzzle[] = [];
  const keys = new Set<string>();
  for (let guard = 0; out.length < count && guard < count * 60; guard++) {
    const p = generateThemed(id, level, rng, words);
    // Missing Letter: never the same word twice in a round (owner: "I got train twice").
    const key = p.stage.kind === 'missing' ? p.stage.word : JSON.stringify(p.stage) + p.choices[p.answer].text;
    if (keys.has(key)) continue;
    keys.add(key);
    out.push(p);
  }
  while (out.length < count) out.push(generateThemed(id, level, rng, words));
  return out;
}
