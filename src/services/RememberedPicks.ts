// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { _th, SeverityLevel } from '@/core/telemetry';
import { config, type MathId, type SpeedKey } from '@/core/config';
import { MATH_GAME_IDS, ROUND_PUZZLE_IDS, type GameId, type MathGameId } from '@/core/gameIds';
import { GAME_GROUPS, type GameGroupId } from '@/core/gameGroups';
import type { SubjectId } from '@/core/subjects';
import { resolveDefaultStorage, type MinimalStorage } from '@/services/storage';

/**
 * Sprint 2.15 — the picks a child made last, saved in this browser so they
 * are already selected next time and Start is one tap: the math type (shared
 * by every math game), the speed for each math game, the last game started,
 * and where the Game Chooser was (subject and group). Nothing is sent
 * anywhere. Storage that can't be read starts fresh; storage that can't be
 * written keeps this visit's picks in memory (both log a Warning), as the
 * puzzle progress does.
 *
 * Puzzle levels and Pair Pals' cards and size have their own memory
 * (`PuzzleProgress`, `PairPalsProgress`).
 */
export const REMEMBERED_PICKS_STORAGE_KEY = 'mathbasher.picks';

/** The speed a math game opens on before one is picked. */
export const DEFAULT_SPEED: SpeedKey = 'medium';

interface SavedPicks {
  v: 1;
  challenge?: MathId;
  speed: Partial<Record<MathGameId, SpeedKey>>;
  lastGame?: GameId;
  subject?: SubjectId;
  group?: GameGroupId;
}

const MATH_IDS = Object.keys(config.scoring.mathDifficulty) as MathId[];
const SPEEDS = Object.keys(config.scoring.speed) as SpeedKey[];
const GAME_IDS: readonly GameId[] = [...MATH_GAME_IDS, 'pair-pals', ...ROUND_PUZZLE_IDS];
const SUBJECT_IDS: readonly SubjectId[] = ['math', 'puzzles'];
const GROUP_IDS: readonly GameGroupId[] = GAME_GROUPS.map((g) => g.id);

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function empty(): SavedPicks {
  return { v: 1, speed: {} };
}

/** Read a saved entry, keeping only the values this version knows. */
export function parsePicks(json: string): SavedPicks {
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== 'object' || raw === null || (raw as { v?: unknown }).v !== 1) {
    throw new Error('not a v1 picks entry');
  }
  const r = raw as Record<string, unknown>;
  const out = empty();
  if (isOneOf(MATH_IDS, r.challenge)) out.challenge = r.challenge;
  if (typeof r.speed === 'object' && r.speed !== null) {
    for (const [game, speed] of Object.entries(r.speed as Record<string, unknown>)) {
      if (isOneOf(MATH_GAME_IDS, game) && isOneOf(SPEEDS, speed)) out.speed[game] = speed;
    }
  }
  if (isOneOf(GAME_IDS, r.lastGame)) out.lastGame = r.lastGame;
  if (isOneOf(SUBJECT_IDS, r.subject)) out.subject = r.subject;
  if (isOneOf(GROUP_IDS, r.group)) out.group = r.group;
  return out;
}

export class RememberedPicks {
  private readonly data: SavedPicks;

  constructor(private readonly storage: MinimalStorage = resolveDefaultStorage()) {
    this.data = this.load();
  }

  /** The math type picked last, or null on a first visit. */
  get challenge(): MathId | null {
    return this.data.challenge ?? null;
  }

  setChallenge(id: MathId): void {
    if (this.data.challenge === id) return;
    this.data.challenge = id;
    this.save();
  }

  /** The speed picked last for this game (`DEFAULT_SPEED` before any). */
  speedFor(game: MathGameId): SpeedKey {
    return this.data.speed[game] ?? DEFAULT_SPEED;
  }

  setSpeed(game: MathGameId, speed: SpeedKey): void {
    if (this.data.speed[game] === speed) return;
    this.data.speed[game] = speed;
    this.save();
  }

  /** The game started last from a setup screen (its tile says "Last Played"). */
  get lastGame(): GameId | null {
    return this.data.lastGame ?? null;
  }

  setLastGame(id: GameId): void {
    if (this.data.lastGame === id) return;
    this.data.lastGame = id;
    this.save();
  }

  /** Where the Game Chooser was: the subject, and the group within Math. */
  get subject(): SubjectId | null {
    return this.data.subject ?? null;
  }

  get group(): GameGroupId | null {
    return this.data.group ?? null;
  }

  setSubject(id: SubjectId): void {
    if (this.data.subject === id) return;
    this.data.subject = id;
    this.save();
  }

  setGroup(id: GameGroupId): void {
    if (this.data.group === id) return;
    this.data.group = id;
    this.save();
  }

  private load(): SavedPicks {
    let json: string | null;
    try {
      json = this.storage.getItem(REMEMBERED_PICKS_STORAGE_KEY);
    } catch (err) {
      _th.logToAi('RememberedPicks.LoadFailed', SeverityLevel.Warning, { reason: String(err), fallback: 'memory' });
      return empty();
    }
    if (json === null) return empty();
    try {
      return parsePicks(json);
    } catch (err) {
      _th.logToAi('RememberedPicks.LoadFailed', SeverityLevel.Warning, { reason: String(err), fallback: 'defaults' });
      return empty();
    }
  }

  private save(): void {
    try {
      this.storage.setItem(REMEMBERED_PICKS_STORAGE_KEY, JSON.stringify(this.data));
    } catch (err) {
      _th.logToAi('RememberedPicks.SaveFailed', SeverityLevel.Warning, { reason: String(err), fallback: 'memory' });
    }
  }
}

let _picks: RememberedPicks | undefined;

/** The app's remembered picks (created on first use, backed by localStorage). */
export function getRememberedPicks(): RememberedPicks {
  _picks ??= new RememberedPicks();
  return _picks;
}

/** Tests: start the next `getRememberedPicks()` fresh (optionally on given storage). */
export function _resetRememberedPicksForTests(storage?: MinimalStorage): void {
  _picks = storage === undefined ? undefined : new RememberedPicks(storage);
}
