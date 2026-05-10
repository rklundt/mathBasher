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
      // Sprint 0.5.5: descent + penalty rates bumped uniformly +10% across
      // all three tiers (playtest feedback — game felt sluggish even at
      // 'fast'). Score multipliers unchanged. Old values preserved in
      // commit history if a future tune needs to revert.
      //   slow:   40 → 44   px/s descent;  120 → 132  penalty
      //   medium: 60 → 66   px/s descent;  180 → 198  penalty
      //   fast:   90 → 99   px/s descent;  270 → 297  penalty
      slow: { multiplier: 1.0, descentPxPerSec: 44, penaltyPxPerSec: 132 },
      medium: { multiplier: 1.25, descentPxPerSec: 66, penaltyPxPerSec: 198 },
      fast: { multiplier: 1.5, descentPxPerSec: 99, penaltyPxPerSec: 297 },
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
