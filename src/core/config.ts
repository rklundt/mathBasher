// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * THE central tuning file. Every gameplay knob lives here. Game code, scoring
 * code, and system code MUST read from `config` rather than hard-coding numbers.
 *
 * Adding a new math difficulty: add a key to `scoring.mathDifficulty`, add a
 * matching generator file under src/math/generators/, register it in the
 * generator registry. No engine changes required.
 */
export const config = {
  round: {
    questionsPerRound: 20,
    passingCorrect: 14,
    /** stars awarded at: ★ at 14 correct, ★★ at 17, ★★★ at 19 */
    starThresholds: [14, 17, 19] as const,
  },
  scoring: {
    basePerCorrect: 100,
    /** points multiplier when the player got it right after a wrong shot */
    afterWrongShotMultiplier: 0.5,
    mathDifficulty: {
      'add-to-10': 1.0,
      'add-to-20': 1.5,
      'sub-to-10': 1.5,
      'sub-to-20': 2.0,
      // Add new math types here. Engine reads keys via Object.keys.
    },
    speed: {
      // Sprint 0.5.5: descent + penalty rates bumped uniformly across all
      // three tiers (playtest feedback — game felt sluggish even at 'fast').
      // Two passes applied during the sprint: first +10%, then a second +10%
      // on top, for a cumulative ~21% increase from the v0.5.4 baseline.
      // Score multipliers unchanged (still 1.0 / 1.25 / 1.5). Baseline
      // values preserved in commit history if a future tune needs to revert.
      //   slow:   40 → 48   px/s descent;  120 → 145  penalty
      //   medium: 60 → 73   px/s descent;  180 → 218  penalty
      //   fast:   90 → 109  px/s descent;  270 → 327  penalty
      slow: { multiplier: 1.0, descentPxPerSec: 48, penaltyPxPerSec: 145 },
      medium: { multiplier: 1.25, descentPxPerSec: 73, penaltyPxPerSec: 218 },
      fast: { multiplier: 1.5, descentPxPerSec: 109, penaltyPxPerSec: 327 },
    },
  },
  hero: {
    runSpeedPxPerSec: 220,
    fireCooldownMs: 200,
    projectileSpeedPxPerSec: 800,
  },
  layout: {
    /** number of answer lanes across the screen */
    targetLanes: 4,
    /** safe-area padding in design pixels (1280x720 design canvas) */
    safeAreaPaddingPx: 16,
    /**
     * Canonical button dimensions across all menu scenes. Tuned for
     * mouse + touch + keyboard accessibility:
     *  - primary actions (Start, Resume, Play Again, Quit, Change Difficulty,
     *    Main Menu): 280×64 — large enough to dominate the layout
     *  - secondary actions (Settings, Back): 200×56 — clearly subordinate
     *  - game-mode tiles (Alien Shoot, Coming soon): 320×200 — large
     *    pictographic targets
     *  - dense rows (Settings −/+ buttons, difficulty/speed tiles in
     *    DifficultyScene): 56×56 / 160×64 / 200×80 — tight grid layouts
     *
     * All values respect the 44×44 Apple HIG minimum hit area. Pre-refactor
     * (sprint 0.5.5) these numbers were sprinkled across 6 scenes; centralizing
     * here means a "make all primary buttons 320 wide" change is a 1-line edit.
     */
    button: {
      primaryW: 280,
      primaryH: 64,
      secondaryW: 200,
      secondaryH: 56,
      tileW: 320,
      tileH: 200,
    },
  },
} as const;

export type SpeedKey = keyof typeof config.scoring.speed;
export type MathId = keyof typeof config.scoring.mathDifficulty;
