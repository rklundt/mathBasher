// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import mixed from '@/math/generators/mixed';
import { config } from '@/core/config';
import { mulberry32 } from '@/test-utils/mulberry32';
// SIDE-EFFECT IMPORT: registry.ts wires up mixed's delegate picker via
// `setMixedDelegate` at module-load time. When mixed.test.ts runs in
// isolation (e.g. `vitest run src/math/generators/mixed.test.ts`),
// registry isn't loaded as a transitive dependency of `mixed.ts` itself
// (mixed.ts intentionally has zero registry imports — see its header
// comment), so without this import the picker would be unregistered and
// mixed.generate() would throw. In the full test suite, registry is
// loaded by registry.test.ts and the other generator tests, but
// isolated runs need this explicit pull.
import '@/math/registry';

/**
 * Mixed generator tests.
 *
 * Mixed delegates to one of the OTHER implemented generators at each
 * call. Tests verify:
 *   1. Identity correctness
 *   2. Every returned Question has the expected QuestionGenerator-output
 *      shape (parses to one of the known generator prompt formats)
 *   3. Delegate selection is approximately uniform across non-Mixed
 *      generators (each delegate selected within ±25% of expected share)
 *   4. Mixed never delegates to itself (no infinite recursion risk)
 *   5. Choices always include the correct answer + are length=targetLanes
 *      (delegated property — defends against a regression in any delegate)
 */
describe('mixed generator', () => {
  it('has the expected identity', () => {
    expect(mixed.id).toBe('mixed');
    expect(mixed.label).toBe('Mixed Math');
    expect(mixed.isStub).toBeFalsy();
  });

  describe('1000 sampled questions (seeded)', () => {
    const rng = mulberry32(2026);
    const samples = Array.from({ length: 1000 }, () => mixed.generate(rng));

    it('every question has exactly config.layout.targetLanes choices', () => {
      for (const q of samples) {
        expect(q.choices).toHaveLength(config.layout.targetLanes);
      }
    });

    it('choices always include the correct answer', () => {
      for (const q of samples) {
        expect(q.choices).toContain(q.correctAnswer);
      }
    });

    it('every choice is distinct (no duplicates)', () => {
      for (const q of samples) {
        expect(new Set(q.choices).size).toBe(q.choices.length);
      }
    });

    it('every prompt matches ONE of the known generator prompt formats', () => {
      // Mixed delegates to one of the 8 non-Mixed generators; each
      // generator has a known prompt regex. The union covers all valid
      // outputs Mixed can produce.
      const PROMPT_PATTERNS = [
        /^\d+ \+ \d+ = \?$/,    // addTo10, addTo20
        /^\d+ − \d+ = \?$/,     // subTo10, subTo20 (Unicode minus U+2212)
        /^\d+ × \d+ = \?$/,     // multTo100, multTo144 (Unicode times U+00D7)
        /^\d+ ÷ \d+ = \?$/,     // divTo100, divTo144 (Unicode div U+00F7)
      ];
      for (const q of samples) {
        const matches = PROMPT_PATTERNS.some((re) => re.test(q.prompt));
        expect(matches, `Mixed produced unrecognized prompt: "${q.prompt}"`).toBe(true);
      }
    });
  });

  it('produces the same sequence given the same seed', () => {
    const a = Array.from({ length: 5 }, () => mixed.generate(mulberry32(7)));
    const b = Array.from({ length: 5 }, () => mixed.generate(mulberry32(7)));
    expect(a).toEqual(b);
  });

  describe('delegate distribution (approximately uniform)', () => {
    /**
     * Per-delegate identification is intentionally LOSSY (a "5 + 5 = ?"
     * could come from add-to-10 OR add-to-20). Instead we measure the
     * OPERATOR distribution — each of {+, −, ×, ÷} should appear ~25%
     * since 2 of the 8 non-Mixed delegates use each operator. This is
     * an unambiguous proxy for "delegates are picked uniformly."
     */
    it('each operator family (+ − × ÷) appears within ±15% of the expected 25% share', () => {
      const ITERATIONS = 8000;
      const TOLERANCE = 0.15;
      const rng = mulberry32(42);
      const counts: Record<string, number> = { '+': 0, '−': 0, '×': 0, '÷': 0 };
      for (let i = 0; i < ITERATIONS; i++) {
        const q = mixed.generate(rng);
        for (const op of ['+', '−', '×', '÷']) {
          if (q.prompt.includes(op)) {
            counts[op]! += 1;
            break;
          }
        }
      }
      const expectedShare = 0.25;
      for (const op of ['+', '−', '×', '÷']) {
        const share = counts[op]! / ITERATIONS;
        expect(
          share,
          `operator ${op} appeared ${counts[op]} times = ${(share * 100).toFixed(1)}% (expected ~25%)`,
        ).toBeGreaterThan(expectedShare - TOLERANCE);
        expect(share).toBeLessThan(expectedShare + TOLERANCE);
      }
    });

    it('never delegates to itself (every prompt has a known operator)', () => {
      // Mixed's registry-side picker filter `id !== 'mixed'` guarantees this.
      // Verify by asserting every prompt contains one of the 4 known operators.
      // Mixed itself has no distinctive prompt format, so a self-delegate
      // would either throw (infinite loop) or produce a malformed prompt.
      const rng = mulberry32(99);
      for (let i = 0; i < 500; i++) {
        const q = mixed.generate(rng);
        expect(q.prompt).toMatch(/[+−×÷]/);
        expect(q.prompt.length).toBeGreaterThan(0);
      }
    });
  });
});
