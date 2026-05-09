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
      slow: { multiplier: 1.0, descentPxPerSec: 40, penaltyPxPerSec: 120 },
      medium: { multiplier: 1.25, descentPxPerSec: 60, penaltyPxPerSec: 180 },
      fast: { multiplier: 1.5, descentPxPerSec: 90, penaltyPxPerSec: 270 },
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
  },
} as const;

export type SpeedKey = keyof typeof config.scoring.speed;
export type MathId = keyof typeof config.scoring.mathDifficulty;
