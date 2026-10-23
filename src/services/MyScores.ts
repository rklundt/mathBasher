// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { _th, SeverityLevel } from '@/core/telemetry';
import { SUBJECTS, type ChallengeId, type Subject } from '@/core/subjects';
import { resolveDefaultStorage, type MinimalStorage } from '@/services/storage';

/**
 * Sprint 2.9.2 — "My Scores": the points a child has earned, by day and
 * challenge, saved in this browser (no account, nothing sent anywhere) so a
 * parent can check. `MyScoresScene` shows them by subject → challenge for
 * Today and All-Time.
 *
 * Every round that earned something is recorded once, from
 * `GameSceneLifecycle`: reaching Game Over (out of lives included) counts as
 * finished; leaving mid-round (Quit to Menu, Change Game, Change Challenge)
 * counts as ended early, with the points earned so far.
 *
 * One storage entry. Days are LOCAL dates ("today" starts at the child's
 * midnight). Days older than `KEEP_DAYS` fold into one `earlier` total on
 * the next write, so the entry stays small. Unknown challenge ids are kept
 * (a newer build may have added them) but not shown.
 *
 * Storage that can't be read (corrupt, or written by a newer build) starts
 * empty, and the old text is copied to `MY_SCORES_BACKUP_KEY` before the
 * first save replaces it. Storage that can't be written (private mode, full)
 * keeps this visit's points in memory, so the screen still shows them. Both
 * log a Warning.
 */

export const MY_SCORES_STORAGE_KEY = 'mathbasher.myScores';
/** Where an entry this build can't read (corrupt, or from a newer build) is copied before it's replaced. */
export const MY_SCORES_BACKUP_KEY = 'mathbasher.myScores.unreadable';
/** Days kept one by one; older days fold into `earlier`. */
export const KEEP_DAYS = 90;

/** One challenge's points and rounds (for a day, or summed). */
export interface RoundTally {
  points: number;
  /** Rounds that reached Game Over. */
  finished: number;
  /** Rounds left mid-round (after at least one answer). */
  unfinished: number;
}

type TallyMap = Record<string, RoundTally>;

interface SavedScores {
  v: 1;
  /** The first day anything was recorded (YYYY-MM-DD, local). */
  since: string | null;
  /** Local day (YYYY-MM-DD) → challenge id → tally. */
  days: Record<string, TallyMap>;
  /** Everything from days older than `KEEP_DAYS`. */
  earlier: TallyMap;
}

export interface ChallengeScores {
  readonly id: ChallengeId;
  readonly tally: RoundTally;
}

export interface SubjectScores {
  readonly subject: Subject;
  readonly points: number;
  /** Only challenges played, in picker order. */
  readonly challenges: readonly ChallengeScores[];
}

export interface ScoresView {
  readonly points: number;
  /** Only subjects played, in `SUBJECTS` order. */
  readonly subjects: readonly SubjectScores[];
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-23" for the given moment in local time. */
export function localDayKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${String(d.getFullYear())}-${mm}-${dd}`;
}

/** The local Date at midnight of a day key (for display). */
export function dayKeyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function emptyScores(): SavedScores {
  return { v: 1, since: null, days: {}, earlier: {} };
}

function emptyTally(): RoundTally {
  return { points: 0, finished: 0, unfinished: 0 };
}

function count(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Keep only well-formed tallies; anything else is dropped. */
function cleanTallies(raw: unknown): TallyMap {
  const out: TallyMap = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [id, t] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof t !== 'object' || t === null) continue;
    const r = t as Record<string, unknown>;
    out[id] = { points: count(r.points), finished: count(r.finished), unfinished: count(r.unfinished) };
  }
  return out;
}

/** Parse the saved entry. Throws on anything that isn't a version-1 object. */
function parse(json: string): SavedScores {
  const raw = JSON.parse(json) as unknown;
  if (typeof raw !== 'object' || raw === null || (raw as { v?: unknown }).v !== 1) {
    throw new Error('not a version-1 scores entry');
  }
  const r = raw as Record<string, unknown>;
  const days: Record<string, TallyMap> = {};
  if (typeof r.days === 'object' && r.days !== null) {
    for (const [key, t] of Object.entries(r.days as Record<string, unknown>)) {
      if (DAY_KEY.test(key)) days[key] = cleanTallies(t);
    }
  }
  const since = typeof r.since === 'string' && DAY_KEY.test(r.since) ? r.since : null;
  return { v: 1, since, days, earlier: cleanTallies(r.earlier) };
}

function addInto(target: TallyMap, from: TallyMap): void {
  for (const [id, t] of Object.entries(from)) {
    const cur = (target[id] ??= emptyTally());
    cur.points += t.points;
    cur.finished += t.finished;
    cur.unfinished += t.unfinished;
  }
}

/** Group tallies by subject → challenge, in picker order, played ones only. */
export function groupBySubject(tallies: Readonly<TallyMap>): ScoresView {
  const subjects: SubjectScores[] = [];
  for (const subject of SUBJECTS) {
    const challenges: ChallengeScores[] = [];
    for (const id of subject.challenges) {
      const t = tallies[id];
      if (t && (t.points > 0 || t.finished > 0 || t.unfinished > 0)) challenges.push({ id, tally: { ...t } });
    }
    if (challenges.length > 0) {
      subjects.push({ subject, points: challenges.reduce((sum, c) => sum + c.tally.points, 0), challenges });
    }
  }
  return { points: subjects.reduce((sum, s) => sum + s.points, 0), subjects };
}

/**
 * A challenge row's rounds, kid-friendly: "3 rounds", "3 rounds, 1 ended
 * early", "1 round, ended early", "2 rounds, all ended early".
 */
export function roundsLabel(t: RoundTally): string {
  const total = t.finished + t.unfinished;
  const rounds = `${String(total)} ${total === 1 ? 'round' : 'rounds'}`;
  if (t.unfinished === 0) return rounds;
  if (t.finished === 0) return total === 1 ? `${rounds}, ended early` : `${rounds}, all ended early`;
  return `${rounds}, ${String(t.unfinished)} ended early`;
}

export class ScoreLedger {
  /** The last good copy: what storage said, plus anything storage refused. */
  private data: SavedScores;
  /** True after a failed write: memory is ahead of storage, so don't re-read it. */
  private unsaved = false;
  /** Saved text this build couldn't read; copied aside before the next save. */
  private unreadable: string | undefined;

  constructor(
    private readonly storage: MinimalStorage = resolveDefaultStorage(),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.data = this.load() ?? emptyScores();
  }

  /**
   * Record one round. `finished` = it reached Game Over. Re-reads storage
   * first, so another tab's rounds aren't overwritten.
   */
  record(challengeId: ChallengeId, points: number, finished: boolean): void {
    this.refresh();
    const today = localDayKey(this.now());
    const day = (this.data.days[today] ??= {});
    const t = (day[challengeId] ??= emptyTally());
    t.points += count(points);
    if (finished) t.finished += 1;
    else t.unfinished += 1;
    this.data.since ??= today;
    this.foldOldDays();
    this.save();
    _th.logToAi('MyScores.RoundRecorded', SeverityLevel.Verbose, {
      mathId: challengeId,
      roundScore: String(count(points)),
      reason: finished ? 'finished' : 'ended-early',
    });
  }

  /** Today's points (since local midnight). */
  today(): ScoresView {
    this.refresh();
    return groupBySubject(this.data.days[localDayKey(this.now())] ?? {});
  }

  /** Everything saved in this browser. */
  allTime(): ScoresView {
    this.refresh();
    const all: TallyMap = {};
    addInto(all, this.data.earlier);
    for (const day of Object.values(this.data.days)) addInto(all, day);
    return groupBySubject(all);
  }

  /** The first day anything was recorded (local), or null. */
  since(): string | null {
    this.refresh();
    return this.data.since;
  }

  /**
   * Pick up another tab's rounds (or a cleared entry), unless memory holds
   * rounds storage refused. Storage that can't be read leaves memory as is.
   */
  private refresh(): void {
    if (this.unsaved) return;
    const saved = this.load();
    if (saved === null) this.data = emptyScores();
    else if (saved !== undefined) this.data = saved;
  }

  private foldOldDays(): void {
    const n = this.now();
    const cutoff = localDayKey(new Date(n.getFullYear(), n.getMonth(), n.getDate() - KEEP_DAYS));
    for (const key of Object.keys(this.data.days)) {
      if (key < cutoff) {
        addInto(this.data.earlier, this.data.days[key]);
        delete this.data.days[key];
      }
    }
  }

  /** The saved entry; null when there's none; undefined when it can't be read. */
  private load(): SavedScores | null | undefined {
    let json: string | null;
    try {
      json = this.storage.getItem(MY_SCORES_STORAGE_KEY);
    } catch (err) {
      _th.logToAi('MyScores.LoadFailed', SeverityLevel.Warning, { reason: String(err), fallback: 'memory' });
      return undefined;
    }
    if (json === null) return null;
    try {
      return parse(json);
    } catch (err) {
      // Warn once per unreadable entry, not on every look.
      if (this.unreadable === json) return undefined;
      this.unreadable = json;
      _th.logToAi('MyScores.LoadFailed', SeverityLevel.Warning, { reason: String(err), fallback: 'memory' });
      return undefined;
    }
  }

  private save(): void {
    try {
      if (this.unreadable !== undefined) {
        this.storage.setItem(MY_SCORES_BACKUP_KEY, this.unreadable);
        this.unreadable = undefined;
      }
      this.storage.setItem(MY_SCORES_STORAGE_KEY, JSON.stringify(this.data));
      this.unsaved = false;
    } catch (err) {
      this.unsaved = true;
      _th.logToAi('MyScores.SaveFailed', SeverityLevel.Warning, { reason: String(err), fallback: 'memory' });
    }
  }
}

let _ledger: ScoreLedger | undefined;

/** The app's ledger (created on first use, backed by localStorage). */
export function getMyScores(): ScoreLedger {
  return (_ledger ??= new ScoreLedger());
}
