// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import {
  KEEP_DAYS,
  MY_SCORES_BACKUP_KEY,
  MY_SCORES_STORAGE_KEY,
  ScoreLedger,
  dayKeyToDate,
  groupBySubject,
  localDayKey,
  roundsLabel,
} from '@/services/MyScores';
import { InMemoryStorage, type MinimalStorage } from '@/services/storage';

/** A clock the test can move. */
function clock(start: Date): { now: () => Date; set: (d: Date) => void } {
  let t = start;
  return { now: () => t, set: (d) => (t = d) };
}

class FailingWrites extends InMemoryStorage {
  override setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

describe('localDayKey / dayKeyToDate', () => {
  it('uses the local date, zero-padded', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDayKey(new Date(2026, 9, 23, 0, 0))).toBe('2026-10-23');
  });

  it('round-trips a day key', () => {
    expect(localDayKey(dayKeyToDate('2026-03-09'))).toBe('2026-03-09');
  });
});

describe('ScoreLedger', () => {
  const oct23 = new Date(2026, 9, 23, 15, 0);

  it('starts empty', () => {
    const ledger = new ScoreLedger(new InMemoryStorage(), () => oct23);
    expect(ledger.today()).toEqual({ points: 0, subjects: [] });
    expect(ledger.allTime()).toEqual({ points: 0, subjects: [] });
    expect(ledger.since()).toBeNull();
  });

  it('records finished and ended-early rounds by challenge, grouped by subject in picker order', () => {
    const ledger = new ScoreLedger(new InMemoryStorage(), () => oct23);
    ledger.record('sub-to-10', 400, false);
    ledger.record('add-to-10', 1200, true);
    ledger.record('add-to-10', 300, false);
    ledger.record('add-to-10', 0, true);

    const today = ledger.today();
    expect(today.points).toBe(1900);
    expect(today.subjects).toHaveLength(1);
    expect(today.subjects[0].subject.id).toBe('math');
    expect(today.subjects[0].points).toBe(1900);
    expect(today.subjects[0].challenges.map((c) => c.id)).toEqual(['add-to-10', 'sub-to-10']);
    expect(today.subjects[0].challenges[0].tally).toEqual({ points: 1500, finished: 2, unfinished: 1 });
    expect(today.subjects[0].challenges[1].tally).toEqual({ points: 400, finished: 0, unfinished: 1 });
    expect(ledger.since()).toBe('2026-10-23');
  });

  it('Today starts at local midnight; All-Time keeps every day', () => {
    const c = clock(new Date(2026, 9, 22, 23, 59));
    const ledger = new ScoreLedger(new InMemoryStorage(), c.now);
    ledger.record('add-to-10', 500, true);
    c.set(new Date(2026, 9, 23, 0, 1));
    ledger.record('add-to-10', 200, true);

    expect(ledger.today().points).toBe(200);
    expect(ledger.allTime().points).toBe(700);
    expect(ledger.allTime().subjects[0].challenges[0].tally.finished).toBe(2);
    expect(ledger.since()).toBe('2026-10-22');
  });

  it('persists across ledgers (a reload) and picks up another tab’s rounds', () => {
    const storage = new InMemoryStorage();
    const a = new ScoreLedger(storage, () => oct23);
    const b = new ScoreLedger(storage, () => oct23);
    a.record('add-to-10', 100, true);
    b.record('add-to-10', 50, false);
    expect(a.today().subjects[0].challenges[0].tally).toEqual({ points: 150, finished: 1, unfinished: 1 });
    expect(new ScoreLedger(storage, () => oct23).allTime().points).toBe(150);
  });

  it(`folds days older than ${String(KEEP_DAYS)} into one earlier total`, () => {
    const storage = new InMemoryStorage();
    const c = clock(new Date(2026, 0, 1, 12));
    const ledger = new ScoreLedger(storage, c.now);
    ledger.record('add-to-10', 100, true);
    c.set(new Date(2026, 0, 1 + KEEP_DAYS + 1, 12));
    ledger.record('add-to-10', 10, true);

    const saved = JSON.parse(storage.getItem(MY_SCORES_STORAGE_KEY)!) as {
      days: Record<string, unknown>;
      earlier: Record<string, { points: number }>;
    };
    expect(Object.keys(saved.days)).toEqual([localDayKey(c.now())]);
    expect(saved.earlier['add-to-10'].points).toBe(100);
    expect(ledger.allTime().points).toBe(110);
    expect(ledger.since()).toBe('2026-01-01');
  });

  it('starts empty on corrupt or newer data, copying it aside before the next round replaces it', () => {
    for (const bad of ['{not json', '[]', '{"v":2,"days":{}}', 'null']) {
      const storage = new InMemoryStorage();
      storage.setItem(MY_SCORES_STORAGE_KEY, bad);
      const ledger = new ScoreLedger(storage, () => oct23);
      expect(ledger.allTime().points).toBe(0);
      ledger.record('add-to-10', 100, true);
      expect(new ScoreLedger(storage, () => oct23).allTime().points).toBe(100);
      expect(storage.getItem(MY_SCORES_BACKUP_KEY)).toBe(bad);
    }
  });

  it('drops malformed days and tallies but keeps the good ones', () => {
    const storage = new InMemoryStorage();
    storage.setItem(
      MY_SCORES_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        since: 'yesterday',
        days: {
          '2026-10-23': { 'add-to-10': { points: 300, finished: 1, unfinished: -4 }, 'sub-to-10': 'x' },
          bogus: { 'add-to-10': { points: 999, finished: 9, unfinished: 9 } },
        },
        earlier: { 'add-to-10': { points: 'lots' } },
      }),
    );
    const ledger = new ScoreLedger(storage, () => oct23);
    expect(ledger.allTime().subjects[0].challenges).toEqual([
      { id: 'add-to-10', tally: { points: 300, finished: 1, unfinished: 0 } },
    ]);
    expect(ledger.since()).toBeNull();
  });

  it('keeps unknown challenges saved but does not show them', () => {
    const storage = new InMemoryStorage();
    storage.setItem(
      MY_SCORES_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        since: '2026-10-23',
        days: { '2026-10-23': { 'spell-cat': { points: 70, finished: 1, unfinished: 0 } } },
        earlier: {},
      }),
    );
    const ledger = new ScoreLedger(storage, () => oct23);
    expect(ledger.today().points).toBe(0);
    ledger.record('add-to-10', 10, true);
    expect(storage.getItem(MY_SCORES_STORAGE_KEY)).toContain('spell-cat');
  });

  it('keeps this visit’s rounds in memory when storage refuses to save', () => {
    const storage = new FailingWrites();
    const ledger = new ScoreLedger(storage, () => oct23);
    ledger.record('add-to-10', 100, true);
    ledger.record('add-to-10', 50, false);
    expect(ledger.today().points).toBe(150);
  });

  it('does not let a stale saved copy hide rounds storage refused', () => {
    let refuse = false;
    const base = new InMemoryStorage();
    const storage: MinimalStorage = {
      getItem: (k) => base.getItem(k),
      setItem: (k, v) => {
        if (refuse) throw new Error('full');
        base.setItem(k, v);
      },
      removeItem: (k) => base.removeItem(k),
    };
    const ledger = new ScoreLedger(storage, () => oct23);
    ledger.record('add-to-10', 100, true);
    refuse = true;
    ledger.record('add-to-10', 50, true);
    expect(ledger.today().points).toBe(150);
  });

  it('shows nothing once the saved entry is cleared (site data wiped)', () => {
    const storage = new InMemoryStorage();
    const ledger = new ScoreLedger(storage, () => oct23);
    ledger.record('add-to-10', 100, true);
    storage.removeItem(MY_SCORES_STORAGE_KEY);
    expect(ledger.allTime().points).toBe(0);
  });

  it('survives storage that throws on read', () => {
    const storage: MinimalStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    const ledger = new ScoreLedger(storage, () => oct23);
    ledger.record('add-to-10', 100, true);
    expect(ledger.today().points).toBe(100);
  });

  it('ignores negative or fractional points', () => {
    const ledger = new ScoreLedger(new InMemoryStorage(), () => oct23);
    ledger.record('add-to-10', -50, false);
    ledger.record('add-to-10', 12.7, true);
    expect(ledger.today().subjects[0].challenges[0].tally).toEqual({ points: 12, finished: 1, unfinished: 1 });
  });
});

describe('roundsLabel', () => {
  it('says how many rounds and how many ended early', () => {
    expect(roundsLabel({ points: 0, finished: 1, unfinished: 0 })).toBe('1 round');
    expect(roundsLabel({ points: 0, finished: 3, unfinished: 0 })).toBe('3 rounds');
    expect(roundsLabel({ points: 0, finished: 2, unfinished: 1 })).toBe('3 rounds, 1 ended early');
    expect(roundsLabel({ points: 0, finished: 0, unfinished: 1 })).toBe('1 round, ended early');
    expect(roundsLabel({ points: 0, finished: 0, unfinished: 2 })).toBe('2 rounds, all ended early');
  });
});

describe('groupBySubject', () => {
  it('leaves out challenges with nothing recorded', () => {
    expect(groupBySubject({ 'add-to-10': { points: 0, finished: 0, unfinished: 0 } })).toEqual({
      points: 0,
      subjects: [],
    });
  });
});
