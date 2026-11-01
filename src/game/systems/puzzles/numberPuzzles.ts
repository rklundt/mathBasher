// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config, type PuzzleLevel } from '@/core/config';
import type { NumberPuzzleId } from '@/core/gameIds';
import { defaultRng } from '@/math/rng';
import { randInt, shuffled, textToken, type TextToken } from '@/game/systems/puzzles/tokens';
import { makeChoices, type ThemedPuzzle } from '@/game/systems/puzzles/themedTypes';

/**
 * Sprint 2.16 — the Numbers puzzles (owner, 2026-11-01): Number Train,
 * Number Machine, Odd Number Out and Quick Count ("pick one"), and Make
 * Ten's boards. Each puzzle has exactly one right card (tests check).
 */

const P = config.puzzles;
const num = (n: number): TextToken => textToken(String(n));
const pick = <T>(items: readonly T[], rng: () => number): T => items[randInt(items.length, rng)];
const between = (lo: number, hi: number, rng: () => number): number => lo + randInt(hi - lo + 1, rng);

export function generateNumberPuzzle(
  id: Exclude<NumberPuzzleId, 'make-ten'>,
  level: PuzzleLevel,
  rng: () => number,
): ThemedPuzzle {
  switch (id) {
    case 'number-train':
      return numberTrain(level, rng);
    case 'number-machine':
      return numberMachine(level, rng);
    case 'odd-number-out':
      return oddNumberOut(level, rng);
    case 'quick-count':
      return quickCount(level, rng);
  }
}

/** Wrong numbers near the answer (never below 0, never the answer). */
function nearNumbers(answer: number, steps: readonly number[], rng: () => number): TextToken[] {
  const out = new Set<number>();
  for (const d of steps) if (answer + d >= 0 && d !== 0) out.add(answer + d);
  return shuffled([...out], rng).map(num);
}

// ---------------------------------------------------------------- Number Train

/** A sequence: its first terms come from `term(k)`, and its note. */
interface Sequence {
  readonly term: (k: number) => number;
  readonly why: string;
  /** Tempting wrong steps away from the answer. */
  readonly near: readonly number[];
}

function sequenceFor(level: PuzzleLevel, rng: () => number): Sequence {
  if (level === 'easy') {
    const step = pick([1, 2, 5, 10], rng);
    const start = step === 1 ? between(0, 15, rng) : step * between(0, step === 10 ? 5 : 6, rng);
    return {
      term: (k) => start + k * step,
      why: `Count up by ${String(step)}s!`,
      near: [step, -step, 1, -1, 2],
    };
  }
  if (level === 'medium') {
    const kind = pick(['up', 'down'], rng);
    if (kind === 'up') {
      const step = pick([3, 4], rng);
      const start = between(0, 12, rng);
      return { term: (k) => start + k * step, why: `Count up by ${String(step)}s!`, near: [step, -1, 1, -step, 2] };
    }
    const step = pick([1, 2, 5, 10], rng);
    const start = step * between(6, 10, rng) + (step === 1 ? between(0, 9, rng) : 0);
    return {
      term: (k) => start - k * step,
      why: `Count down by ${String(step)}s!`,
      near: [step, -step * 2, 1, -1, 2],
    };
  }
  const kind = pick(['double', 'grow', 'times3', 'squares', 'table'], rng);
  if (kind === 'double') {
    const start = pick([1, 2, 3, 5], rng);
    return { term: (k) => start * 2 ** k, why: 'Each number doubles!', near: [-2, 2, -start, start * 2, 1] };
  }
  if (kind === 'grow') {
    const start = between(1, 5, rng);
    return {
      term: (k) => start + (k * (k + 1)) / 2,
      why: 'The jumps grow: +1, +2, +3…!',
      near: [1, -1, 2, -2, 3],
    };
  }
  if (kind === 'times3') {
    return { term: (k) => 3 ** k, why: 'Each number times 3!', near: [-3, 3, 9, -9, 1] };
  }
  if (kind === 'squares') {
    const s = between(1, 3, rng);
    return { term: (k) => (s + k) ** 2, why: 'Square numbers: 1×1, 2×2, 3×3…!', near: [1, -1, 2, -2, 3] };
  }
  const step = pick([6, 7, 8, 9], rng);
  return { term: (k) => step * (k + 1), why: `The ${String(step)} times table!`, near: [step, -step, 1, -1, 2] };
}

function numberTrain(level: PuzzleLevel, rng: () => number): ThemedPuzzle {
  const n = P.numberTrain.cars[level];
  const seq = sequenceFor(level, rng);
  // Medium: sometimes the gap is in the middle.
  const blank = level === 'medium' && rng() < 0.4 ? between(1, n - 1, rng) : n;
  const answer = seq.term(blank);
  const cars = Array.from({ length: n + 1 }, (_, k) => (k === blank ? null : num(seq.term(k))));
  const shown = new Set(cars.filter((c): c is TextToken => c !== null).map((c) => c.text));
  const wrong = nearNumbers(answer, seq.near, rng).filter((t) => !shown.has(t.text) || rng() < 0.3);
  const fill = nearNumbers(answer, [3, -3, 4, -4, 5, 10, -10], rng);
  const { choices, answer: a } = makeChoices(num(answer), [...wrong, ...fill], P.choices[level], rng);
  return {
    prompt: blank === n ? 'Which number comes next?' : 'Which number fills the gap?',
    stage: { kind: 'train', cars },
    choices,
    answer: a,
    why: seq.why,
  };
}

// ---------------------------------------------------------------- Number Machine

/** A machine's rule: out = a × in + b, said as words. */
export interface MachineRule {
  readonly a: number;
  readonly b: number;
  readonly label: string;
}

export const MACHINE_RULES: Readonly<Record<PuzzleLevel, readonly MachineRule[]>> = {
  easy: [
    { a: 1, b: 1, label: 'adds 1' },
    { a: 1, b: 2, label: 'adds 2' },
    { a: 1, b: 3, label: 'adds 3' },
    { a: 1, b: 10, label: 'adds 10' },
    { a: 1, b: -1, label: 'takes away 1' },
    { a: 1, b: -2, label: 'takes away 2' },
  ],
  medium: [
    { a: 2, b: 0, label: 'doubles it' },
    { a: 5, b: 0, label: 'times 5' },
    { a: 10, b: 0, label: 'times 10' },
    { a: 3, b: 0, label: 'times 3' },
    { a: 1, b: 5, label: 'adds 5' },
    { a: 1, b: -5, label: 'takes away 5' },
  ],
  hard: [
    { a: 2, b: 1, label: 'doubles it, then adds 1' },
    { a: 2, b: -1, label: 'doubles it, then takes away 1' },
    { a: 3, b: 1, label: 'times 3, then adds 1' },
    { a: 10, b: 5, label: 'times 10, then adds 5' },
    { a: 2, b: 2, label: 'adds 1, then doubles it' },
    { a: 4, b: 0, label: 'times 4' },
  ],
};

function numberMachine(level: PuzzleLevel, rng: () => number): ThemedPuzzle {
  const rule = pick(MACHINE_RULES[level], rng);
  const apply = (x: number): number => rule.a * x + rule.b;
  // Inputs that keep every output at 0 or more, all different.
  const lo = rule.b < 0 ? Math.ceil(-rule.b / rule.a) + 1 : 1;
  const hi = level === 'easy' ? 12 : 10;
  const inputs = shuffled(
    Array.from({ length: hi - lo + 1 }, (_, i) => lo + i),
    rng,
  ).slice(0, level === 'hard' ? 4 : 3);
  const shownIn = inputs.slice(0, -1);
  const x = inputs[inputs.length - 1];
  const answer = apply(x);
  // Tempting: the input itself, the step applied the wrong way, near misses.
  const wrong = [
    ...nearNumbers(answer, [1, -1, rule.a, -rule.a, 2, -2, 10, -10], rng),
    num(x),
    ...(rule.b !== 0 ? [num(rule.a * x - rule.b), num(x + rule.b)] : [num(x + rule.a), num(x * (rule.a + 1))]),
  ].filter((t) => Number(t.text) >= 0 && Number(t.text) !== answer);
  const { choices, answer: a } = makeChoices(num(answer), shuffled(wrong, rng), P.choices[level], rng);
  return {
    prompt: 'What comes out?',
    stage: {
      kind: 'machine',
      rows: shownIn.map((i) => ({ input: num(i), output: num(apply(i)) })),
      next: num(x),
    },
    choices,
    answer: a,
    why: `The machine ${rule.label}!`,
  };
}

// ---------------------------------------------------------------- Odd Number Out

/** A rule the others all follow (and the odd one doesn't). */
export interface NumberRule {
  readonly id: string;
  readonly test: (n: number) => boolean;
  readonly why: string;
}

const multipleOf = (k: number, words: string): NumberRule => ({
  id: `x${String(k)}`,
  test: (n) => n % k === 0,
  why: `The others all count by ${words}!`,
});

export const NUMBER_RULES: Readonly<Record<PuzzleLevel, readonly NumberRule[]>> = {
  easy: [
    { id: 'even', test: (n) => n % 2 === 0, why: 'The others are all even!' },
    { id: 'odd', test: (n) => n % 2 === 1, why: 'The others are all odd!' },
  ],
  medium: [multipleOf(2, '2s'), multipleOf(5, '5s'), multipleOf(10, '10s')],
  hard: [
    multipleOf(3, '3s'),
    multipleOf(4, '4s'),
    multipleOf(9, '9s'),
    { id: 'teen', test: (n) => n >= 13 && n <= 19, why: 'The others are all teen numbers!' },
  ],
};
const ALL_RULES = Object.values(NUMBER_RULES).flat();
const RANGE: Record<PuzzleLevel, number> = { easy: 20, medium: 60, hard: 99 };

function oddNumberOut(level: PuzzleLevel, rng: () => number = defaultRng): ThemedPuzzle {
  const n = P.oddNumberOut.items[level];
  for (let guard = 0; ; guard++) {
    const rule = pick(NUMBER_RULES[level], rng);
    const max = rule.id === 'teen' ? 30 : RANGE[level];
    const fits: number[] = [];
    const misses: number[] = [];
    for (let k = 1; k <= max; k++) (rule.test(k) ? fits : misses).push(k);
    const same = shuffled(fits, rng).slice(0, n - 1);
    // The odd one sits close to one of the others (one or two away), so it isn't given away by size.
    const near = misses.filter((m) => same.some((s) => Math.abs(s - m) <= 2));
    const odd = pick(near.length ? near : misses, rng);
    const items = [...same, odd];
    // No other rule may single out a different number.
    const clash = ALL_RULES.some((r) => {
      const fails = items.filter((x) => !r.test(x));
      const passes = items.filter((x) => r.test(x));
      return (fails.length === 1 && fails[0] !== odd) || (passes.length === 1 && passes[0] !== odd);
    });
    if (clash && guard < 200) continue;
    const cards = shuffled(items, rng).map(num);
    return {
      prompt: 'Which number doesn’t fit?',
      stage: { kind: 'shelf' },
      choices: cards,
      answer: cards.findIndex((c) => c.text === String(odd)),
      why: rule.why,
    };
  }
}

// ---------------------------------------------------------------- Quick Count

/** Dice dots for 1–6 (0–1 across and down). */
const DICE: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1: [[0.5, 0.5]],
  2: [
    [0.25, 0.25],
    [0.75, 0.75],
  ],
  3: [
    [0.2, 0.2],
    [0.5, 0.5],
    [0.8, 0.8],
  ],
  4: [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ],
  5: [
    [0.22, 0.22],
    [0.78, 0.22],
    [0.5, 0.5],
    [0.22, 0.78],
    [0.78, 0.78],
  ],
  6: [
    [0.28, 0.18],
    [0.72, 0.18],
    [0.28, 0.5],
    [0.72, 0.5],
    [0.28, 0.82],
    [0.72, 0.82],
  ],
};

/** `count` spots scattered on a jittered grid (never touching). */
export function scatter(count: number, rng: () => number): { x: number; y: number }[] {
  const cols = 5;
  const rows = 4;
  const cells = shuffled(
    Array.from({ length: cols * rows }, (_, i) => i),
    rng,
  ).slice(0, count);
  return cells.map((c) => ({
    x: ((c % cols) + 0.5 + (rng() - 0.5) * 0.4) / cols,
    y: (Math.floor(c / cols) + 0.5 + (rng() - 0.5) * 0.4) / rows,
  }));
}

function quickCount(level: PuzzleLevel, rng: () => number): ThemedPuzzle {
  const [lo, hi] = P.quickCount.count[level];
  const count = between(lo, hi, rng);
  const spots = level === 'easy' && count <= 6 ? DICE[count].map(([x, y]) => ({ x, y })) : scatter(count, rng);
  const wrong = nearNumbers(count, [1, -1, 2, -2, 3], rng).filter((t) => Number(t.text) >= 1);
  const { choices, answer } = makeChoices(num(count), wrong, P.choices[level], rng);
  return {
    prompt: 'How many did you see?',
    stage: { kind: 'flash', spots },
    choices,
    answer,
    why: `There were ${String(count)}!`,
  };
}

// ---------------------------------------------------------------- Make Ten

/** A Make Ten board: the cards, how many to pick, and what they must add up to. */
export interface MakeTenBoard {
  readonly cards: readonly number[];
  readonly pick: number;
  readonly target: number;
  /** One way to do it (shown if the sand runs out). */
  readonly solution: readonly number[];
}

/** Every way to pick `pick` cards (by index) that add up to `target`. */
export function makeTenSolutions(cards: readonly number[], pick: number, target: number): number[][] {
  const out: number[][] = [];
  const walk = (from: number, chosen: number[], sum: number): void => {
    if (chosen.length === pick) {
      if (sum === target) out.push([...chosen]);
      return;
    }
    for (let i = from; i < cards.length; i++) walk(i + 1, [...chosen, i], sum + cards[i]);
  };
  walk(0, [], 0);
  return out;
}

export function makeTenBoard(level: PuzzleLevel, rng: () => number = defaultRng): MakeTenBoard {
  const M = P.makeTen;
  const n = M.cards[level];
  const k = M.pick[level];
  const target = M.target[level];
  const top = target === 10 ? 9 : 15;
  for (;;) {
    // One way that works…
    const solution: number[] = [];
    let left = target;
    for (let i = 0; i < k - 1; i++) {
      const most = Math.min(top, left - (k - 1 - i));
      const v = between(1, Math.max(1, Math.min(most, Math.floor((left * 2) / (k - i)))), rng);
      solution.push(v);
      left -= v;
    }
    if (left < 1 || left > top) continue;
    solution.push(left);
    // …and other cards (not too many other ways).
    const cards = [...solution];
    while (cards.length < n) cards.push(between(1, top, rng));
    const ways = makeTenSolutions(cards, k, target).length;
    if (ways > 3) continue;
    const order = shuffled(
      cards.map((v, i) => ({ v, i })),
      rng,
    );
    return { cards: order.map((o) => o.v), pick: k, target, solution };
  }
}
