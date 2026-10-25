// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { gcd } from '@/math/fractionMath';
import { fractionTerm, termDisplay } from '@/math/equationParts';
import type { EquationOp, Question, Term } from '@/math/types';

/**
 * Sprint 2.12 — Balance Scale's missing-number sentences. Takes any
 * challenge's question (via `Question.parts`) and blanks one operand:
 * `12 + ? = 17`, `? + 12 = 17`, and (Medium / Hard) the reversed
 * `17 = 12 + ?`, `17 = ? + 12`. The answer is the missing number; the wrong
 * weights sit near it and never balance the scale. Pure and tested.
 *
 * Rules (sprint 2.12 design review):
 *  - Never blank a 0 (the empty pan would already be level), and skip
 *    sentences whose total is 0 (an empty pan): returns null, draw again.
 *  - Whole numbers: wrong weights from the challenge's operand range,
 *    closest first, never 0 (an empty weight); a missing dividend is a nearby quotient × the divisor;
 *    a missing factor or divisor is never 0.
 *  - Fractions: the same bottom first, written the way the problem writes
 *    them (not reduced; mixed numbers keep their whole part); then a
 *    neighbouring whole part; then the other number's bottom and multiples
 *    of this one (thirds → sixths, ninths); only then any small bottom.
 *    Compared by VALUE, so "2/4" never sits next to a "1/2" answer.
 *  - No wrong weight makes its pan negative (no "3 − 5").
 */

const EPS = 1e-9;
const same = (a: number, b: number): boolean => Math.abs(a - b) < EPS;

export interface BalanceSentence {
  /** The pan with the blank: its two operands; the blank one is `null`. */
  operands: [Term | null, Term | null];
  op: EquationOp;
  /** The other pan: the sentence's total. */
  total: Term;
  /** Which operand is missing. */
  blank: 0 | 1;
  /** Reversed form (`17 = 12 + ?`): the total's pan is the left one. */
  reversed: boolean;
}

export interface MissingNumberQuestion extends Question {
  sentence: BalanceSentence;
}

export interface MissingNumberOpts {
  /** Weights in the tray, the right one included. */
  count: number;
  /** Medium / Hard: the reversed forms may come up. */
  reversedAllowed: boolean;
  rng: () => number;
}

function apply(op: EquationOp, a: number, b: number): number {
  switch (op) {
    case '+':
      return a + b;
    case '−':
      return a - b;
    case '×':
      return a * b;
    case '÷':
      return a / b;
  }
}

/** The blank pan's weight with `chosen` in the blank. */
export function panValue(s: BalanceSentence, chosen: number): number {
  const [a, b] = s.operands;
  return s.blank === 0 ? apply(s.op, chosen, b?.value ?? 0) : apply(s.op, a?.value ?? 0, chosen);
}

/**
 * How far off the scale is with `chosen`: (blank pan − total) / total, so
 * the scene can tip it more for a bigger miss. Positive: the blank pan is
 * heavier. 0 when balanced.
 */
export function weightError(s: BalanceSentence, chosen: number): number {
  const total = s.total.value;
  const diff = panValue(s, chosen) - total;
  if (same(diff, 0)) return 0;
  return diff / Math.max(Math.abs(total), 1e-6);
}

/** The prompt, with "?" for the blank. */
export function sentencePrompt(s: BalanceSentence): string {
  const expr = s.operands.map((t) => (t === null ? '?' : termDisplay(t))).join(` ${s.op} `);
  const total = termDisplay(s.total);
  return s.reversed ? `${total} = ${expr}` : `${expr} = ${total}`;
}

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The nearest `count` of `candidates` (by distance to `target`), chosen at
 * random from a window a little wider than `count`, so the right weight
 * isn't always in the middle of a neat run.
 */
function pickNear<T>(
  candidates: readonly T[],
  value: (t: T) => number,
  target: number,
  count: number,
  rng: () => number,
): T[] {
  const sorted = shuffle(candidates, rng).sort((x, y) => Math.abs(value(x) - target) - Math.abs(value(y) - target));
  const window = sorted.slice(0, Math.min(sorted.length, count + 2));
  return shuffle(window, rng).slice(0, count);
}

/** Whole-number wrong weights for the blank (see the rules above). */
function wholeDistractors(
  s: BalanceSentence,
  answer: number,
  count: number,
  range: { min: number; max: number },
  rng: () => number,
): Term[] {
  const valid = (v: number): boolean =>
    !same(v, answer) &&
    v > 0 &&
    !((s.op === '×' || s.op === '÷') && v === 0) &&
    panValue(s, v) >= 0 &&
    Number.isFinite(panValue(s, v));

  // A missing dividend: nearby quotients × the divisor, so the pans stay whole.
  if (s.op === '÷' && s.blank === 0) {
    const divisor = s.operands[1]?.value ?? 1;
    const quotient = answer / divisor;
    const qs: number[] = [];
    for (let q = Math.max(1, range.min - 1); q <= range.max + 2; q++) if (q !== quotient) qs.push(q);
    return pickNear(qs, (q) => q, quotient, count, rng).map((q) => ({ value: q * divisor }));
  }

  const inRange: number[] = [];
  for (let v = range.min; v <= range.max; v++) if (valid(v)) inRange.push(v);
  let pool = inRange;
  if (pool.length < count) {
    // A tight range (e.g. a near-full subtraction): widen just past its ends.
    const extra: number[] = [];
    for (let d = 1; extra.length + pool.length < count + 2 && d < 40; d++) {
      for (const v of [range.max + d, range.min - d]) if (valid(v)) extra.push(v);
    }
    pool = [...pool, ...extra];
  }
  return pickNear(pool, (v) => v, answer, count, rng).map((v) => ({ value: v }));
}

/** Fraction wrong weights, in tiers of how natural they look next to the answer (see the rules above). */
function fractionDistractors(s: BalanceSentence, blank: Term, count: number, rng: () => number): Term[] {
  const answer = blank.value;
  const f = blank.frac ?? { whole: 0, num: 1, den: 2 };
  const partner = s.operands.find((t) => t !== null)?.frac;
  const valid = (v: number): boolean => v > 0 && !same(v, answer) && panValue(s, v) >= -EPS;

  const withBottom = (den: number): Term[] =>
    Array.from({ length: den - 1 }, (_, i) => fractionTerm(i + 1, den, f.whole)).filter((t) => !same(t.value, answer));
  const tiers: Term[][] = [
    // 1. The same bottom (and, for a mixed number, the next whole part up or down).
    [
      ...withBottom(f.den),
      ...[f.whole - 1, f.whole + 1]
        .filter((w) => f.whole > 0 && w >= 1 && w <= 5)
        .map((w) => fractionTerm(f.num, f.den, w)),
    ],
    // 2. Two whole parts away (mixed numbers only).
    [f.whole - 2, f.whole + 2].filter((w) => f.whole > 0 && w >= 1 && w <= 6).map((w) => fractionTerm(f.num, f.den, w)),
    // 3. The other number's bottom, and multiples of this one.
    [
      ...(partner && partner.den !== f.den ? withBottom(partner.den) : []),
      ...[f.den * 2, f.den * 3].filter((d) => d <= 12).flatMap(withBottom),
    ],
    // 4. Any small bottom, reduced.
    Array.from({ length: 11 }, (_, i) => i + 2).flatMap((den) =>
      withBottom(den).filter((t) => gcd(t.frac?.num ?? 1, den) === 1),
    ),
  ];

  const picked: Term[] = [];
  for (const tier of tiers) {
    if (picked.length >= count) break;
    const fresh = tier.filter((t) => valid(t.value) && !picked.some((p) => same(p.value, t.value)));
    // Distinct values within the tier too ("2/6" and "1/3" weigh the same).
    const unique = fresh.filter((t, i) => fresh.findIndex((u) => same(u.value, t.value)) === i);
    picked.push(...pickNear(unique, (t) => t.value, answer, count - picked.length, rng));
  }
  return picked;
}

/**
 * Blank one operand of `q`'s sentence. Null when it can't make a fair one
 * (no parts, only zeros to blank, or a total of 0): draw another question.
 */
export function toMissingNumber(q: Question, opts: MissingNumberOpts): MissingNumberQuestion | null {
  const parts = q.parts;
  if (!parts) return null;
  const { rng, count } = opts;
  if (same(parts.result.value, 0)) return null;

  const options = ([0, 1] as const).filter((i) => !same((i === 0 ? parts.left : parts.right).value, 0));
  if (options.length === 0) return null;
  const blank = options[Math.floor(rng() * options.length)];
  const blankTerm = blank === 0 ? parts.left : parts.right;

  const sentence: BalanceSentence = {
    operands: blank === 0 ? [null, parts.right] : [parts.left, null],
    op: parts.op,
    total: parts.result,
    blank,
    reversed: opts.reversedAllowed && rng() < 0.5,
  };

  const isFraction = blankTerm.frac !== undefined;
  const wrong = isFraction
    ? fractionDistractors(sentence, blankTerm, count - 1, rng)
    : wholeDistractors(sentence, blankTerm.value, count - 1, parts.range ?? { min: 0, max: 20 }, rng);
  if (wrong.length < count - 1) return null;

  const weights = shuffle([blankTerm, ...wrong], rng);
  const choices = weights.map((t) => t.value);
  const question: MissingNumberQuestion = {
    prompt: sentencePrompt(sentence),
    correctAnswer: blankTerm.value,
    choices,
    sentence,
  };
  if (isFraction) {
    question.correctDisplay = termDisplay(blankTerm);
    question.choiceDisplays = weights.map(termDisplay);
  }
  return question;
}
