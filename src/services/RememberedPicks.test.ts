// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { InMemoryStorage, type MinimalStorage } from '@/services/storage';
import { DEFAULT_SPEED, REMEMBERED_PICKS_STORAGE_KEY, RememberedPicks, parsePicks } from '@/services/RememberedPicks';

describe('RememberedPicks', () => {
  it('starts empty: no math type, the default speed, no last game or chooser place', () => {
    const picks = new RememberedPicks(new InMemoryStorage());
    expect(picks.challenge).toBeNull();
    expect(picks.speedFor('alien-shoot')).toBe(DEFAULT_SPEED);
    expect(picks.lastGame).toBeNull();
    expect(picks.subject).toBeNull();
    expect(picks.group).toBeNull();
  });

  it('keeps every pick across a reload (a new instance on the same storage)', () => {
    const storage = new InMemoryStorage();
    const before = new RememberedPicks(storage);
    before.setChallenge('add-to-20');
    before.setSpeed('frog-splash', 'fast');
    before.setLastGame('frog-splash');
    before.setSubject('math');
    before.setGroup('math-fun');

    const after = new RememberedPicks(storage);
    expect(after.challenge).toBe('add-to-20');
    expect(after.speedFor('frog-splash')).toBe('fast');
    expect(after.lastGame).toBe('frog-splash');
    expect(after.subject).toBe('math');
    expect(after.group).toBe('math-fun');
  });

  it('keeps the speed per game: another game keeps its own', () => {
    const picks = new RememberedPicks(new InMemoryStorage());
    picks.setSpeed('frog-splash', 'fast');
    picks.setSpeed('alien-shoot', 'slow');
    expect(picks.speedFor('frog-splash')).toBe('fast');
    expect(picks.speedFor('alien-shoot')).toBe('slow');
    expect(picks.speedFor('bunny-garden')).toBe(DEFAULT_SPEED);
  });

  it('drops values this version does not know', () => {
    const parsed = parsePicks(
      JSON.stringify({
        v: 1,
        challenge: 'add-to-1000',
        speed: { 'alien-shoot': 'fast', 'old-game': 'slow', 'frog-splash': 'warp' },
        lastGame: 'copy-cat',
        subject: 'words',
        group: 'math-fun',
      }),
    );
    expect(parsed.challenge).toBeUndefined();
    expect(parsed.speed).toEqual({ 'alien-shoot': 'fast' });
    expect(parsed.lastGame).toBe('copy-cat');
    expect(parsed.subject).toBeUndefined();
    expect(parsed.group).toBe('math-fun');
  });

  it('starts fresh from an unreadable entry', () => {
    const storage = new InMemoryStorage();
    storage.setItem(REMEMBERED_PICKS_STORAGE_KEY, '{not json');
    expect(new RememberedPicks(storage).challenge).toBeNull();
  });

  it('keeps picks in memory when storage cannot be written', () => {
    const broken: MinimalStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    };
    const picks = new RememberedPicks(broken);
    picks.setChallenge('sub-to-10');
    expect(picks.challenge).toBe('sub-to-10');
  });
});
