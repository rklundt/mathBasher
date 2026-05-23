// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import { config, type MathId } from '@/core/config';
import addTo10 from '@/math/generators/addTo10';
import addTo20 from '@/math/generators/addTo20';
import subTo10 from '@/math/generators/subTo10';
import subTo20 from '@/math/generators/subTo20';
import multTo100 from '@/math/generators/multTo100';
import multTo144 from '@/math/generators/multTo144';
import divTo100 from '@/math/generators/divTo100';
import divTo144 from '@/math/generators/divTo144';
import mixed from '@/math/generators/mixed';
import addFractions from '@/math/generators/addFractions';
import { generators, getGenerator, getImplementedIds } from '@/math/registry';

/**
 * Registry contract tests.
 *
 * Sprint 1.1 update: every Phase 1 generator now has a real implementation;
 * no live stubs remain in the registry. The previous `makeStub` helper was
 * deleted (no production consumer; YAGNI). Future sprints that pre-add a
 * key to `config.scoring.mathDifficulty` before writing the generator can
 * restore the helper from git history — the registry header comment points
 * at the canonical pattern.
 */
describe('registry', () => {
  it('has a generator for every MathId in config.scoring.mathDifficulty (keyspace sync)', () => {
    const configIds = Object.keys(config.scoring.mathDifficulty) as MathId[];
    const registryIds = Object.keys(generators) as MathId[];
    expect(registryIds.sort()).toEqual(configIds.sort());
  });

  describe('getGenerator returns the expected instance for each implemented id', () => {
    it.each([
      ['add-to-10', addTo10],
      ['add-to-20', addTo20],
      ['sub-to-10', subTo10],
      ['sub-to-20', subTo20],
      ['mult-to-100', multTo100],
      ['mult-to-144', multTo144],
      ['div-to-100', divTo100],
      ['div-to-144', divTo144],
      ['mixed', mixed],
      ['add-fractions', addFractions],
    ] as const)('%s', (id, expected) => {
      expect(getGenerator(id)).toBe(expected);
    });
  });

  it('every registered generator has a non-empty label', () => {
    // Sprint 1.5 wrap-up — `description` field was deleted as dead code
    // (DifficultyScene Story 5 dropped subtitle rendering). If a future
    // sprint restores description for tooltips, add the
    // `expect(gen.description...)` assertion back here.
    const ids = Object.keys(generators) as MathId[];
    for (const id of ids) {
      const gen = generators[id];
      expect(typeof gen.label, `'${id}' label`).toBe('string');
      expect(gen.label.length, `'${id}' label is empty`).toBeGreaterThan(0);
    }
  });

  describe('getImplementedIds', () => {
    it('returns every implemented id (no stubs remain)', () => {
      const implemented = getImplementedIds().sort();
      // Hardcoded list catches regressions where a generator silently drops
      // out of the registry (relies on Object-keys match would still pass).
      // Sprint 2.4 story 3 added `add-fractions`; sprint 2.4 story 4 will
      // add `subtract-fractions`.
      expect(implemented).toEqual(
        (
          [
            'add-fractions',
            'add-to-10',
            'add-to-20',
            'div-to-100',
            'div-to-144',
            'mixed',
            'mult-to-100',
            'mult-to-144',
            'sub-to-10',
            'sub-to-20',
          ] satisfies MathId[]
        ).sort(),
      );
    });

    it('returns the same set as Object.keys(config.scoring.mathDifficulty) when no stubs exist', () => {
      const implemented = getImplementedIds().sort();
      const configIds = (Object.keys(config.scoring.mathDifficulty) as MathId[]).sort();
      expect(implemented).toEqual(configIds);
    });
  });

});
