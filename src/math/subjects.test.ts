// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { config } from '@/core/config';
import { SUBJECTS, subjectOf } from '@/core/subjects';
import { generators } from '@/math/registry';

// Lives in src/math (not core) because it checks the subjects against the math generators.
describe('subjects (sprint 2.9.1)', () => {
  it('has Math, with every scoring row as a challenge, in the scoring order', () => {
    expect(SUBJECTS.map((s) => s.id)).toEqual(['math']);
    expect(SUBJECTS[0].label).toBe('Math');
    expect(SUBJECTS[0].challenges).toEqual(Object.keys(config.scoring.mathDifficulty));
  });

  it('puts every challenge in exactly one subject', () => {
    const all = SUBJECTS.flatMap((s) => s.challenges);
    expect(new Set(all).size).toBe(all.length);
  });

  it('every challenge has a question generator, a timing row and a scoring row', () => {
    for (const subject of SUBJECTS) {
      for (const id of subject.challenges) {
        expect(generators[id], id).toBeDefined();
        expect(config.round.mathTimeScale[id], id).toBeGreaterThan(0);
        expect(config.scoring.mathDifficulty[id], id).toBeGreaterThan(0);
      }
    }
  });

  it('finds the subject of a challenge', () => {
    expect(subjectOf('add-fractions').id).toBe('math');
  });
});
