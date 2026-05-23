// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Pure fraction-math helpers shared between addFractions + subtractFractions
 * (sprint 2.4 stories 3 + 4). No Phaser, no DOM — unit-testable in isolation
 * via Vitest, same pattern as other pure math helpers (e.g. `orbitMath`,
 * `numberClimbFloorMath`).
 *
 * Centralized so the two fraction generators don't fork divergent reduction
 * / formatting logic. If a future math type needs fraction-related math, it
 * imports from here too.
 */

/**
 * Greatest common divisor via the Euclidean algorithm.
 * - `gcd(6, 8) → 2`
 * - `gcd(0, n) → n` (and vice versa)
 * - Operands are absolute-valued first so sign doesn't change the result.
 */
export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x;
}

/**
 * Reduce a fraction to lowest terms.
 * - `reduce(6, 8) → { num: 3, den: 4 }`
 * - `reduce(0, 5) → { num: 0, den: 5 }` (zero numerator is left alone)
 *
 * Throws on `den === 0`.
 */
export function reduce(num: number, den: number): { num: number; den: number } {
  if (den === 0) throw new Error('reduce: denominator cannot be zero');
  if (num === 0) return { num: 0, den };
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

/**
 * Format a non-negative improper fraction as the user-facing display string.
 * Auto-reduces first.
 *
 * - `formatFraction(0, 5) → "0"`
 * - `formatFraction(4, 1) → "4"`
 * - `formatFraction(3, 8) → "3/8"`
 * - `formatFraction(6, 8) → "3/4"` (auto-reduced)
 * - `formatFraction(7, 4) → "1 3/4"` (improper → mixed)
 * - `formatFraction(8, 4) → "2"` (improper that resolves to a whole number)
 *
 * Assumes `num >= 0`, `den > 0`. The fraction generators never produce
 * negative results (Subtract Fractions has a non-negative-result constraint).
 */
export function formatFraction(num: number, den: number): string {
  if (den <= 0) throw new Error('formatFraction: denominator must be > 0');
  if (num < 0) throw new Error('formatFraction: numerator must be >= 0');
  const r = reduce(num, den);
  if (r.num === 0) return '0';
  if (r.den === 1) return String(r.num);
  if (r.num < r.den) return `${r.num}/${r.den}`;
  // Improper → mixed (or whole if remainder is 0 after extracting the whole part).
  const whole = Math.floor(r.num / r.den);
  const remainder = r.num - whole * r.den;
  if (remainder === 0) return String(whole);
  return `${whole} ${remainder}/${r.den}`;
}

/**
 * Decimal value of a fraction. Used as the `correctAnswer` (numeric) for
 * fraction `Question`s — for internal equality + distractor-distinctness
 * checks ONLY. The kid never sees this number; they see `correctDisplay`.
 */
export function decimalValue(num: number, den: number): number {
  if (den === 0) throw new Error('decimalValue: denominator cannot be zero');
  return num / den;
}

/**
 * Convert a mixed-number representation `whole + num/den` to an improper
 * fraction `(whole*den + num)/den`. Helper for arithmetic on mixed numbers
 * — operate as improper fractions, then format back to mixed via
 * `formatFraction()`.
 *
 * - `mixedToImproper(1, 1, 2) → { num: 3, den: 2 }` (1 1/2 = 3/2)
 */
export function mixedToImproper(
  whole: number,
  num: number,
  den: number,
): { num: number; den: number } {
  if (den <= 0) throw new Error('mixedToImproper: denominator must be > 0');
  return { num: whole * den + num, den };
}

/**
 * Build a set of distractor fractions for a fraction-valued question. Shared
 * by `addFractions` and `subtractFractions` (sprint 2.4 stories 3 + 4) so
 * the two generators stay in sync on what counts as a plausible wrong
 * answer.
 *
 * Strategy — produce candidates modeling common kid errors:
 *   - numerator off by ±1
 *   - denominator off by ±1
 *   - doubled denominator (kid error: "added/subtracted the denominators"
 *     produces a fraction with `den * 2`)
 *   - +N fallback variations if dedup eats too many candidates
 *
 * Distractors are filtered to be DISTINCT from the correct answer and from
 * each other, checked by BOTH the reduced-form display string AND the
 * decimal value (so e.g. `2/4` and `1/2` are recognized as the same
 * answer). Returns exactly `count` distractors. Throws on a degenerate
 * input where it can't find `count` distinct fractions (defensive — would
 * indicate a generator bug, not normal input).
 *
 * The returned fractions are NOT pre-reduced — the caller's renderer
 * (`formatFraction`) reduces at display time. Numerators / denominators
 * are non-negative integers (this helper assumes a non-negative correct
 * answer, which both fraction generators enforce).
 */
export function buildFractionDistractors(
  rng: () => number,
  correctNum: number,
  correctDen: number,
  count: number,
): Array<{ num: number; den: number }> {
  const correctR = reduce(correctNum, correctDen);
  const correctKey = `${correctR.num}/${correctR.den}`;
  const correctDecimal = correctR.num / correctR.den;
  const seenKeys = new Set<string>([correctKey]);
  const seenDecimals = new Set<number>([correctDecimal]);

  const candidates: Array<{ num: number; den: number }> = [
    { num: correctNum + 1, den: correctDen },
    { num: Math.max(1, correctNum - 1), den: correctDen },
    { num: correctNum, den: correctDen + 1 },
    correctDen > 1
      ? { num: correctNum, den: correctDen - 1 }
      : { num: correctNum + 2, den: correctDen },
    // "Added/subtracted the denominators" kid error: (a±b)/(d+d) =
    // (a±b)/(2d) — produces the half-value.
    { num: correctNum, den: correctDen * 2 },
    { num: correctNum + 2, den: correctDen },
  ];

  const picked: Array<{ num: number; den: number }> = [];
  for (const c of candidates) {
    if (c.num <= 0 || c.den <= 0) continue;
    const r = reduce(c.num, c.den);
    const key = `${r.num}/${r.den}`;
    const dec = r.num / r.den;
    if (seenKeys.has(key)) continue;
    if (seenDecimals.has(dec)) continue;
    seenKeys.add(key);
    seenDecimals.add(dec);
    picked.push(c);
    if (picked.length === count) break;
  }

  // Safety backfill — walks +N from correctNum to guarantee `count` distinct
  // distractors even on a degenerate correct answer where most candidates
  // collapse to duplicates.
  let bump = 3;
  while (picked.length < count) {
    const fallback = { num: correctNum + bump, den: correctDen };
    const r = reduce(fallback.num, fallback.den);
    const key = `${r.num}/${r.den}`;
    const dec = r.num / r.den;
    if (!seenKeys.has(key) && !seenDecimals.has(dec)) {
      seenKeys.add(key);
      seenDecimals.add(dec);
      picked.push(fallback);
    }
    bump += 1;
    if (bump > 100) {
      throw new Error(
        `buildFractionDistractors: could not build ${count} distinct distractors ` +
          `for correct ${correctNum}/${correctDen}. Likely a generator-input bug.`,
      );
    }
  }

  // Fisher-Yates shuffle in place.
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [picked[i], picked[j]] = [picked[j]!, picked[i]!];
  }
  return picked;
}
