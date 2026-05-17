// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { _th, SeverityLevel } from '@/core/telemetry';

/**
 * Session-total score — the cumulative points the player has earned
 * across every round they've played since the page loaded. Distinct
 * from:
 *  - the PER-ROUND score (`RoundController.score`), which resets at
 *    each new round
 *  - the HIGH SCORE store (`SessionScoreStore` / `IScoreStore`), which
 *    persists across page reloads + drives the leaderboard
 *
 * Mutable module-level state. Reset on page reload (no persistence —
 * intentional; session-total is a "what have you done in this play
 * session" number, not a permanent record). Same lifecycle pattern as
 * `Settings._imageAsteroidsEnabled` / `Settings._gameIdListeners`.
 *
 * Sprint 2.1.5 — added so the HUD can show both the current round's
 * score AND a running total across rounds within the session. A kid
 * playing 5 rounds in a row sees their cumulative total grow, which
 * rewards persistence over single-round performance.
 *
 * Add policy: each game scene's `endRound()` calls
 * `SessionTotalScore.add(roundController.score)` BEFORE transitioning
 * to GameOver. Quit-to-menu mid-round does NOT contribute (the partial
 * round score isn't earned yet — same convention the score store uses
 * for abandoned rounds).
 */

let _total = 0;
/**
 * Last value the HUD displayed for the session total. Tracked separately
 * from `_total` so HudScene can animate the count-up from "what the
 * player last saw" to "current" when a new round mounts. HUD reads this
 * on `create`, animates if `_total > _lastDisplayed`, then calls
 * `markDisplayedAs(_total)` to sync them. Module-scope so it survives
 * the HUD's tear-down + re-mount between rounds.
 */
let _lastDisplayed = 0;

export const SessionTotalScore = {
  /** Current session total (sum of all completed rounds this session). */
  get(): number {
    return _total;
  },

  /** Value the HUD most recently committed to displaying. Used by HudScene's count-up tween. */
  getLastDisplayed(): number {
    return _lastDisplayed;
  },

  /** Mark the HUD as caught up to value `n` (called at the end of the count-up tween). */
  markDisplayedAs(n: number): void {
    _lastDisplayed = n;
  },

  /**
   * Add to the session total. Called from each game scene's `endRound()`.
   * Logs a Verbose-severity telemetry event so the per-round
   * contributions are queryable in App Insights without flooding the
   * Information stream.
   */
  add(delta: number): void {
    if (delta === 0) return;
    _total += delta;
    _th.logToAi('SessionTotalScore.add', SeverityLevel.Verbose, {
      reason: `+${String(delta)} → ${String(_total)}`,
    });
  },

  /**
   * Reset to zero. Exists for unit tests and for any future
   * "clear session" feature the user might want (e.g. a long-press on
   * the HUD that wipes the total). Production code paths today never
   * call this — page reload is the only natural reset trigger.
   */
  reset(): void {
    _total = 0;
    _lastDisplayed = 0;
  },
};
