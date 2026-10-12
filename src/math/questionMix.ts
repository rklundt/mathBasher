// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Weighted question picking for the whole-number generators (sprint 2.5.7).
 *
 * Each generator lists every valid problem once (e.g. every `a + b` with a
 * sum up to 20), gives each one a weight, and draws from that table. Two
 * kinds of weight shape the mix:
 *
 *  - **answer weight** — how often each answer value comes up (e.g. Add to
 *    20 keeps single-digit sums rare);
 *  - **problem weight** — among the problems with the same answer, which
 *    ones to favour (e.g. "13 − 5" over "13 − 0", "8 + 7" over "10 + 5").
 *
 * `answerWeightedTable` keeps the two independent: an answer's share is
 * exactly its answer weight however many problems produce it, and the
 * problem weights only split that share. The tuning numbers live in
 * `config.questionMix`; the shares they produce are locked by
 * `questionMix.test.ts`.
 */

import { config } from '@/core/config';

export interface Weighted<T> {
  readonly value: T;
  readonly weight: number;
}

/** Draw one value, each with probability weight / total weight. */
export function pickWeighted<T>(table: readonly Weighted<T>[], rng: () => number): T {
  let total = 0;
  for (const e of table) total += e.weight;
  let r = rng() * total;
  for (const e of table) {
    r -= e.weight;
    if (r < 0) return e.value;
  }
  // Floating-point leftovers (r landed exactly on the total): the last entry.
  return table[table.length - 1]!.value;
}

/**
 * Two-level table: each answer gets `answerWeight(answer)` of the total,
 * shared among the problems with that answer in proportion to
 * `problemWeight(problem)`. Zero-weight entries are dropped.
 */
export function answerWeightedTable<P>(
  problems: readonly P[],
  answerOf: (p: P) => number,
  answerWeight: (answer: number) => number,
  problemWeight: (p: P) => number,
): Weighted<P>[] {
  const perAnswer = new Map<number, number>();
  for (const p of problems) {
    const a = answerOf(p);
    perAnswer.set(a, (perAnswer.get(a) ?? 0) + problemWeight(p));
  }
  return problems
    .map((p) => {
      const share = perAnswer.get(answerOf(p))!;
      return { value: p, weight: share > 0 ? (answerWeight(answerOf(p)) * problemWeight(p)) / share : 0 };
    })
    .filter((e) => e.weight > 0);
}

/** Every integer in [min, max], each weighted by `weightOf(n)`. */
export function weightedRange(min: number, max: number, weightOf: (n: number) => number): Weighted<number>[] {
  const out: Weighted<number>[] = [];
  for (let n = min; n <= max; n++) out.push({ value: n, weight: weightOf(n) });
  return out;
}

/**
 * Multiply / divide factors in [min, max]: × 10 and × 11 are easy patterns,
 * so they come up less often (`config.questionMix.multDiv`).
 */
export function factorTable(min: number, max: number): Weighted<number>[] {
  const mix = config.questionMix.multDiv;
  return weightedRange(min, max, (n) => (n === 10 ? mix.tenWeight : n === 11 ? mix.elevenWeight : 1));
}

/** An `a ⊕ b` problem: the two numbers in the prompt and the answer. */
export interface Operands {
  readonly a: number;
  readonly b: number;
  readonly answer: number;
}
