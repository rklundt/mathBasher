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
      // Speed tuning — these are the only six numbers that govern alien
      // descent + wrong-shot penalty acceleration. To rebalance the game
      // globally (e.g. "make it 10% slower at every tier"), edit just
      // these two values per tier; nothing else in the codebase needs to
      // change. `multiplier` is the SCORE multiplier, NOT speed — leaving
      // it alone keeps points-per-correct-answer stable across re-tunes.
      //
      // Tuning history (newest first):
      //   v0.6 playtest (sprint 0.6 — "blaster doesn't have time for a
      //     final pass when I'm thinking"): −15% across all tiers.
      //     slow:   48 → 41   px/s descent;  145 → 123  penalty
      //     medium: 73 → 62   px/s descent;  218 → 185  penalty
      //     fast:  109 → 93   px/s descent;  327 → 278  penalty
      //   Sprint 0.5.5 (two +10% passes during a refactor sprint —
      //     "felt sluggish even at fast"): cumulative ~21% above the
      //     v0.5.4 baseline.
      //   v0.5.4 baseline:
      //     slow 40 / medium 60 / fast 90 px/s descent
      //     slow 120 / medium 180 / fast 270 px/s penalty
      //
      // Cumulative effect from v0.5.4 baseline after this round:
      //   1.10 × 1.10 × 0.85 ≈ 1.03 → ~3% faster than the original
      //   baseline (i.e. effectively neutral; the two +10% passes
      //   over-corrected and the -15% pulls it back near baseline).
      slow: { multiplier: 1.0, descentPxPerSec: 41, penaltyPxPerSec: 123 },
      medium: { multiplier: 1.25, descentPxPerSec: 62, penaltyPxPerSec: 185 },
      fast: { multiplier: 1.5, descentPxPerSec: 93, penaltyPxPerSec: 278 },
    },
  },
  wave: {
    /**
     * Pre-fall "jiggle" phase — when a new question spawns, blocks appear
     * at their starting positions and oscillate left-right in place for
     * `preFallJiggleMs` milliseconds before starting to descend. Reads as
     * "blocks coming loose" anticipation. Gives the player a deliberate
     * window to read the equation + scan answer options before action
     * starts, instead of mashing the fire button on a half-parsed prompt.
     *
     * `preFallJiggleAmplitudePx` is the peak left/right offset from each
     * block's spawn position in design pixels. ±4 px is subtle enough to
     * read as anticipation and not "the block is broken."
     *
     * Tuning history:
     *   v0.6.3: introduced at 1000ms / ±4px after playtests where the
     *     immediate-drop felt rushed for newer players.
     */
    preFallJiggleMs: 1000,
    preFallJiggleAmplitudePx: 4,
  },
  hero: {
    /**
     * Hero (yellow shooter block) horizontal movement speed.
     *
     * Tuning history (newest first):
     *   v0.6.3 playtest — paired with sprint 0.6's −15% block descent,
     *     the shooter still couldn't physically traverse to the right
     *     answer in time once the player committed. +15% restores the
     *     player's ability to act on a decision before the answer lands.
     *     220 → 253 px/s (220 × 1.15 = 253).
     *   v0.5 baseline: 220 px/s.
     *
     * Block descent rate (config.scoring.speed.{slow,medium,fast}) is
     * NOT touched by this change — only shooter speed moves.
     */
    runSpeedPxPerSec: 253,
    fireCooldownMs: 200,
    projectileSpeedPxPerSec: 800,
  },
  layout: {
    /** number of answer lanes across the screen */
    targetLanes: 4,
    /** safe-area padding in design pixels (1280x720 design canvas) */
    safeAreaPaddingPx: 16,
    /**
     * Height of the AGPL §7(b) attribution footer (`AttributionScene`) in
     * design pixels. Load-bearing for legal compliance — the footer must
     * always be fully visible. `TouchFireButton` reads this to position
     * itself ABOVE the footer with a clearance gap (so the button never
     * overlaps the footer's clickable Source URL). Centralized here so a
     * future footer redesign automatically repositions every dependent
     * widget. Mirrors the literal in `AttributionScene.create`.
     */
    attributionFooterHeightPx: 56,
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
    /**
     * On-screen FIRE button (`TouchFireButton`) sizing + positioning.
     * Tunable from config so a playtest tweak (button bigger / smaller /
     * higher / left-handed) is a 1-line change instead of an edit to
     * `src/game/ui/TouchFireButton.ts`.
     *
     *  - `radiusPx` — visual radius of the circular button (80px diameter).
     *  - `hitPadPx` — extra radius added to the hit area for thumb
     *    tolerance. Total hit-circle radius = `radiusPx + hitPadPx`.
     *  - `footerClearancePx` — vertical gap between the BOTTOM of the
     *    button's hit area and the TOP of the AttributionScene footer.
     *    Bumped to 16 (was 8) to prevent the hit-circle from bleeding
     *    into the footer's Source-URL click zone (Senior Dev finding,
     *    sprint 0.6 wrap-up review).
     */
    touchFire: {
      radiusPx: 40,
      hitPadPx: 14,
      footerClearancePx: 16,
    },
  },
} as const;

export type SpeedKey = keyof typeof config.scoring.speed;
export type MathId = keyof typeof config.scoring.mathDifficulty;
