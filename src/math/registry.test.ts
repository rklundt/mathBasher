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
    ] as const)('%s', (id, expected) => {
      expect(getGenerator(id)).toBe(expected);
    });
  });

  it('every registered generator has a non-empty label and description', () => {
    const ids = Object.keys(generators) as MathId[];
    for (const id of ids) {
      const gen = generators[id];
      expect(typeof gen.label, `'${id}' label`).toBe('string');
      expect(gen.label.length, `'${id}' label is empty`).toBeGreaterThan(0);
      expect(typeof gen.description, `'${id}' description`).toBe('string');
      expect(gen.description.length, `'${id}' description is empty`).toBeGreaterThan(0);
    }
  });

  describe('getImplementedIds', () => {
    it('returns ALL six Phase 1 ids (no stubs remain after sprint 1.1)', () => {
      const implemented = getImplementedIds().sort();
      expect(implemented).toEqual(
        (
          [
            'add-to-10',
            'add-to-20',
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
