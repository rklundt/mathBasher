// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import { SessionScoreStore } from '@/services/SessionScoreStore';
import type { ScoreEntry, ScoreFilter } from '@/services/IScoreStore';

const FILTER_A: ScoreFilter = {
  gameId: 'alien-shoot',
  mathId: 'add-to-10',
  speed: 'medium',
};

const FILTER_B: ScoreFilter = {
  gameId: 'alien-shoot',
  mathId: 'add-to-10',
  speed: 'fast', // different speed -> different combo
};

function makeEntry(score: number, filter: ScoreFilter = FILTER_A): ScoreEntry {
  return {
    gameId: filter.gameId,
    mathId: filter.mathId,
    speed: filter.speed,
    score,
    correctCount: Math.min(20, Math.round(score / 100)),
    passed: score >= 1400,
    achievedAt: Date.now(),
  };
}

describe('SessionScoreStore', () => {
  it('save then top returns entries sorted descending by score', async () => {
    const store = new SessionScoreStore();
    await store.save(makeEntry(500));
    await store.save(makeEntry(2500));
    await store.save(makeEntry(1500));

    const top = await store.top(FILTER_A, 3);
    expect(top.map((e) => e.score)).toEqual([2500, 1500, 500]);
  });

  it('top respects the n limit', async () => {
    const store = new SessionScoreStore();
    await store.save(makeEntry(100));
    await store.save(makeEntry(200));
    await store.save(makeEntry(300));

    expect(await store.top(FILTER_A, 2)).toHaveLength(2);
    expect(await store.top(FILTER_A, 1)).toHaveLength(1);
  });

  it('top returns [] when no entries match the filter', async () => {
    const store = new SessionScoreStore();
    await store.save(makeEntry(100, FILTER_A));
    expect(await store.top(FILTER_B, 5)).toEqual([]);
  });

  it('top filters by combo (does not mix mathIds or speeds)', async () => {
    const store = new SessionScoreStore();
    await store.save(makeEntry(100, FILTER_A));
    await store.save(makeEntry(2000, FILTER_B));
    await store.save(makeEntry(500, FILTER_A));

    const topA = await store.top(FILTER_A, 5);
    expect(topA.map((e) => e.score)).toEqual([500, 100]);

    const topB = await store.top(FILTER_B, 5);
    expect(topB.map((e) => e.score)).toEqual([2000]);
  });

  it('bestForCombo returns the highest-score entry for that combo', async () => {
    const store = new SessionScoreStore();
    await store.save(makeEntry(100, FILTER_A));
    await store.save(makeEntry(2000, FILTER_B));
    await store.save(makeEntry(900, FILTER_A));

    const best = await store.bestForCombo(FILTER_A);
    expect(best?.score).toBe(900);
  });

  it('bestForCombo returns null when no entries match', async () => {
    const store = new SessionScoreStore();
    expect(await store.bestForCombo(FILTER_A)).toBeNull();
  });

  it('handles n=0 by returning an empty array (not throwing)', async () => {
    const store = new SessionScoreStore();
    await store.save(makeEntry(100));
    expect(await store.top(FILTER_A, 0)).toEqual([]);
  });

  it('handles negative n the same as n=0 (defensive)', async () => {
    const store = new SessionScoreStore();
    await store.save(makeEntry(100));
    expect(await store.top(FILTER_A, -3)).toEqual([]);
  });
});
