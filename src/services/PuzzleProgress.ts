// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { _th, SeverityLevel } from '@/core/telemetry';
import { config, type PuzzleLevel } from '@/core/config';
import { ROUND_PUZZLE_IDS, type RoundPuzzleId } from '@/core/gameIds';
import { resolveDefaultStorage, type MinimalStorage } from '@/services/storage';

/**
 * Sprint 2.14 — the puzzle pack's memory in this browser: the level picked
 * last for each puzzle (its setup screen opens on it), and the best round
 * per puzzle per level (most puzzles right first time). Nothing is sent
 * anywhere. Storage that can't be read starts fresh; storage that can't be
 * written keeps this visit's results in memory (both log a Warning), as
 * Pair Pals' progress does.
 */
export const PUZZLE_PROGRESS_STORAGE_KEY = 'mathbasher.puzzles';

interface SavedPuzzles {
  v: 1;
  level: Partial<Record<RoundPuzzleId, PuzzleLevel>>;
  /** Most first-try answers in a round, per puzzle per level. */
  best: Partial<Record<RoundPuzzleId, Partial<Record<PuzzleLevel, number>>>>;
}

/** What a finished round did to the best. */
export interface RoundResult {
  firstTry: number;
  stars: number;
  /** The best before this round (null: the first round at this level). */
  previousBest: number | null;
  newBest: boolean;
}

const LEVELS = Object.keys(config.puzzles.choices) as PuzzleLevel[];

/** Stars for a round: ★★★ all first try, ★★ most, ★ for finishing. */
export function starsFor(firstTry: number): number {
  const S = config.puzzles.stars;
  if (firstTry >= S.three) return 3;
  if (firstTry >= S.two) return 2;
  return 1;
}

function empty(): SavedPuzzles {
  return { v: 1, level: {}, best: {} };
}

function parse(json: string): SavedPuzzles {
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== 'object' || raw === null || (raw as { v?: unknown }).v !== 1) {
    throw new Error('not a v1 puzzles entry');
  }
  const r = raw as Record<string, unknown>;
  const out = empty();
  const isPuzzle = (k: string): k is RoundPuzzleId => (ROUND_PUZZLE_IDS as readonly string[]).includes(k);
  const isLevel = (k: unknown): k is PuzzleLevel => typeof k === 'string' && (LEVELS as string[]).includes(k);
  if (typeof r.level === 'object' && r.level !== null) {
    for (const [id, level] of Object.entries(r.level as Record<string, unknown>)) {
      if (isPuzzle(id) && isLevel(level)) out.level[id] = level;
    }
  }
  if (typeof r.best === 'object' && r.best !== null) {
    for (const [id, levels] of Object.entries(r.best as Record<string, unknown>)) {
      if (!isPuzzle(id) || typeof levels !== 'object' || levels === null) continue;
      for (const [level, n] of Object.entries(levels as Record<string, unknown>)) {
        if (isLevel(level) && typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= config.puzzles.perRound) {
          (out.best[id] ??= {})[level] = n;
        }
      }
    }
  }
  return out;
}

export class PuzzleProgress {
  private data: SavedPuzzles;

  constructor(private readonly storage: MinimalStorage = resolveDefaultStorage()) {
    this.data = this.load();
  }

  /** The level picked last for this puzzle (Easy at first). */
  level(id: RoundPuzzleId): PuzzleLevel {
    return this.data.level[id] ?? 'easy';
  }

  setLevel(id: RoundPuzzleId, level: PuzzleLevel): void {
    if (this.data.level[id] === level) return;
    this.data.level[id] = level;
    this.save();
  }

  /** Most first-try answers in a round at this level, or null if never played. */
  best(id: RoundPuzzleId, level: PuzzleLevel): number | null {
    return this.data.best[id]?.[level] ?? null;
  }

  /** A finished round: keeps the best for its puzzle and level. */
  recordRound(id: RoundPuzzleId, level: PuzzleLevel, firstTry: number): RoundResult {
    const previousBest = this.best(id, level);
    const newBest = previousBest === null || firstTry > previousBest;
    if (newBest) {
      (this.data.best[id] ??= {})[level] = firstTry;
      this.save();
    }
    return { firstTry, stars: starsFor(firstTry), previousBest, newBest };
  }

  private load(): SavedPuzzles {
    let json: string | null;
    try {
      json = this.storage.getItem(PUZZLE_PROGRESS_STORAGE_KEY);
    } catch (err) {
      _th.logToAi('PuzzleProgress.LoadFailed', SeverityLevel.Warning, { reason: String(err), fallback: 'memory' });
      return empty();
    }
    if (json === null) return empty();
    try {
      return parse(json);
    } catch (err) {
      _th.logToAi('PuzzleProgress.LoadFailed', SeverityLevel.Warning, { reason: String(err), fallback: 'defaults' });
      return empty();
    }
  }

  private save(): void {
    try {
      this.storage.setItem(PUZZLE_PROGRESS_STORAGE_KEY, JSON.stringify(this.data));
    } catch (err) {
      _th.logToAi('PuzzleProgress.SaveFailed', SeverityLevel.Warning, { reason: String(err), fallback: 'memory' });
    }
  }
}

let _progress: PuzzleProgress | undefined;

/** The app's puzzle progress (created on first use, backed by localStorage). */
export function getPuzzleProgress(): PuzzleProgress {
  return (_progress ??= new PuzzleProgress());
}
