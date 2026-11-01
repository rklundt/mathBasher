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
  it('Math and Puzzles both open their groups (sprint 2.16: Visual, Words, Numbers)', () => {
    expect(stepAfterSubject('math')).toEqual({ kind: 'groups', subject: 'math' });
    expect(stepAfterSubject('puzzles')).toEqual({ kind: 'groups', subject: 'puzzles' });
  });

  it('Back walks up one step: games › group › subject › Title Screen', () => {
    expect(stepBefore({ kind: 'games', subject: 'math', group: 'math-fun' })).toEqual({
      kind: 'groups',
      subject: 'math',
    });
    expect(stepBefore({ kind: 'groups', subject: 'math' })).toEqual(SUBJECTS_STEP);
    expect(stepBefore(SUBJECTS_STEP)).toBe('title');
  });

  it("Back from a Puzzles group's games goes to Puzzles' groups", () => {
    expect(stepBefore({ kind: 'games', subject: 'puzzles', group: 'words' })).toEqual({
      kind: 'groups',
      subject: 'puzzles',
    });
  });

  it('lists the games on a step', () => {
    expect(gamesOn({ kind: 'games', subject: 'math', group: 'math-basher' })).toEqual([
      'alien-shoot',
      'asteroid-field',
      'number-climb',
      'space-shooter',
    ]);
    expect(gamesOn({ kind: 'games', subject: 'puzzles', group: 'visual' })).toContain('pair-pals');
    expect(gamesOn({ kind: 'games', subject: 'puzzles', group: 'visual' })).toHaveLength(8);
    expect(gamesOn({ kind: 'games', subject: 'puzzles', group: 'words' })).toHaveLength(6);
    expect(gamesOn({ kind: 'games', subject: 'puzzles', group: 'numbers' })).toHaveLength(5);
  });

  it('Change Game opens the games step the game is on', () => {
    expect(gamesStepFor('frog-splash')).toEqual({ kind: 'games', subject: 'math', group: 'math-fun' });
    expect(gamesStepFor('alien-shoot')).toEqual({ kind: 'games', subject: 'math', group: 'math-basher' });
    expect(gamesStepFor('copy-cat')).toEqual({ kind: 'games', subject: 'puzzles', group: 'visual' });
    expect(gamesStepFor('letter-garden')).toEqual({ kind: 'games', subject: 'puzzles', group: 'words' });
    expect(gamesStepFor('make-ten')).toEqual({ kind: 'games', subject: 'puzzles', group: 'numbers' });
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
    expect(trailFor({ kind: 'games', subject: 'puzzles', group: 'numbers' }).map((c) => c.label)).toEqual([
      'Puzzles',
      'Numbers',
    ]);
  });

  it('names each step for the screen tag', () => {
    expect(stepTagName(SUBJECTS_STEP)).toBe('subject');
    expect(stepTagName({ kind: 'groups', subject: 'math' })).toBe('math groups');
    expect(stepTagName({ kind: 'games', subject: 'math', group: 'math-fun' })).toBe('games: Math Fun');
    expect(stepTagName({ kind: 'games', subject: 'puzzles', group: 'words' })).toBe('games: Words');
  });
});
