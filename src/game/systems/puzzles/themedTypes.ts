// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { lookOf, shuffled, type TextToken } from '@/game/systems/puzzles/tokens';

/**
 * Sprint 2.16 — what a Words or Numbers "pick one" puzzle is: its stage,
 * the cards in the tray (one right) and the note after it. Pure data; the
 * scene (`ThemedPickScene`) draws it in the chosen look.
 */
export type ThemedStage =
  /** A train of cards, one of them the "?" (null). */
  | { readonly kind: 'train'; readonly cars: readonly (TextToken | null)[] }
  /** Odd One Out: the cards stand on a shelf (the tray draws them). */
  | { readonly kind: 'shelf' }
  /** Word Wand: A → B, so C → ? */
  | { readonly kind: 'pair'; readonly from: TextToken; readonly to: TextToken; readonly next: TextToken }
  /** Number Machine: what went in and came out, then what goes in now. */
  | {
      readonly kind: 'machine';
      readonly rows: readonly { readonly input: TextToken; readonly output: TextToken }[];
      readonly next: TextToken;
    }
  /** Missing Letter: the picture and the word's letters, one missing (null). */
  | { readonly kind: 'missing'; readonly picture: number; readonly letters: readonly (string | null)[] }
  /** Word Snap: one half shown (the other null), and the whole word when it helps. */
  | {
      readonly kind: 'snap';
      readonly left: string | null;
      readonly right: string | null;
      readonly whole: string | null;
    }
  /** Quick Count: `spots` (0–1 across and down) flash, then hide. */
  | { readonly kind: 'flash'; readonly spots: readonly { readonly x: number; readonly y: number }[] };

export interface ThemedPuzzle {
  readonly prompt: string;
  readonly stage: ThemedStage;
  readonly choices: readonly TextToken[];
  readonly answer: number;
  /** Said when it's solved ("The others all rhyme!"). */
  readonly why: string;
}

/** The tray: the answer and wrong ones (all different), shuffled. */
export function makeChoices(
  answer: TextToken,
  wrong: readonly TextToken[],
  count: number,
  rng: () => number,
): { choices: TextToken[]; answer: number } {
  const seen = new Set([lookOf(answer)]);
  const picked: TextToken[] = [];
  for (const w of wrong) {
    if (picked.length === count - 1) break;
    const look = lookOf(w);
    if (seen.has(look)) continue;
    seen.add(look);
    picked.push(w);
  }
  if (picked.length < count - 1) throw new Error('not enough different choices');
  const choices = shuffled([answer, ...picked], rng);
  return { choices, answer: choices.indexOf(answer) };
}
