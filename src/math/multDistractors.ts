// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { pickDistractors } from '@/math/distractors';
import { defaultRng } from '@/math/rng';

/**
 * Multiplication-specific distractor picker that prefers "near-miss" products
 * (products of factors close to the correct factor pair) over random integers
 * in the product range.
 *
 * **Why this exists:** the generic `pickDistractors` (used by the additive
 * generators) picks random integers from `[productMin, productMax]`. For
 * multiplication, that produces choice sets like `7 × 8 = ?` → `[56, 12, 91, 33]`
 * — three obvious-nonsense distractors that a kid can eliminate without
 * actually knowing the multiplication fact. The Support reviewer flagged this
 * in the sprint 1.1 wrap-up audit as weakening the practice loop.
 *
 * **Algorithm — "neighborhood of factor pairs":** start with a radius-1 cloud
 * around `(a, b)` (so factor offsets `da, db ∈ {-1, 0, 1}` minus the origin),
 * compute their products, dedupe. If we don't have enough distinct candidates
 * (boundary case at `2×2` or `12×12`), expand to radius 2, then radius 3.
 * If still short after radius 3, fall back to the generic
 * `pickDistractors` to backfill — defense-in-depth so a degenerate input
 * never produces an undersized choice list.
 *
 * **Pedagogical effect:** for `7 × 8 = 56`, candidates after dedup are
 * `{6×7=42, 6×8=48, 6×9=54, 7×7=49, 7×9=63, 8×7=56(=correct,excluded),
 * 8×8=64, 8×9=72}` → 7 valid distractors. Pick 3 → e.g. `[56, 48, 63, 64]`.
 * Now the kid HAS to know the actual fact to pick correctly; eliminating
 * obvious nonsense doesn't work because every choice is a plausible product.
 *
 * **Boundary verification** (worst case at the corner `(2, 2)`):
 *   - radius 1 with factor range `[2, 10]` yields neighbors
 *     {(2,3),(3,2),(3,3)} → products {6, 9} after dedup → only 2 candidates
 *   - radius 2 expands to {(2,3),(2,4),(3,2),(3,3),(3,4),(4,2),(4,3),(4,4)}
 *     → products {6, 8, 9, 12, 16} → 5 candidates → enough for `count = 3`
 *
 * Counterpart corner `(10, 10)` with the same `[2,10]` range:
 *   - radius 1 neighbors {(9,10),(10,9),(9,9)} → products {81, 90} → 2
 *   - radius 2 → {(8,8),(8,9),(8,10),(9,8),(9,9),(9,10),(10,8),(10,9)}
 *     → products {64, 72, 80, 81, 90} → 5 candidates → enough
 *
 * For mult-to-144 (factor range `[2, 12]`), the same boundary analysis
 * holds — radius 2 always produces ≥3 distinct candidates at the corners.
 */
export interface PickMultDistractorsOpts {
  /** First factor of the correct answer. */
  a: number;
  /** Second factor of the correct answer. */
  b: number;
  /** Inclusive lower bound of valid factors (e.g. 2 for mult-to-100). */
  factorMin: number;
  /** Inclusive upper bound of valid factors (e.g. 10 for mult-to-100). */
  factorMax: number;
  /**
   * Inclusive lower bound of the product range, used by the fallback
   * `pickDistractors` call when the neighborhood is degenerate. Should
   * equal `factorMin * factorMin`.
   */
  productMin: number;
  /**
   * Inclusive upper bound of the product range, used by the fallback.
   * Should equal `factorMax * factorMax`.
   */
  productMax: number;
  /** How many distractors to return. */
  count: number;
  /** Optional injected RNG for deterministic tests. Defaults to `defaultRng`. */
  rng?: () => number;
}

/**
 * Maximum neighborhood radius before falling back to the generic random-int
 * `pickDistractors`. Three is comfortably enough for both implemented
 * multiplication generators (mult-to-100 with `[2, 10]` and mult-to-144 with
 * `[2, 12]`) — verified in the boundary analysis comment above. Keeping a
 * cap so a future generator with a degenerate range (e.g. factor range
 * `[5, 5]` — single factor allowed) doesn't loop forever.
 */
const MAX_RADIUS = 3;

export function pickMultiplicationDistractors(opts: PickMultDistractorsOpts): number[] {
  const { a, b, factorMin, factorMax, productMin, productMax, count } = opts;
  const rng = opts.rng ?? defaultRng;
  const correct = a * b;

  if (count <= 0) return [];

  // Build the candidate set, expanding the radius until we have enough
  // distinct distractors OR we hit MAX_RADIUS. Using a Set so duplicate
  // products (e.g. 6×8 and 8×6 both = 48) collapse naturally.
  const candidates = new Set<number>();
  for (let radius = 1; radius <= MAX_RADIUS && candidates.size < count; radius++) {
    for (let da = -radius; da <= radius; da++) {
      for (let db = -radius; db <= radius; db++) {
        if (da === 0 && db === 0) continue; // skip the correct pair itself
        const fa = a + da;
        const fb = b + db;
        if (fa < factorMin || fa > factorMax) continue;
        if (fb < factorMin || fb > factorMax) continue;
        const product = fa * fb;
        if (product === correct) continue; // a different pair could yield correct
        candidates.add(product);
      }
    }
  }

  // Fisher-Yates shuffle of the candidate array, then slice the first `count`.
  // Using Fisher-Yates with the injected rng so seeded tests are reproducible.
  const arr = [...candidates];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  let picked = arr.slice(0, count);

  // Defense-in-depth: if the neighborhood was so degenerate (e.g. factor
  // range collapsed to a single value in some hypothetical future config)
  // that we don't have `count` distinct near-miss products, backfill from
  // the generic random-integer pool. Existing distractors are excluded so
  // the final list stays distinct.
  if (picked.length < count) {
    const need = count - picked.length;
    // pickDistractors excludes the correct answer; we ALSO need to exclude
    // any near-miss products we already picked, so iterate-and-skip rather
    // than recursing into pickDistractors (which only knows about one
    // exclusion).
    const excluded = new Set<number>([correct, ...picked]);
    const backfill: number[] = [];
    for (let v = productMin; v <= productMax && backfill.length < need; v++) {
      if (excluded.has(v)) continue;
      backfill.push(v);
    }
    // Shuffle the backfill so we don't always pick the smallest products.
    for (let i = backfill.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = backfill[i]!;
      backfill[i] = backfill[j]!;
      backfill[j] = tmp;
    }
    picked = picked.concat(backfill.slice(0, need));
  }

  // Final safety: if EVEN the backfill couldn't supply enough (means the
  // product range itself is too small — e.g. factor range producing fewer
  // than `count + 1` distinct products total), surface this as an error
  // rather than returning a short list. The current generators (mult-to-100
  // and mult-to-144) have product pools of 96 / 140 distinct integers,
  // so this branch is unreachable in practice. Kept as a fail-loud guard.
  if (picked.length < count) {
    throw new Error(
      `pickMultiplicationDistractors: cannot produce ${count} distinct distractors ` +
        `for ${a}×${b}=${correct} from factors [${factorMin},${factorMax}] / ` +
        `products [${productMin},${productMax}] — neighborhood + product pool too small`,
    );
  }

  // Reuse the generic distractor sanity (matches what pickDistractors does
  // implicitly): caller can hand the result straight to shuffleAnswers.
  return picked;
}

/**
 * Convenience adapter so the multiplication generators can reach for a
 * pickMultiplicationDistractors call with the same surface ergonomics as
 * pickDistractors. Currently unused (the generators call
 * `pickMultiplicationDistractors` directly), but exported in case a future
 * generator wants to mix strategies via a polymorphic function pointer.
 *
 * Re-exported alongside its imports for grouping. Marked
 * `pickDistractors` as imported so future maintainers see the relationship.
 */
export { pickDistractors };
