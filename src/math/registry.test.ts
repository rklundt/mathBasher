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
import { generators, getGenerator, getImplementedIds, makeStub } from '@/math/registry';

/**
 * Registry contract tests.
 *
 * Sprint 1.1 update: every Phase 1 generator now has a real implementation
 * (no live stubs in the registry). The stub-error-message contract is
 * still tested below — directly via `makeStub`, which is exported so
 * future sprints that pre-add a key to `config.scoring.mathDifficulty`
 * before writing the generator have a known-good helper to reach for.
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

  describe('makeStub helper (kept for future pre-registration use)', () => {
    /**
     * makeStub is no longer USED in the registry as of sprint 1.1, but it's
     * still exported so a future sprint can pre-register a key before its
     * generator lands. Lock the contract so it stays usable when needed.
     *
     * Use any existing MathId for the test (the helper doesn't actually
     * register itself anywhere — these instances are built and discarded
     * in the test).
     */
    it('returns a generator marked isStub: true', () => {
      const stub = makeStub('add-to-10', 'Add to 10');
      expect(stub.isStub).toBe(true);
      expect(stub.id).toBe('add-to-10');
      expect(stub.label).toBe('Add to 10');
      expect(stub.description).toBe('Coming soon.');
    });

    it('throws an actionable error from .generate() naming the missing path', () => {
      const stub = makeStub('add-to-10', 'Add to 10');
      expect(() => stub.generate()).toThrow(/'add-to-10' is a stub/);
      expect(() => stub.generate()).toThrow(/getImplementedIds/);
      expect(() => stub.generate()).toThrow(/src\/math\/generators\/add-to-10\.ts/);
    });
  });
});
