// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { config } from '@/core/config';
import { CHALLENGE_SUBJECTS, SUBJECTS, subjectById, subjectOf } from '@/core/subjects';
import { PUZZLES } from '@/core/puzzles';
import { generators } from '@/math/registry';

// Lives in src/math (not core) because it checks the subjects against the math generators.
describe('subjects (sprint 2.9.1, Puzzles sprint 2.13)', () => {
  it('has Math then Puzzles; Math has every scoring row as a challenge, in the scoring order', () => {
    expect(SUBJECTS.map((s) => s.id)).toEqual(['math', 'puzzles']);
    expect(SUBJECTS.map((s) => s.label)).toEqual(['Math', 'Puzzles']);
    expect(CHALLENGE_SUBJECTS.map((s) => s.id)).toEqual(['math']);
    expect(CHALLENGE_SUBJECTS[0].challenges).toEqual(Object.keys(config.scoring.mathDifficulty));
  });

  it('puts every challenge in exactly one subject', () => {
    const all = CHALLENGE_SUBJECTS.flatMap((s) => s.challenges);
    expect(new Set(all).size).toBe(all.length);
  });

  it('every challenge has a question generator, a timing row and a scoring row', () => {
    for (const subject of CHALLENGE_SUBJECTS) {
      for (const id of subject.challenges) {
        expect(generators[id], id).toBeDefined();
        expect(config.round.mathTimeScale[id], id).toBeGreaterThan(0);
        expect(config.scoring.mathDifficulty[id], id).toBeGreaterThan(0);
      }
    }
  });

  it('finds the subject of a challenge (never Puzzles)', () => {
    expect(subjectOf('add-fractions').id).toBe('math');
  });

  it('Puzzles lists every puzzle, in order; only built ones name a game', () => {
    const puzzles = subjectById('puzzles');
    expect(puzzles.kind).toBe('puzzles');
    if (puzzles.kind !== 'puzzles') return;
    expect(puzzles.puzzles).toEqual(PUZZLES.map((p) => p.id));
    expect(PUZZLES.find((p) => p.id === 'pair-pals')?.gameId).toBe('pair-pals');
    expect(PUZZLES.find((p) => p.id === 'pattern-train')?.gameId).toBeNull();
  });
});
