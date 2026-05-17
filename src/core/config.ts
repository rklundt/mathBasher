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
    /**
     * Anti-repeat sliding window — GameScene tracks the last N prompt
     * strings of the current round and re-rolls the generator (up to
     * `recentPromptMaxRerolls` attempts) if the next draw would
     * duplicate one of them. Reduces the "I just saw that exact
     * question" feeling without breaking the answer-uniformity
     * guarantee of the math generators.
     *
     * Why this exists: sprint 1.1 wrap-up repetition audit measured
     * 3.7 duplicate prompts per 20-question round on add-to-10 /
     * sub-to-10 (some answers — like 0 in add-to-10 — have only ONE
     * possible prompt that produces them, so when those answer values
     * are sampled, the same prompt always shows). Anti-repeat
     * eliminates the worst back-to-back-to-back cases without
     * meaningfully biasing the long-run distribution.
     *
     * Tuning:
     *   - 0 = disable anti-repeat entirely (every draw shipped as-is)
     *   - 4 = current default — same prompt can't appear within 5
     *     questions of itself, balances "feels varied" against
     *     "doesn't bias the distribution noticeably"
     *   - higher = more aggressive de-repetition, but biases the
     *     answer distribution if the generator's prompt pool is small
     *     (e.g. add-to-10 has only ~11 distinct prompts for some
     *     answer values; setting this to 10+ would force most draws
     *     to re-roll)
     *
     * The `MaxRerolls` cap defends against an infinite loop if a
     * hypothetical future generator has a tiny prompt pool — after
     * that many attempts, GameScene accepts whatever the last draw
     * was even if it duplicates history. 8 is comfortably above the
     * expected re-roll rate at the default history limit of 4 for
     * any of the implemented generators.
     */
    recentPromptHistoryLimit: 4,
    recentPromptMaxRerolls: 8,
  },
  scoring: {
    basePerCorrect: 100,
    /** points multiplier when the player got it right after a wrong shot */
    afterWrongShotMultiplier: 0.5,
    mathDifficulty: {
      // Multiplier ladder pattern:
      //   - addition baseline = 1.0
      //   - subtraction at same range = +0.5 (operation step)
      //   - "to 20" version of any op = +0.5 over the "to 10" version (range step)
      //   - mult-to-100 = +0.5 over sub-to-20 (operation step at next range)
      //   - mult-to-144 = +0.5 over mult-to-100 (range step)
      // Sprint 1.1 added the two mult tiers; the additive/subtractive entries
      // were pre-registered as stubs in sprint 0.2 with these same multipliers.
      'add-to-10': 1.0,
      'add-to-20': 1.5,
      'sub-to-10': 1.5,
      'sub-to-20': 2.0,
      'mult-to-100': 2.5,
      'mult-to-144': 3.0,
      // Sprint 1.5: division extends the ladder with the same operation-step
      // + range-step pattern (+0.5 each). Division is meaningfully harder
      // than multiplication at the same range because the kid has to
      // recover the FACTOR from the product, which exercises the multiplication
      // table in reverse.
      'div-to-100': 3.5,
      'div-to-144': 4.0,
      // Sprint 1.5: Mixed mode picks one of the 8 above generators randomly
      // at draw time. Multiplier chosen as a representative average — the
      // actual question difficulty varies per-question but the score has to
      // be deterministic per math-type-tile, so a fixed average works. 2.5 is
      // approximately the midpoint between add-to-10 (1.0) and div-to-144 (4.0).
      mixed: 2.5,
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
    /**
     * Jiggle oscillation frequency in Hz (wiggles per second). 3 Hz = three
     * left-right wiggles during the 1-second jiggle window — fast enough
     * to read as "coming loose" anticipation, slow enough to not look
     * frantic. Lifted to config in sprint 0.6.3's wrap-up review for
     * symmetry with the other jiggle knobs.
     */
    preFallJiggleHz: 3,
  },
  hero: {
    /**
     * Hero (yellow shooter block) horizontal movement speed.
     *
     * Tuning history (newest first):
     *   v0.7.5 Story 7 — Story 2's +25% bump helped, but at fast
     *     difficulty the shooter still felt a touch slow against the
     *     falling blocks. Another +10% on top: 316 → 348 px/s
     *     (316 × 1.10 = 347.6, rounded to 348). Cumulative 1.58× the
     *     v0.5 baseline (220 → 348). In-sprint cumulative across
     *     Stories 2 + 7: 1.25 × 1.10 = 1.375× from the pre-0.7.5
     *     value of 253 px/s (253 × 1.375 = 348).
     *   v0.7.5 Story 2 — even after the v0.6.3 +15% bump, the shooter
     *     still felt too slow against the (also-fast) falling blocks.
     *     +25% from 253 → 316 px/s. Cumulative 1.44× the v0.5 baseline
     *     at the time.
     *   v0.6.3 playtest — paired with sprint 0.6's −15% block descent,
     *     the shooter still couldn't physically traverse to the right
     *     answer in time once the player committed. +15% restores the
     *     player's ability to act on a decision before the answer lands.
     *     220 → 253 px/s (220 × 1.15 = 253).
     *   v0.5 baseline: 220 px/s.
     *
     * Block descent rate (config.scoring.speed.{slow,medium,fast}) is
     * NOT touched by these changes — only shooter speed moves.
     */
    runSpeedPxPerSec: 348,
    fireCooldownMs: 200,
    projectileSpeedPxPerSec: 800,
  },
  alien: {
    /**
     * Chassis (number-block) dimensions in design pixels. The collision
     * hitbox and the rider plate widths BOTH derive from these values:
     *   - `HitSystem.findHit` reads `Alien.WIDTH`/`Alien.HEIGHT` directly
     *     (those statics are initialized from this config), so widening
     *     the chassis here automatically widens the aim target — no
     *     other code change needed
     *   - `plateLayers` widths below are expressed as multipliers on
     *     `chassisWidthPx`, so a wider chassis gets a proportionally
     *     wider plate underneath the rider
     *
     * Tuning history:
     *   v1.1 wrap-up playtest — "hard to aim" → bumped chassisWidthPx
     *     80 → 100 (+25%) for easier hit targeting. Height kept at 60
     *     (only the horizontal aim was the issue). To revert: set
     *     chassisWidthPx back to 80 — plateLayers auto-rescale via the
     *     widthScale multipliers, no other change needed.
     *   v0.7 baseline: 80×60 chassis.
     */
    chassisWidthPx: 100,
    chassisHeightPx: 60,
    /**
     * Five-layer rider plate ("alien background gradient") that sits
     * BEHIND the rider sprite, ABOVE the chassis. Each layer is a
     * rounded rectangle with rounded TOP corners + flat BOTTOM corners
     * (the plate visually flows into the chassis below). Stacked back-
     * to-front with increasing alpha for a feathered radial-ish look
     * (outer ring soft, inner core solid).
     *
     * `widthScale` is a multiplier on `chassisWidthPx` so the plate
     * scales together with the chassis — tune the chassis width above
     * and the plate auto-follows. Tuned ratios:
     *   L1 1.00× — chassis-matched outer edge (sprint 1.1 wrap-up
     *     playtest changed this from 1.05× → 1.00× per "needs to be
     *     even with the width of the box with the answer numbers" —
     *     the prior 5% overhang made the plate visibly wider than the
     *     number block, which read as misaligned)
     *   L2 0.95×, L3 0.90×, L4 0.85×, L5 0.80× — progressively narrower
     *     for the feather effect; L5 (alpha 1.0) is the opaque core
     *     that covers the FULL rider sprite vertically
     *
     * `heightPx` is ABSOLUTE (not chassis-derived) because the plate
     * needs to reach from chassis-top up past the rider sprite's top,
     * and the rider sprite has its own size independent of the chassis.
     */
    plateLayers: [
      { widthScale: 1.0, heightPx: 130, alpha: 0.15 },
      { widthScale: 0.95, heightPx: 120, alpha: 0.2 },
      { widthScale: 0.9, heightPx: 110, alpha: 0.25 },
      { widthScale: 0.85, heightPx: 102, alpha: 0.35 },
      { widthScale: 0.8, heightPx: 98, alpha: 1.0 },
    ],
  },
  /**
   * Sprint 2.1 — Asteroid Field game mode tuning. Drift speed + countdown
   * scale with the Speed selector (Slow/Medium/Fast) the same way Alien
   * Shoot's `scoring.speed.*` block does, but tuned independently because
   * the physics are different (free 2D drift + free-aim fire vs. lane drop
   * + auto-traverse hero).
   *
   * Asteroid Field reuses `scoring.speed.{slow,medium,fast}.multiplier`
   * for the score multiplier (so a "Medium-Asteroid-Field-Multiply-12×12"
   * round scores the same per-correct as "Medium-Alien-Shoot-Multiply-12×12").
   */
  asteroidField: {
    /**
     * Asteroid drift speed (px/s) + per-question countdown (seconds) per
     * Speed selector. The countdown is a HARD timeout — when it hits 0,
     * the question is marked wrong and the wave advances.
     *
     * First-pass values; tune in playtest. Faster speed = more drift AND
     * less time. Slower speed = more aim time + slower targets.
     */
    speed: {
      slow: { driftPxPerSec: 30, countdownSec: 25 },
      medium: { driftPxPerSec: 50, countdownSec: 18 },
      fast: { driftPxPerSec: 75, countdownSec: 12 },
    },
    /**
     * Number of asteroids per wave. Matches `layout.targetLanes` (4) so
     * the asteroid count == answer choices count == lane count across
     * both game modes. Could lift to its own knob later but the symmetry
     * is intentional for now.
     */
    asteroidsPerWave: 4,
    /**
     * Minimum spawn distance between two asteroids (design pixels). When
     * spawning, rejected positions force a re-roll until all asteroids
     * are at least this far from each other. Prevents the wave from
     * launching with asteroids visually overlapping.
     */
    minSpawnDistancePx: 200,
    /**
     * Asteroid radius (display + collision) in design pixels. Per-instance
     * scale variation applies on top: each rendered asteroid is between
     * `radiusPx × scaleMin` and `radiusPx × scaleMax`.
     */
    asteroidRadiusPx: 38,
    asteroidScaleMin: 0.85,
    asteroidScaleMax: 1.15,
    /**
     * Per-question physics mode is randomly picked from this enabled set.
     * Each entry produces a different drift behavior:
     *   - "straight" — asteroids drift in straight lines, wrap at edges
     *   - "bounce" — asteroids bounce off the playfield edges
     *   - "orbit" — asteroids orbit slowly around a random center
     * Disable individual modes by removing them from this array.
     */
    enabledPhysicsModes: ['straight', 'bounce', 'orbit'] as const,
    /**
     * Hero projectile speed (px/s) — faster than the answer asteroids so
     * a fired shot reaches the target before the asteroid drifts very
     * far. Tuned to feel snappy without being uncatchable visually.
     */
    projectileSpeedPxPerSec: 600,
    /**
     * Hero rotation speed in radians per second, used by the keyboard
     * arrow-key rotation path. Mouse/touch aim is absolute (point-to-
     * position), so this only affects keyboard players.
     */
    heroRotationRadPerSec: 4.0,
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
     *
     * Tuning history:
     *   - First pass (sprint 0.5/0.6): 56px. Generous padding around the
     *     12px footer text.
     *   - Sprint 0.7 Story 5 playtest: reduced to 28px (half). With the
     *     hero ship now rendered as a real sprite + engine-glow particles
     *     emitting downward from the ship's underside, the prior 56px
     *     footer occluded the engine glow. 28px contains the 12px text
     *     with ~8px padding above/below.
     *   - Sprint 0.7.5 Story 1: bumped to 32px alongside the universal
     *     +20% font bump (footer text 12 → 14 for mobile readability).
     *     14px text + 9px padding above/below = 32. Slightly more
     *     headroom for Baloo 2 descenders too.
     */
    attributionFooterHeightPx: 32,
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
     * DifficultyScene math-tile + Speed-tile grid dimensions.
     *
     * Lifted to config in sprint 1.5 wrap-up (mirroring the sprint 1.1
     * chassis-dims lift). The math-tile
     * dimensions have been re-tuned in TWO consecutive sprints (1.1
     * went 100→116, 1.5 went 116→64 to fit 3 rows of 9 tiles), so
     * keeping them in config means the next layout iteration is a
     * 1-line edit — not a code change to DifficultyScene + the
     * tuning-history comment block.
     *
     * Tuning history:
     *   v1.5 (current): mathTile 220×64, Speed 160×64. 3-row math
     *     grid (4+4+1) fits 9 implemented generators. Tiles match
     *     Speed-button height for visual rhythm. Subtitle dropped
     *     on math tiles (Story 5) so a 64-tall tile is sufficient.
     *   v1.1 wrap-up: 220×116 (subtitle wrapping needed the height).
     *   v0.7.5: 200×80 baseline.
     */
    difficultyTile: {
      mathWidthPx: 220,
      mathHeightPx: 64,
      mathColGapPx: 20,
      mathRowGapPx: 12,
      mathMaxPerRow: 4,
      speedWidthPx: 160,
      speedHeightPx: 64,
      speedGapPx: 20,
      /**
       * Vertical offset (in design pixels) of the section label ABOVE
       * the FIRST math row's center. The 32px-bold sectionLabel kind
       * occupies ~42px (centered on its y-coord = ±21). 60 - 32 - 21 =
       * 7px of visible gap between label-bottom and first-row tile-top.
       */
      mathSectionLabelOffsetY: 60,
      /**
       * Same idea for Speed. Speed tile is 64 tall, so offset 75
       * gives 22px of gap between label-bottom and tile-top — slightly
       * more breathing room than Math row (which has 3 rows of tiles
       * to budget for vertically).
       */
      speedSectionLabelOffsetY: 75,
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
     *    into the footer's Source-URL click zone (sprint 0.6 wrap-up
     *    review finding).
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
