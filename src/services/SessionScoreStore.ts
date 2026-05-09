// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { _th, SeverityLevel } from '@/core/telemetry';
import type { IScoreStore, ScoreEntry, ScoreFilter } from '@/services/IScoreStore';

/**
 * In-memory implementation of `IScoreStore`. Scores live in a single array on
 * the running browser tab and are LOST on page reload — this is the v1 default
 * by deliberate design. Persistence (localStorage in the short term, an
 * API-backed store with accounts in Phase 3) lands in a later milestone.
 *
 * Keep this implementation deliberately simple. The interface is the layer
 * with future-proofing; this class is just "an array with filter + sort".
 */
export class SessionScoreStore implements IScoreStore {
  private readonly entries: ScoreEntry[] = [];

  async save(entry: ScoreEntry): Promise<void> {
    this.entries.push(entry);
    _th.logToAi('SessionScoreStore.save', SeverityLevel.Information, {
      gameId: entry.gameId,
      mathId: entry.mathId,
      speed: entry.speed,
      roundScore: String(entry.score),
    });
  }

  async top(filter: ScoreFilter, n: number): Promise<ScoreEntry[]> {
    _th.logToAi('SessionScoreStore.top', SeverityLevel.Information, {
      gameId: filter.gameId,
      mathId: filter.mathId,
      speed: filter.speed,
    });
    return this.entries
      .filter(
        (e) =>
          e.gameId === filter.gameId &&
          e.mathId === filter.mathId &&
          e.speed === filter.speed,
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  }

  async bestForCombo(filter: ScoreFilter): Promise<ScoreEntry | null> {
    const top = await this.top(filter, 1);
    return top[0] ?? null;
  }
}
