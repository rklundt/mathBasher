// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import {
  SUBJECTS_STEP,
  gamesOn,
  gamesStepFor,
  stepAfterSubject,
  stepBefore,
  stepTagName,
  trailFor,
} from '@/core/chooserSteps';

describe('chooser steps', () => {
  it('Math opens its groups; Puzzles (no groups) skips straight to its games', () => {
    expect(stepAfterSubject('math')).toEqual({ kind: 'groups', subject: 'math' });
    expect(stepAfterSubject('puzzles')).toEqual({ kind: 'games', subject: 'puzzles', group: null });
  });

  it('Back walks up one step: games › group › subject › Title Screen', () => {
    expect(stepBefore({ kind: 'games', subject: 'math', group: 'math-fun' })).toEqual({
      kind: 'groups',
      subject: 'math',
    });
    expect(stepBefore({ kind: 'groups', subject: 'math' })).toEqual(SUBJECTS_STEP);
    expect(stepBefore(SUBJECTS_STEP)).toBe('title');
  });

  it("Back from Puzzles' games goes to the subjects (the group step was skipped)", () => {
    expect(stepBefore({ kind: 'games', subject: 'puzzles', group: null })).toEqual(SUBJECTS_STEP);
  });

  it('lists the games on a step', () => {
    expect(gamesOn({ kind: 'games', subject: 'math', group: 'math-basher' })).toEqual([
      'alien-shoot',
      'asteroid-field',
      'number-climb',
      'space-shooter',
    ]);
    expect(gamesOn({ kind: 'games', subject: 'puzzles', group: null })).toContain('pair-pals');
    expect(gamesOn({ kind: 'games', subject: 'puzzles', group: null })).toHaveLength(8);
  });

  it('Change Game opens the games step the game is on', () => {
    expect(gamesStepFor('frog-splash')).toEqual({ kind: 'games', subject: 'math', group: 'math-fun' });
    expect(gamesStepFor('alien-shoot')).toEqual({ kind: 'games', subject: 'math', group: 'math-basher' });
    expect(gamesStepFor('copy-cat')).toEqual({ kind: 'games', subject: 'puzzles', group: null });
  });

  it('builds the "where you are" trail', () => {
    expect(trailFor(SUBJECTS_STEP)).toEqual([]);
    expect(trailFor({ kind: 'groups', subject: 'math' }).map((c) => c.label)).toEqual(['Math']);
    const games = { kind: 'games', subject: 'math', group: 'math-basher' } as const;
    expect(trailFor(games).map((c) => c.label)).toEqual(['Math', 'mathBasher']);
    expect(trailFor(games)[1].to).toEqual({ kind: 'groups', subject: 'math' });
    expect(trailFor(games, { label: 'Alien Shoot', to: games }).map((c) => c.label)).toEqual([
      'Math',
      'mathBasher',
      'Alien Shoot',
    ]);
    expect(trailFor({ kind: 'games', subject: 'puzzles', group: null }).map((c) => c.label)).toEqual(['Puzzles']);
  });

  it('names each step for the screen tag', () => {
    expect(stepTagName(SUBJECTS_STEP)).toBe('subject');
    expect(stepTagName({ kind: 'groups', subject: 'math' })).toBe('math groups');
    expect(stepTagName({ kind: 'games', subject: 'math', group: 'math-fun' })).toBe('games: Math Fun');
    expect(stepTagName({ kind: 'games', subject: 'puzzles', group: null })).toBe('games: Puzzles');
  });
});
