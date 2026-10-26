// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { Settings } from '@/services/Settings';
import { menuStartTarget, selectChallenge, selectPuzzle } from '@/game/services/challengeSelection';

describe('Menu Start goes back to the last pick (sprint 2.13)', () => {
  it('nothing picked yet: the picker', () => {
    expect(menuStartTarget(null, null)).toEqual({ kind: 'picker' });
  });

  it('a math challenge: Game Select', () => {
    expect(menuStartTarget('challenge', 'add-to-10')).toEqual({ kind: 'game-select' });
  });

  it('a puzzle: its setup, even with a challenge still set', () => {
    expect(menuStartTarget('pair-pals', 'add-to-10')).toEqual({ kind: 'puzzle', puzzle: 'pair-pals' });
    expect(menuStartTarget('pair-pals', null)).toEqual({ kind: 'puzzle', puzzle: 'pair-pals' });
  });

  it('picking the same challenge again after a puzzle makes math the last pick', () => {
    selectChallenge('add-to-20', 'menu');
    selectPuzzle('pair-pals', 'menu');
    expect(Settings.lastPick).toBe('pair-pals');
    expect(selectChallenge('add-to-20', 'menu')).toBe(false); // not a change of challenge…
    expect(Settings.lastPick).toBe('challenge'); // …but the last pick is math again
    expect(Settings.round.challengeId).toBe('add-to-20');
  });
});
