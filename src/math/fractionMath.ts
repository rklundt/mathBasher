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
