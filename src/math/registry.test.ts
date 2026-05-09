// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import { config, type MathId } from '@/core/config';
import addTo10 from '@/math/generators/addTo10';
import { generators, getGenerator, getImplementedIds } from '@/math/registry';

describe('registry', () => {
  it('has a generator for every MathId in config.scoring.mathDifficulty', () => {
    const configIds = Object.keys(config.scoring.mathDifficulty) as MathId[];
    const registryIds = Object.keys(generators) as MathId[];
    expect(registryIds.sort()).toEqual(configIds.sort());
  });

  it('getGenerator returns the addTo10 instance for "add-to-10"', () => {
    expect(getGenerator('add-to-10')).toBe(addTo10);
  });

  it('getGenerator returns a stub that throws on .generate() for unimplemented ids', () => {
    const stub = getGenerator('add-to-20');
    expect(stub.id).toBe('add-to-20');
    expect(() => stub.generate()).toThrow(/not yet implemented: add-to-20/i);
  });

  it('every stub has a label and description so the difficulty UI can render it', () => {
    const ids: MathId[] = ['add-to-20', 'sub-to-10', 'sub-to-20'];
    for (const id of ids) {
      const stub = getGenerator(id);
      expect(typeof stub.label).toBe('string');
      expect(stub.label.length).toBeGreaterThan(0);
      expect(typeof stub.description).toBe('string');
      expect(stub.description.length).toBeGreaterThan(0);
    }
  });

  describe('getImplementedIds', () => {
    it('includes "add-to-10"', () => {
      expect(getImplementedIds()).toContain('add-to-10');
    });

    it('excludes the unimplemented stub ids', () => {
      const implemented = getImplementedIds();
      expect(implemented).not.toContain('add-to-20');
      expect(implemented).not.toContain('sub-to-10');
      expect(implemented).not.toContain('sub-to-20');
    });
  });
});
