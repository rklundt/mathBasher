// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { config, type MathId } from '@/core/config';
import { generators } from '@/math/registry';
import { answerWeightedTable, factorTable, pickWeighted } from '@/math/questionMix';
import { mulberry32 } from '@/test-utils/mulberry32';

/**
 * Sprint 2.5.7 — the question mix for every whole-number math type.
 *
 * Playtest feedback: Add to 20 gave too many single-digit answers (2 + 2,
 * 2 + 5); Subtract within 20 kept landing on "− 10" / answer 10 and the
 * answers didn't feel random; Subtract within 10 was half "− 0" and "x − x".
 * These tests lock the shares the weighted tables produce, so a future
 * change can't quietly drift back.
 */

const N = 40_000;

interface Sample {
  a: number;
  b: number;
  answer: number;
  choices: number[];
}

function sample(id: MathId, seed = 2507): Sample[] {
  const rng = mulberry32(seed);
  return Array.from({ length: N }, () => {
    const q = generators[id].generate(rng);
    const [a, b] = q.prompt.match(/\d+/g)!.map(Number) as [number, number];
    return { a, b, answer: q.correctAnswer, choices: q.choices };
  });
}

const share = (xs: Sample[], pred: (s: Sample) => boolean): number => xs.filter(pred).length / xs.length;

function answerShares(xs: Sample[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of xs) m.set(s.answer, (m.get(s.answer) ?? 0) + 1 / xs.length);
  return m;
}

describe('weighted tables', () => {
  it('pickWeighted draws in proportion to weight', () => {
    const rng = mulberry32(1);
    const table = [
      { value: 'a', weight: 1 },
      { value: 'b', weight: 3 },
    ];
    let b = 0;
    for (let i = 0; i < 20_000; i++) if (pickWeighted(table, rng) === 'b') b++;
    expect(b / 20_000).toBeCloseTo(0.75, 1);
  });

  it('answerWeightedTable gives each answer exactly its answer weight', () => {
    // Answer 2 has three problems, answer 3 one; problem weights only split a share.
    const problems = [
      { id: 'x', answer: 2 },
      { id: 'y', answer: 2 },
      { id: 'z', answer: 2 },
      { id: 'w', answer: 3 },
    ];
    const t = answerWeightedTable(
      problems,
      (p) => p.answer,
      () => 1,
      (p) => (p.id === 'x' ? 2 : 1),
    );
    const total = (answer: number) =>
      t.filter((e) => e.value.answer === answer).reduce((s, e) => s + e.weight, 0);
    expect(total(2)).toBeCloseTo(1);
    expect(total(3)).toBeCloseTo(1);
    expect(t.find((e) => e.value.id === 'x')!.weight).toBeCloseTo(0.5);
  });

  it('factorTable makes 10s and 11s rarer', () => {
    const t = factorTable(2, 12);
    const w = (n: number) => t.find((e) => e.value === n)!.weight;
    expect(w(7)).toBe(1);
    expect(w(10)).toBe(config.questionMix.multDiv.tenWeight);
    expect(w(11)).toBe(config.questionMix.multDiv.elevenWeight);
  });
});

describe('Add to 10', () => {
  const xs = sample('add-to-10');

  it('spreads answers 2–10 evenly; 0 and 1 are rare', () => {
    const shares = answerShares(xs);
    const unit = 1 / (9 + 2 * config.questionMix.addTo10.tinyAnswerWeight);
    for (let sum = 2; sum <= 10; sum++) expect(shares.get(sum)! / unit).toBeGreaterThan(0.85);
    for (let sum = 2; sum <= 10; sum++) expect(shares.get(sum)! / unit).toBeLessThan(1.15);
    expect((shares.get(0) ?? 0) + (shares.get(1) ?? 0)).toBeLessThan(0.08);
  });

  it('keeps "+ 0" problems rare', () => {
    expect(share(xs, (s) => s.answer > 0 && (s.a === 0 || s.b === 0))).toBeLessThan(0.15);
  });
});

describe('Add to 20', () => {
  const xs = sample('add-to-20');

  it('makes single-digit answers scarce (about 1 in 8)', () => {
    const single = share(xs, (s) => s.answer < 10);
    expect(single).toBeGreaterThan(0.08);
    expect(single).toBeLessThan(0.17);
  });

  it('spreads sums 10–20 evenly', () => {
    const shares = answerShares(xs);
    const unit = 1 / (11 + 8 * config.questionMix.addTo20.singleDigitAnswerWeight);
    for (let sum = 10; sum <= 20; sum++) {
      expect(shares.get(sum)! / unit, `sum ${sum}`).toBeGreaterThan(0.85);
      expect(shares.get(sum)! / unit, `sum ${sum}`).toBeLessThan(1.15);
    }
  });

  it('mixes crossing-ten facts (8 + 7) with teen addends (13 + 5)', () => {
    expect(share(xs, (s) => s.a <= 9 && s.b <= 9 && s.answer > 10)).toBeGreaterThan(0.3);
    expect(share(xs, (s) => s.a >= 11 || s.b >= 11)).toBeGreaterThan(0.25);
  });

  it('keeps "+ 1" and "+ 10" rare and never uses "+ 0"', () => {
    expect(share(xs, (s) => s.a === 1 || s.b === 1)).toBeLessThan(0.08);
    expect(share(xs, (s) => s.a === 10 || s.b === 10)).toBeLessThan(0.08);
    expect(share(xs, (s) => s.a === 0 || s.b === 0)).toBe(0);
  });
});

describe('Subtract within 10', () => {
  const xs = sample('sub-to-10');

  it('keeps "− 0" and "x − x" rare (was about half)', () => {
    expect(share(xs, (s) => s.b === 0 || s.a === s.b)).toBeLessThan(0.15);
  });

  it('spreads answers 1–9 evenly', () => {
    const shares = answerShares(xs);
    const unit = 1 / (9 + 2 * config.questionMix.subTo10.edgeAnswerWeight);
    for (let r = 1; r <= 9; r++) {
      expect(shares.get(r)! / unit, `answer ${r}`).toBeGreaterThan(0.85);
      expect(shares.get(r)! / unit, `answer ${r}`).toBeLessThan(1.15);
    }
  });
});

describe('Subtract within 20', () => {
  const xs = sample('sub-to-20');

  it('keeps "− 0", "x − x" and "− 10" rare', () => {
    expect(share(xs, (s) => s.b === 0 || s.a === s.b)).toBeLessThan(0.05);
    expect(share(xs, (s) => s.b === 10)).toBeLessThan(0.05);
  });

  it('has no answer that stands out — 10 included', () => {
    const shares = answerShares(xs);
    for (const [answer, sh] of shares) expect(sh, `answer ${answer}`).toBeLessThan(0.09);
    expect(shares.get(10)!).toBeLessThan(0.06);
    // Answers really spread out: at least 17 different answers each show up 2%+.
    expect([...shares.values()].filter((sh) => sh >= 0.02).length).toBeGreaterThanOrEqual(17);
  });

  it('mostly starts from a teen number, often crossing back over ten (13 − 5)', () => {
    expect(share(xs, (s) => s.a >= 11)).toBeGreaterThan(0.8);
    expect(share(xs, (s) => s.a >= 11 && s.b > s.a - 10)).toBeGreaterThan(0.45);
  });
});

describe('Add / Subtract to 20 wrong answers', () => {
  it('sit near the right answer', () => {
    const spread = config.questionMix.nearDistractorSpread;
    for (const id of ['add-to-20', 'sub-to-20'] as const) {
      for (const s of sample(id).slice(0, 5000)) {
        for (const c of s.choices) expect(Math.abs(c - s.answer), `${id} ${s.answer}: ${c}`).toBeLessThanOrEqual(spread);
      }
    }
  });
});

describe('Multiply / divide', () => {
  it.each(['mult-to-100', 'mult-to-144'] as const)('%s: × 10 comes up about half as often as other factors', (id) => {
    const xs = sample(id);
    const f10 = share(xs, (s) => s.a === 10);
    const f7 = share(xs, (s) => s.a === 7);
    expect(f10 / f7).toBeGreaterThan(0.4);
    expect(f10 / f7).toBeLessThan(0.6);
  });

  it.each(['div-to-100', 'div-to-144'] as const)('%s: ÷ 10 and answer 10 come up about half as often', (id) => {
    const xs = sample(id);
    expect(share(xs, (s) => s.b === 10) / share(xs, (s) => s.b === 7)).toBeLessThan(0.6);
    expect(share(xs, (s) => s.answer === 10) / share(xs, (s) => s.answer === 7)).toBeLessThan(0.6);
  });
});
