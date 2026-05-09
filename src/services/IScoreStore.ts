// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { MathId, SpeedKey } from '@/core/config';

/**
 * One round result. Saved to the score store after the player finishes a round.
 *
 * `gameId` is a string (not a typed union) because the catalogue of game modes
 * is open-ended — adding a new game mode shouldn't require touching this file.
 * Game implementations are responsible for using stable, documented ids
 * (e.g. `'alien-shoot'`).
 */
export interface ScoreEntry {
  /** Game-mode identifier; e.g. `'alien-shoot'`. */
  gameId: string;
  /** Math difficulty identifier from `config.scoring.mathDifficulty`. */
  mathId: MathId;
  /** Speed setting from `config.scoring.speed`. */
  speed: SpeedKey;
  /** Final round points. */
  score: number;
  /** Number of correct answers in the round, 0 to `config.round.questionsPerRound`. */
  correctCount: number;
  /** Whether the round met the passing threshold (`correctCount >= config.round.passingCorrect`). */
  passed: boolean;
  /** Epoch milliseconds when the round ended. */
  achievedAt: number;
}

/**
 * Filter for score-lookup methods. Scores are kept per (game, math, speed)
 * combination — the high-score table for "Add to 10 on Slow" is independent of
 * "Add to 10 on Fast" because the underlying multipliers are different.
 */
export interface ScoreFilter {
  gameId: string;
  mathId: MathId;
  speed: SpeedKey;
}

/**
 * Score-store contract. The in-memory implementation
 * (`SessionScoreStore`) is the v1 default; a future API-backed
 * implementation (Phase 3, alongside accounts) drops in via
 * `scoreStoreFactory.ts` without any change to the call sites in
 * gameplay code.
 *
 * All methods are async-shaped even for the in-memory implementation. The
 * whole point of the interface is that the API-backed store will be a drop-in
 * — switching `Promise.resolve(...)` calls to real network requests must NOT
 * require changes to callers.
 *
 * IMPORTANT — security notes for the future API-backed implementation:
 *
 * 1. Identity is intentionally NOT a parameter. The future `ApiScoreStore`
 *    must derive the acting user from server-side session state (auth cookie,
 *    bearer token validated server-side, etc.) — NEVER from a caller-supplied
 *    `userId`. Adding `userId: string` to `save()` here would create an
 *    insecure-direct-object-reference (IDOR) surface.
 *
 * 2. Score values are NOT to be trusted as authoritative when crossing the
 *    network. The future `ApiScoreStore.save()` must treat client-supplied
 *    `score`, `correctCount`, `passed`, and `achievedAt` as advisory only;
 *    the server must recompute the score from a server-side replay of the
 *    round's `QuestionOutcome[]` and stamp `achievedAt` itself. This shape
 *    is already compatible: a future overload can accept either `ScoreEntry`
 *    (today, in-memory) or `QuestionOutcome[]` (Phase 3, server-recomputed).
 */
export interface IScoreStore {
  /** Persist a single round result. */
  save(entry: ScoreEntry): Promise<void>;

  /**
   * Top `n` entries for a (game, math, speed) combo, sorted by `score`
   * descending. If fewer than `n` entries exist for the combo, returns all of
   * them. Never returns `null` — an empty array means no scores yet.
   */
  top(filter: ScoreFilter, n: number): Promise<ScoreEntry[]>;

  /**
   * Single best entry for a (game, math, speed) combo, or `null` if no scores
   * have been saved for that combo. Equivalent to `(await top(filter, 1))[0]`
   * but lets callers express intent more directly.
   */
  bestForCombo(filter: ScoreFilter): Promise<ScoreEntry | null>;
}
