// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import { config, type MathId } from '@/core/config';
import { generators } from '@/math/registry';
import { mulberry32 } from '@/test-utils/mulberry32';

/**
 * Sprint 1.1 Story 6 — cross-cutting distractor-quality spot-check.
 *
 * Per-generator test files cover math correctness (parsing, ranges, the
 * specific operator). This file enforces a SINGLE rule across every
 * implemented generator: distractor sets are never broken.
 *
 * The rules a "broken" set would violate:
 *   1. The distractor set must contain the correct answer somewhere
 *   2. Every choice must be distinct (no duplicate options)
 *   3. Every choice must fall in the documented range for the generator
 *      (the per-generator test enforces this; this file double-checks
 *      it cross-cuttingly so a future generator that forgets to plug
 *      `min` / `max` into pickDistractors is caught here, not at
 *      playtest)
 *   4. Choices count == config.layout.targetLanes (4)
 *
 * The cross-cutting check is cheap insurance — adding a new generator
 * automatically gets this protection because the test iterates the
 * registry. No per-generator update required.
 */

interface RangeSpec {
  min: number;
  max: number;
}

/**
 * Documented [min, max] for each generator's choice range. Mirrors what
 * each generator's own test file verifies, kept here so the cross-cutting
 * check is a single source of truth.
 *
 * If a future MathId is added to `config.scoring.mathDifficulty` and the
 * matching generator is implemented, add an entry here. Missing entries
 * fail fast (test below catches it).
 */
const RANGES: Readonly<Record<MathId, RangeSpec>> = {
  'add-to-10': { min: 0, max: 10 },
  'add-to-20': { min: 2, max: 20 },
  'sub-to-10': { min: 0, max: 10 },
  'sub-to-20': { min: 0, max: 20 },
  'mult-to-100': { min: 4, max: 100 },
  'mult-to-144': { min: 4, max: 144 },
  // Sprint 1.5 — division answers ARE the quotient, so the choice range
  // matches the quotient range (NOT the dividend range). Distractor pool
  // for divTo100 is [2, 10]; for divTo144 it's [2, 12].
  'div-to-100': { min: 2, max: 10 },
  'div-to-144': { min: 2, max: 12 },
  // Sprint 1.5 — Mixed inherits whichever delegate it picks at runtime.
  // The min/max here is the UNION of all 8 non-Mixed delegate ranges
  // (smallest min = 0 from add-to-10, largest max = 144 from
  // mult-to-144/div-to-144). The cross-cutting test only enforces "in
  // SOME implemented generator's range" for Mixed — for stricter
  // per-question validation, mixed.test.ts has its own family-detection
  // test via the prompt regex.
  // Sprint 2.4 story 3 — Mixed Math excludes fraction generators
  // (`add-fractions`, `subtract-fractions`) so its values stay integer;
  // this range stays integer-only.
  mixed: { min: 0, max: 144 },
  // Sprint 2.4 story 3 — fraction values are DECIMALS (e.g. 3/8 → 0.375),
  // not integers. Range bounds are [0, 12]: Easy/Hard sums fit easily;
  // Medium can reach ~9.75 (e.g. `4 7/8 + 4 7/8`). The integer-check
  // below is skipped for fraction ids.
  'add-fractions': { min: 0, max: 12 },
  // Sprint 2.4 story 4 — same range as add-fractions; non-negative
  // result is enforced by the generator itself + its own test file.
  'subtract-fractions': { min: 0, max: 12 },
};

/** Math ids whose generator returns non-integer (decimal) choice values. */
const FRACTIONAL_IDS: ReadonlySet<MathId> = new Set<MathId>([
  'add-fractions',
  'subtract-fractions',
]);

const SAMPLES_PER_GENERATOR = 200;

describe('distractor quality across all implemented generators', () => {
  const ids = Object.keys(config.scoring.mathDifficulty) as MathId[];
  const implementedIds = ids.filter((id) => !generators[id].isStub);

  it('the RANGES table covers every implemented generator', () => {
    // Defense: if someone adds a new generator without adding a RANGES
    // entry, this surfaces it BEFORE the per-generator loop below would
    // throw a confusing undefined-property error.
    for (const id of implementedIds) {
      expect(RANGES[id], `missing RANGES entry for '${id}'`).toBeDefined();
    }
  });

  for (const id of implementedIds) {
    describe(`${id}`, () => {
      const range = RANGES[id];
      const gen = generators[id];
      const rng = mulberry32(2026);
      const samples = Array.from({ length: SAMPLES_PER_GENERATOR }, () =>
        gen.generate(rng),
      );

      it(`choices.length === config.layout.targetLanes (${config.layout.targetLanes}) for all ${SAMPLES_PER_GENERATOR} samples`, () => {
        for (const q of samples) {
          expect(q.choices).toHaveLength(config.layout.targetLanes);
        }
      });

      it('choices always include the correct answer', () => {
        for (const q of samples) {
          expect(q.choices, `missing correctAnswer ${q.correctAnswer} from ${q.choices}`).toContain(
            q.correctAnswer,
          );
        }
      });

      it('every choice is distinct (no duplicates)', () => {
        for (const q of samples) {
          const distinctCount = new Set(q.choices).size;
          expect(distinctCount, `duplicate choice in ${q.choices} (prompt: ${q.prompt})`).toBe(
            q.choices.length,
          );
        }
      });

      it(`every choice falls in [${range.min}, ${range.max}]`, () => {
        const isFractional = FRACTIONAL_IDS.has(id);
        for (const q of samples) {
          for (const c of q.choices) {
            // Integer generators must yield integer choices. Fraction
            // generators are exempt (their choices are decimal values
            // like 0.375 by design — sprint 2.4 story 3).
            if (!isFractional) {
              expect(Number.isInteger(c)).toBe(true);
            }
            expect(c, `choice ${c} out of range for ${id}`).toBeGreaterThanOrEqual(range.min);
            expect(c).toBeLessThanOrEqual(range.max);
          }
        }
      });
    });
  }
});
