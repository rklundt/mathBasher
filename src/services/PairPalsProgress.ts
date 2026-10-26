// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { _th, SeverityLevel } from '@/core/telemetry';
import { config, type PairPalsSize, type PairPalsTheme } from '@/core/config';
import { resolveDefaultStorage, type MinimalStorage } from '@/services/storage';

/**
 * Sprint 2.13 — Pair Pals' memory in this browser: the theme and size picked
 * last (the setup screen opens on them), and the best game (fewest turns)
 * per size, any theme. Nothing is sent anywhere.
 *
 * One storage entry. Storage that can't be read (corrupt, or written by a
 * newer build) starts fresh; storage that can't be written keeps this
 * visit's bests in memory. Both log a Warning, as My Scores does.
 */
export const PAIR_PALS_STORAGE_KEY = 'mathbasher.pairPals';

interface SavedProgress {
  v: 1;
  theme: PairPalsTheme;
  size: PairPalsSize;
  /** Fewest turns to win, per size (missing = never won at that size). */
  best: Partial<Record<PairPalsSize, number>>;
}

/** What finishing a game did to the best. */
export interface GameResult {
  turns: number;
  /** The best before this game (null if it's the first win at this size). */
  previousBest: number | null;
  /** True when this game beat the best (or was the first win). */
  newBest: boolean;
}

const THEMES = config.pairPals.themes as readonly string[];
const SIZES = Object.keys(config.pairPals.sizes);

function defaults(): SavedProgress {
  return { v: 1, theme: config.pairPals.defaults.theme, size: config.pairPals.defaults.size, best: {} };
}

/** A saved entry, cleaned: unknown themes / sizes fall back, odd bests are dropped. Throws if it isn't ours. */
function parse(json: string): SavedProgress {
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== 'object' || raw === null || (raw as { v?: unknown }).v !== 1) {
    throw new Error('not a v1 Pair Pals entry');
  }
  const r = raw as Record<string, unknown>;
  const out = defaults();
  if (typeof r.theme === 'string' && THEMES.includes(r.theme)) out.theme = r.theme as PairPalsTheme;
  if (typeof r.size === 'string' && SIZES.includes(r.size)) out.size = r.size as PairPalsSize;
  if (typeof r.best === 'object' && r.best !== null) {
    for (const [size, turns] of Object.entries(r.best as Record<string, unknown>)) {
      if (SIZES.includes(size) && typeof turns === 'number' && Number.isInteger(turns) && turns > 0) {
        out.best[size as PairPalsSize] = turns;
      }
    }
  }
  return out;
}

export class PairPalsProgress {
  private data: SavedProgress;

  constructor(private readonly storage: MinimalStorage = resolveDefaultStorage()) {
    this.data = this.load();
  }

  get theme(): PairPalsTheme {
    return this.data.theme;
  }

  get size(): PairPalsSize {
    return this.data.size;
  }

  /** Fewest turns to win at this size, or null if never won. */
  best(size: PairPalsSize): number | null {
    return this.data.best[size] ?? null;
  }

  /** Remember the setup screen's picks. */
  choose(theme: PairPalsTheme, size: PairPalsSize): void {
    if (theme === this.data.theme && size === this.data.size) return;
    this.data.theme = theme;
    this.data.size = size;
    this.save();
  }

  /** A won game: keeps the best (fewest turns) for its size. */
  recordWin(size: PairPalsSize, turns: number): GameResult {
    const previousBest = this.best(size);
    const newBest = previousBest === null || turns < previousBest;
    if (newBest) {
      this.data.best[size] = turns;
      this.save();
    }
    return { turns, previousBest, newBest };
  }

  private load(): SavedProgress {
    let json: string | null;
    try {
      json = this.storage.getItem(PAIR_PALS_STORAGE_KEY);
    } catch (err) {
      _th.logToAi('PairPalsProgress.LoadFailed', SeverityLevel.Warning, { reason: String(err), fallback: 'memory' });
      return defaults();
    }
    if (json === null) return defaults();
    try {
      return parse(json);
    } catch (err) {
      _th.logToAi('PairPalsProgress.LoadFailed', SeverityLevel.Warning, { reason: String(err), fallback: 'defaults' });
      return defaults();
    }
  }

  private save(): void {
    try {
      this.storage.setItem(PAIR_PALS_STORAGE_KEY, JSON.stringify(this.data));
    } catch (err) {
      _th.logToAi('PairPalsProgress.SaveFailed', SeverityLevel.Warning, { reason: String(err), fallback: 'memory' });
    }
  }
}

let _progress: PairPalsProgress | undefined;

/** The app's Pair Pals progress (created on first use, backed by localStorage). */
export function getPairPalsProgress(): PairPalsProgress {
  return (_progress ??= new PairPalsProgress());
}
