// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Game-neutral round rules shared by more than one game mode (sprint
 * 2.5.5 — lifted out of `numberClimbFloorMath.ts` once Math-a-lotl
 * needed them too). Pure, no Phaser. Locked in
 * `NumberClimbFloorSystem.test.ts`; Math-a-lotl's wave builder on top of
 * `pickSubsetWithCorrect` is covered in `mathALotlMath.test.ts`.
 */

import { extendChoices } from '@/math/extendChoices';
import type { Question } from '@/math/types';

/**
 * Pick `count` answers from the `choices` array such that
 * `correctAnswer` is guaranteed to be among them. Choices is 4 (per
 * the math-generator contract); if the random subset happens to omit
 * the correct answer, swap a random selected slot for it. Returns
 * the picked answers in a shuffled order so the correct answer's
 * left-to-right position varies floor-to-floor (kid can't game the
 * mode by always tapping the same rung index).
 *
 * Invariants:
 *  1. Returns EXACTLY `count` values.
 *  2. The returned array CONTAINS `correctAnswer` (always).
 *  3. No duplicates in the returned array.
 *
 * Locked in `NumberClimbFloorSystem.test.ts`.
 */
export function pickSubsetWithCorrect(
  choices: readonly number[],
  correctAnswer: number,
  count: number,
  rng: () => number,
): number[] {
  // Defensive: if count >= choices.length, just shuffle the whole list.
  if (count >= choices.length) {
    return shuffle(choices.slice(), rng);
  }
  // Random subset of size `count` from `choices` (Fisher-Yates-style partial pick).
  const remaining = choices.slice();
  const picked: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * remaining.length);
    picked.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  // Guarantee the correct answer is present.
  if (!picked.includes(correctAnswer)) {
    // Replace a random slot with the correct answer. The replaced
    // value is dropped — that's fine; the goal is just to ensure
    // the correct answer is among the rungs.
    const replaceIdx = Math.floor(rng() * picked.length);
    picked[replaceIdx] = correctAnswer;
  }
  return shuffle(picked, rng);
}

/** Fisher-Yates shuffle, in-place. Returns the same array for chaining. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Pure result of `resolveStrike` — a round-wide life budget after one
 * wrong pick (Number Climb's floors, Math-a-lotl's catches).
 */
export interface StrikeDecision {
  /** Lives spent AFTER this wrong pick. */
  strikesAfter: number;
  /** Lives left after this pick (never negative) — drives the lives HUD. */
  remaining: number;
  /** True if this pick spent the last life — the round ends. */
  exhausted: boolean;
}

/**
 * Spend one life from a round-wide budget. Every wrong pick / catch
 * costs one; the round ends exactly when the last life is spent, never
 * with a life still showing. First written for Number Climb (sprint
 * 2.5.2), shared with Math-a-lotl since 2.5.4.
 */
export function resolveStrike(strikesSoFar: number, maxStrikes: number): StrikeDecision {
  const strikesAfter = strikesSoFar + 1;
  return {
    strikesAfter,
    remaining: Math.max(0, maxStrikes - strikesAfter),
    exhausted: strikesAfter >= maxStrikes,
  };
}

/**
 * Per-question countdown that can EXPIRE ONLY ONCE per `start()` and
 * stops ticking after `stop()` — so the timeout path can't run twice
 * (the last-question case: the round has ended but the scene still gets
 * one more update before GameOver mounts).
 */
export class QuestionClock {
  private remainingMs = 0;
  private running = false;

  start(ms: number): void {
    this.remainingMs = ms;
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  /** Advance; returns true exactly once — on the tick that reaches zero. */
  tick(dtMs: number): boolean {
    if (!this.running) return false;
    this.remainingMs = Math.max(0, this.remainingMs - dtMs);
    if (this.remainingMs > 0) return false;
    this.running = false;
    return true;
  }

  /** Seconds left (0 once expired or stopped at zero). */
  get remainingSec(): number {
    return this.remainingMs / 1000;
  }
}

/**
 * Sprint 2.7 — the answers for one row of targets (lily pads, ships,
 * fish): `count` values including the right one, no duplicates, in random
 * order, each with its display label. A question carries 4 choices; when
 * a row has more slots than that (Space Shooter and Penguin Slide on
 * Hard), extra wrong answers are added first (`extendChoices`). Replaces
 * the identical `rowAnswers` (Frog Splash) and `shipAnswers` (Space
 * Shooter).
 */
export function pickRowAnswers(
  q: Pick<Question, 'choices' | 'correctAnswer' | 'correctDisplay' | 'choiceDisplays'>,
  count: number,
  rng: () => number,
): Array<{ answer: number; display: string }> {
  const { choices, choiceDisplays } = count > q.choices.length ? extendChoices(q, count, rng) : q;
  const n = Math.max(1, Math.min(count, choices.length));
  return pickSubsetWithCorrect(choices, q.correctAnswer, n, rng).map((answer) => ({
    answer,
    display: choiceDisplays?.[choices.indexOf(answer)] ?? String(answer),
  }));
}

/** What `RoundController.recordOutcome` should be told about a question. */
export interface OutcomeRecord {
  wasCorrect: boolean;
  usedWrongShot: boolean;
}

/** The round as the retry rules (`resolveRetryEvent`) see it. */
export interface RetryRoundState {
  /** The current question's answer; null between questions (nothing matches). */
  correctAnswer: number | null;
  livesUsed: number;
  maxLives: number;
  /** A wrong pick or a time-out already happened on this question (the right answer then scores half). */
  usedWrong: boolean;
}

export type RetryDecision =
  | { kind: 'correct'; record: OutcomeRecord }
  | { kind: 'wrong'; livesUsed: number; livesRemaining: number; usedWrong: true }
  | { kind: 'timeout'; livesUsed: number; livesRemaining: number; usedWrong: true }
  | {
      kind: 'out-of-lives';
      cause: 'wrong' | 'timeout';
      livesUsed: number;
      livesRemaining: 0;
      usedWrong: true;
      record: OutcomeRecord;
    };

/**
 * Sprint 2.7 — the "a wrong pick or a time-out costs a life and the same
 * question comes back" rules (Penguin Slide; Frog Splash and Space Shooter
 * run the same rules inline today). Pure: the scene keeps every side
 * effect, the clock, and resetting `usedWrong` when the next question
 * starts.
 *
 *  - Right answer → `correct`, half points if this question already had
 *    a wrong pick or a time-out.
 *  - Wrong answer, or the clock runs out → `wrong` / `timeout`: a life is
 *    spent and the question comes back.
 *  - Either of those on the last life → `out-of-lives` (with its cause, so
 *    the scene plays the right beat first): the round ends.
 */
export function resolveRetryEvent(
  state: RetryRoundState,
  event: { type: 'pick'; answer: number } | { type: 'timeout' },
): RetryDecision {
  if (event.type === 'pick' && event.answer === state.correctAnswer) {
    return { kind: 'correct', record: { wasCorrect: true, usedWrongShot: state.usedWrong } };
  }
  const cause = event.type === 'pick' ? 'wrong' : 'timeout';
  const strike = resolveStrike(state.livesUsed, state.maxLives);
  if (strike.exhausted) {
    return {
      kind: 'out-of-lives',
      cause,
      livesUsed: strike.strikesAfter,
      livesRemaining: 0,
      usedWrong: true,
      record: { wasCorrect: false, usedWrongShot: true },
    };
  }
  const spent = { livesUsed: strike.strikesAfter, livesRemaining: strike.remaining, usedWrong: true } as const;
  return cause === 'wrong' ? { kind: 'wrong', ...spent } : { kind: 'timeout', ...spent };
}
