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
    // Sprint 2.2.1 story 10 — arcade modes (Alien Shoot, Asteroid
    // Field) dropped 20 → 12 to match Number Climb's 12-floor round
    // (playtest: "20 felt long, 12 is the sweet spot"). Number Climb
    // passes its own 12 via the RoundController override; this default
    // now governs the two arcade modes.
    questionsPerRound: 12,
    // 70 % of 12 = 8.4 → 8 (was 14/20 = 70 %). Kept == starThresholds[0]
    // so "passing" still means "earned at least 1 star."
    passingCorrect: 8,
    /**
     * Stars awarded at: ★ at 8 correct, ★★ at 10, ★★★ at 11.
     * Rescaled from the prior 20-question ladder [14,17,19] (70/85/95 %)
     * to 12 questions (67/83/92 %). ★★★ at 11 (not 12) preserves the
     * "miss one and still 3-star" near-perfect cadence.
     */
    starThresholds: [8, 10, 11] as const,
    /**
     * Sprint 2.6.1 — the time to answer ONE question at each difficulty,
     * shared by every timed game (Asteroid Field, Math-a-lotl, Frog Splash,
     * Space Shooter; Space Escape gets this × its floors as one round
     * timer). Then stretched by `mathTimeScale` for harder math. Read it
     * through `questionSeconds()` / `roundSeconds()`.
     *
     * New games use this base too, unless a game's time limit isn't a
     * clock — Alien Shoot's limit is how fast the aliens fall, and keeps
     * its own speeds (`scoring.speed.*.descentPxPerSec`), still slowed
     * by `mathTimeScale`.
     */
    baseQuestionSec: { slow: 25, medium: 18, fast: 12 },
    /**
     * Sprint 2.5.7 — harder math gets more time, in every game mode. Each
     * game's time limit for the chosen difficulty (per-question countdown,
     * Space Escape's round timer) is multiplied by this, and Alien Shoot's
     * descent slows by the same factor. Read through `mathTimeScale()`;
     * scaled seconds are whole numbers (`scaledSeconds()`).
     *
     * Wrong-answer time penalties (`asteroidField.wrongShotCountdownPenaltySec`,
     * `numberClimb.wrongRungTimePenaltySec`) stay fixed on purpose: a slip on
     * harder math costs the same seconds, so a smaller share of the longer time.
     */
    mathTimeScale: {
      'add-to-10': 1.0,
      'sub-to-10': 1.0,
      'add-to-20': 1.25,
      'sub-to-20': 1.25,
      'mult-to-100': 1.5,
      'mult-to-144': 1.5,
      'div-to-100': 1.5,
      'div-to-144': 1.5,
      mixed: 1.5,
      // Sprint 2.6.1 — 2.0 → 3.0 after playtest: adding / subtracting
      // fractions needs much more time than whole-number math at every level.
      'add-fractions': 3.0,
      'subtract-fractions': 3.0,
    },
    /**
     * Anti-repeat sliding window — GameScene tracks the last N prompt
     * strings of the current round and re-rolls the generator (up to
     * `recentPromptMaxRerolls` attempts) if the next draw would
     * duplicate one of them. Reduces the "I just saw that exact
     * question" feeling without breaking the answer-uniformity
     * guarantee of the math generators.
     *
     * Why this exists: sprint 1.1 end-of-sprint repetition check measured
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
  /**
   * SCORING CONFIG (sprint 2.4 story 6 — single source of truth).
   *
   * Every knob that determines the final score lives in this `scoring`
   * block. The formula:
   *
   *     score per correct = basePerCorrect
   *                       × mathDifficulty[mathId]
   *                       × speed[speedKey].multiplier
   *                       × (1.0 normally, or afterWrongShotMultiplier
   *                          once the kid has taken a wrong shot in this round)
   *
   * Multiplier ladder rationale:
   *  - addition baseline = 1.0
   *  - +0.5 per "operation step"  (add → sub → mult → div → fractions)
   *  - +0.5 per "range step"      (to-10 → to-20, to-100 → to-144)
   *  - Mixed = 2.5 (~average of the 8 integer types — fixed because the
   *    per-question difficulty varies but per-tile score has to be
   *    deterministic; could become a weighted average if a multi-select
   *    UI ever lands)
   *  - Fractions (add 4.0 / sub 4.5) sit at the top of the ladder.
   *
   * Cross-game parity: scoring has NO game-mode axis — `ScoreCalculator`
   * takes (mathId, speed) only. Two perfect rounds of (add-to-10, fast)
   * across any two game modes produce the same max score. Locked by the
   * parity tests in `ScoreCalculator.test.ts`.
   *
   * Per-game blocks below (`asteroidField.speed`, `frogSplash.speed`, …)
   * carry difficulty-related game-mechanic tuning (drift, counts; time per
   * question is the shared `round.baseQuestionSec`), NOT score tuning.
   * They cross-reference back to this block.
   * Adding a new math type or scoring multiplier — only edit here.
   */
  scoring: {
    basePerCorrect: 100,
    /** points multiplier when the player got it right after a wrong shot */
    afterWrongShotMultiplier: 0.5,
    /**
     * Sprint 2.10 — round-end bonuses, in right answers' worth (so they scale
     * with the challenge and difficulty like everything else):
     *  - Finish Bonus: the round reached its end (not cut short by lives,
     *    time or leaving).
     *  - Perfect Round: reached the end with every question right first try
     *    (no miss, no time-out, no life lost); on top of the Finish Bonus.
     * Never halved by a wrong shot.
     */
    finishBonusAnswers: 3,
    perfectBonusAnswers: 3,
    /**
     * Sprint 2.11 — speed bonus on top of a right answer's points (after any
     * wrong-shot halving), by the share of the question's time used when it
     * lands. Fastest tier first; past the last cut-off, nothing extra. The
     * first cut-off is the free thinking time: any answer inside it is top tier.
     */
    speedBonus: [
      // Owner, 2026-10-24: 25 / 50 / 75 % made ⚡⚡⚡ too easy; then 15 / 30 / 45 %.
      { upTo: 0.15, bonus: 0.5 }, // ⚡⚡⚡
      { upTo: 0.3, bonus: 0.3 }, // ⚡⚡
      { upTo: 0.45, bonus: 0.1 }, // ⚡
    ],
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
      // Sprint 2.4 (stories 3 + 4): fraction math types — first generators
      // whose CONTENT varies by Speed (Easy = like fractions, Medium = mixed
      // numbers, Hard = unlike fractions). Calibration (per story 7):
      //   - add-fractions      = 4.0 (peer of div-to-144; grade 4/5 territory,
      //                              on par with the hardest division facts)
      //   - subtract-fractions = 4.5 (one +0.5 step past the existing ceiling
      //                              — non-negative-result + borrow-across-whole
      //                              in mixed-number mode carries extra load)
      'add-fractions': 4.0,
      'subtract-fractions': 4.5,
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
      // Sprint 2.5.2 tweak 5 — another -15% on slow + medium ONLY (fast
      // unchanged). Playtest: "the speeder doesn't make it back and forth
      // enough before collision" on the easier tiers. Both descent AND the
      // wrong-shot penalty drop 15% so the accelerated drop stays
      // proportional. slow: 41→35 / 123→105; medium: 62→53 / 185→157.
      slow: { multiplier: 1.0, descentPxPerSec: 35, penaltyPxPerSec: 105 },
      medium: { multiplier: 1.25, descentPxPerSec: 53, penaltyPxPerSec: 157 },
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
     * frantic. Lifted to config in sprint 0.6.3's pre-release review for
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
     *   v1.1 end-of-sprint playtest — "hard to aim" → bumped chassisWidthPx
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
     *   L1 1.00× — chassis-matched outer edge (sprint 1.1 end-of-sprint review
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
     * Asteroid drift speed (px/s) per Speed selector. The countdown is a
     * HARD timeout — when it hits 0, the question is marked wrong and the
     * wave advances.
     *
     * First-pass values; tune in playtest. Faster speed = more drift AND
     * less time. Slower speed = more aim time + slower targets.
     *
     * Game-mechanic tuning only — score multipliers live in
     * `config.scoring.speed[*].multiplier` (sprint 2.4 story 6).
     */
    // Time per question: the shared `round.baseQuestionSec` (sprint 2.6.1).
    speed: {
      slow: { driftPxPerSec: 30 },
      medium: { driftPxPerSec: 50 },
      fast: { driftPxPerSec: 75 },
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
     * Seconds removed from the per-question countdown when the player
     * hits a wrong asteroid. Sprint 2.1 end-of-sprint addition (in addition
     * to the existing half-points-on-eventual-correct flag that Alien
     * Shoot also has). Set to 0 to disable the time penalty.
     *
     * 3 seconds is meaningful at every speed: 3/25 = 12% at Slow,
     * 3/18 = 17% at Medium, 3/12 = 25% at Fast — penalty bites
     * harder on faster rounds, which is the right shape.
     */
    wrongShotCountdownPenaltySec: 3,
    /**
     * Sprint 2.4.1 story 2 + 2.4.2 hotfix — per-QUESTION cap on
     * wrong shots. Each wrong shot still deducts time + locks FIRE
     * for `fireCooldownAfterWrongShotMs`; the Nth wrong shot of a
     * single wave (default N=2 → "one mistake allowed per question")
     * marks that question as wrong and advances to the next. Set to
     * 0 to disable the cap entirely (per-question time penalty +
     * per-correct score halving still apply).
     *
     * Renamed from `maxWrongShotsPerRound` in 2.4.2 hotfix — sprint
     * 2.4.1 incorrectly implemented this as a round-wide budget
     * (cumulative across 12 questions); intent was always per-wave.
     */
    maxWrongShotsPerQuestion: 2,
    /**
     * Sprint 2.4.1 story 2 — FIRE-input lockout after a wrong shot.
     * Prevents rapid-fire spam through the answer set: a wrong shot
     * gates the next FIRE for this many ms. The TOUCH-FIRE button +
     * the keyboard Space + the click-to-fire path all share this
     * gate (it lives at the scene's `handleFire` entry). Set to 0
     * to disable the cooldown.
     */
    fireCooldownAfterWrongShotMs: 1500,
    /**
     * Hero rotation speed in radians per second, used by the keyboard
     * arrow-key rotation path. Mouse/touch aim is absolute (point-to-
     * position), so this only affects keyboard players.
     */
    heroRotationRadPerSec: 4.0,
    /**
     * Sprint 2.1 end-of-sprint review — visual tuning constants for the procedural
     * polygon asteroid (`Asteroid.ts`) and the image-variant scale
     * multiplier. Lifted from inline constants to satisfy the project's
     * "every tunable number in config" convention. A future "make
     * asteroids less spiky" or "shrink the image rocks" playtest call
     * is a 1-line edit here, not a code change to the entity.
     */
    visual: {
      /** Procedural polygon vertex count (12 = "bumpy circle" silhouette). */
      vertexCount: 12,
      /** Radial salt amplitude per vertex (±18% of base radius). */
      saltAmplitude: 0.18,
      /** Outline thickness on the procedural polygon. */
      borderWidthPx: 4,
      /** Border-color brightness multiplier vs. fill (0..1, lower = darker). */
      borderDarken: 0.4,
      /**
       * Image-variant display-scale multiplier vs. procedural diameter.
       * 1.5 = image rocks render 50% larger than polygons (sprint 2.1
       * playtest call — the AI rock art has texture detail that benefits
       * from extra screen real estate). Collision radius is NOT scaled
       * by this; hit-target size matches the procedural variant so
       * gameplay difficulty is identical across modes.
       */
      imageVisualScale: 1.5,
    },
    /**
     * Hero ship sprite dimensions in design pixels. Lifted from inline
     * constants on `AsteroidHero` to satisfy the project's "every
     * tunable number in config" convention. 80×80 square (sprint 2.1
     * playtest sizing — bigger than the original triangle predecessor
     * so the AI-art ship detail reads at gameplay distance).
     */
    hero: {
      widthPx: 80,
      heightPx: 80,
    },
    /**
     * Hero projectile visual dimensions. Capsule shape is rotated to
     * face the travel direction. Collision radius derives from the
     * long axis (LENGTH / 2) — see `AsteroidProjectile.getCollisionRadius`.
     */
    projectile: {
      /** Long-axis length in design pixels (also drives collision radius). */
      lengthPx: 60,
      /** Short-axis thickness in design pixels. */
      thicknessPx: 22,
    },
  },
  /**
   * Sprint 2.2 — Number Climb tuning. The third game mode runs SHORTER
   * rounds (10 floors vs 20 questions) because the one-strike-on-
   * second-wrong mechanic combined with a cumulative timer is harsh
   * enough that 20 floors would feel punishing. Difficulty (the
   * existing SpeedKey enum) doubles as both choice count (2/3/4
   * rungs) AND cumulative timer budget — Slow = generous time +
   * fewer choices, Fast = tight time + more choices.
   */
  numberClimb: {
    /**
     * The one-time-per-session "Lost a life! Try again!" banner after the
     * first wrong pick (sprint 2.2.1; screen-fixed and centred since 2.5.2):
     * holds `holdMs`, then fades over `fadeMs`. `yFrac` (of screen height)
     * puts it in the gap between the next floor's rungs and the settled
     * hero's head; it used to follow the hero's x and clipped off screen on
     * an outer rung.
     */
    lifeLostHint: { holdMs: 1500, fadeMs: 300, yFrac: 0.34 },
    /**
     * Total floors per round. Stars + GameOverScene's "Pass" both
     * pivot off reaching this. Sprint 2.2 end-of-sprint playtest: 10 felt
     * short, 20 (the global default for arcade modes) too long — 12
     * landed as the sweet spot. Since sprint 2.6.1 the round timer is the
     * shared per-question base × these floors (`roundSeconds()`), so changing
     * the floor count changes the timer too. computeClimbStars scales proportionally (40 % / 70 % /
     * 100 % of totalFloors): for 12 → 4 / 8 / 12.
     */
    questionsPerRound: 12,
    // Cumulative round timer: the shared `round.baseQuestionSec` × the
    // floors (`roundSeconds()`, sprint 2.6.1 — was 250 / 180 / 120 s;
    // now 300 / 216 / 144 s before `round.mathTimeScale`). A wrong rung
    // deducts `wrongRungTimePenaltySec`; timer-to-0 ends the round.
    /**
     * Seconds removed from the cumulative timer on each wrong rung
     * pick. Mirrors `asteroidField.wrongShotCountdownPenaltySec` for
     * consistency across the wrong-pick-time-penalty family of modes.
     * Every wrong pick costs -3s (and one life — see
     * `maxStrikesPerClimb`); the kid retries until they pick correct
     * or run out of lives.
     */
    wrongRungTimePenaltySec: 3,
    /**
     * Sprint 2.4.1 story 1 — cumulative "lives" cap across the whole
     * climb. Sprint 2.5.2 made this the SOLE wrong-pick round-ender:
     * the old per-floor "2nd wrong on a floor ends the round" rule was
     * removed because it contradicted the 3-dot lives HUD (a kid could
     * "die" from two wrongs on one floor while the HUD still showed a
     * life remaining).
     *
     * One life is spent on each wrong pick. When `strikesUsed` reaches
     * this value the round ends with the fall-off animation — whether
     * the kid spent all three on one hard floor or one each across
     * three floors. The lives HUD decrements in lockstep, so death
     * always lands exactly when the last dot is spent.
     *
     * 3 lifted from `2.4.1-life-rules.md` (project-owner decision).
     * Re-tune with a single edit here; HUD adapts automatically.
     */
    maxStrikesPerClimb: 3,
    /**
     * Vertical spacing (px) between floor centers — also the height of
     * each floor's framed bg band. Two values so desktop and mobile can
     * tune independently; the scene reads `pickFloorSpacingPx()` at
     * create() time to pick based on viewport.
     *
     * Initial values (sprint 2.2 story 13a): 110px on both. Bumped to
     * 138 (≈ 25% taller) during 13b playtest to give the floor image +
     * rungs + hero more vertical breathing room. The two-value shape
     * is the configurability hook — change either number here and the
     * scene's whole climb retunes (camera follow, preview spacing,
     * frame size) automatically.
     *
     * If desktop + mobile end up at the same value forever, this
     * collapsing back to a single number is a 5-minute change. Keeping
     * them separate now means we don't have to refactor when one needs
     * to budge.
     */
    floorSpacingPx: {
      desktop: 173,
      mobile: 173,
    },
    /**
     * Sprint 2.2.1 story 5 — entity dimensions lifted from file-level
     * constants in the Climb entities into config (matches the
     * `asteroidField.hero` precedent). Colors, font sizes, and tween
     * durations stay as named constants in their entity files — those
     * are visual-design / animation-feel internals, not the
     * gameplay-tuning numbers this config block is for.
     */
    hero: {
      // Sprint 2.5.2 tweak 3 — +33% larger (56→75, 64→85), then a
      // further +15% (75→86, 85→98) after staging playtest. The sprite
      // path scales to fit max(widthPx,heightPx); the OG-Yellow
      // procedural rectangle uses these directly. Rung spacing is
      // independent of the hero size, so the bump is layout-safe;
      // heroRestY in the scene reads heightPx, so the bottom-alignment
      // auto-tracks.
      widthPx: 86,
      heightPx: 98,
      /**
       * Sprint 2.5.2 tweak 3 — the hero used to rest at the floor-band
       * CENTER (= the rung y), so it looked vertically centered /
       * floating. This gap lifts the hero's FEET this many px above the
       * band BOTTOM instead, so it reads as standing on the floor. The
       * scene applies a downward offset of
       * `floorSpacingPx/2 - bottomGapPx - heightPx/2` to every hero
       * resting position (start floor, each climbed floor, wrong pick
       * fall-back). Tune in playtest.
       */
      bottomGapPx: 8,
    },
    rung: {
      widthPx: 180,
      heightPx: 56,
    },
    frame: {
      /** Black side-bar width on each edge of a floor frame. */
      sideBarWidthPx: 20,
      /** Thickness of the horizontal black separator between floors. */
      separatorThicknessPx: 12,
    },
  },
  /**
   * Sprint 2.5.4 — Math-a-lotl (underwater mode). Answer bubbles rise
   * from below the sea floor; the kid taps one and the axolotl swims
   * over to catch it. Speed key doubles as the difficulty (Easy /
   * Medium / Hard) — it sets how many bubbles rise and how fast. The
   * generators always return 4 choices, so 4 is the bubble ceiling;
   * Hard differs from Medium by rise speed. Each question also has a
   * countdown (same values as Asteroid Field): at zero the question is
   * missed and the next one starts — a re-spawned wave does NOT reset it.
   */
  mathALotl: {
    /** Round-wide hearts; every wrong catch spends one, the last ends the round. */
    maxLives: 3,
    /** Waterline as a fraction of canvas height — must match `SKY_FRAC` in `scripts/sprites/reef.mjs`. */
    waterlineFrac: 0.25,
    speed: {
      // Time per question: the shared `round.baseQuestionSec` (sprint 2.6.1).
      slow: { bubbleCount: 3, risePxPerSec: 42 },
      medium: { bubbleCount: 4, risePxPerSec: 58 },
      fast: { bubbleCount: 4, risePxPerSec: 80 },
    },
    bubble: {
      diameterPx: 104,
      /** Side-to-side sway amplitude + frequency while rising. */
      swayPx: 14,
      swayHz: 0.45,
      /** Bubbles start this far apart vertically below the floor so they surface one at a time. */
      spawnStaggerPx: 70,
      /**
       * Rise speed until a bubble is fully on screen (playtest: waiting
       * for bubbles to crawl up from below the floor was boring). Once
       * in view it slows to the difficulty's `risePxPerSec`, so the
       * difficulty pacing is unchanged where it matters.
       */
      entryRisePxPerSec: 260,
      /** Horizontal jitter inside each bubble's lane. */
      laneJitterPx: 30,
      /** Taps within radius × this still hit a bubble (bigger targets for small fingers). */
      tapSlop: 1.25,
      /** A CHASED bubble stops this far under the waterline, so it can't float away mid-chase. */
      chaseHoldMarginPx: 8,
    },
    axolotl: {
      displayWidthPx: 190,
      /** Swim speed while chasing a tapped bubble / spot. */
      swimPxPerSec: 460,
      /** Distance (design px) at which the axolotl's head catches a bubble. */
      catchRadiusPx: 56,
      /** Swim-cycle frame rate while moving (0.6 s per stroke at 6 frames) and while idling. */
      swimFps: 10,
      idleFps: 4,
      /** Nose tilt toward the swim direction is clamped to ±this. */
      maxTiltDeg: 70,
      /** How fast the tilt eases toward its target (per second). */
      tiltEasePerSec: 6,
      /**
       * Turn left/right only when the target is this far past the
       * axolotl's centre on the other side, and at most once per
       * `turnCooldownMs` — stops the flicker on up/down swims.
       */
      turnDeadzonePx: 40,
      turnCooldownMs: 300,
      /** Squash-and-turn animation length when it does turn around. */
      turnMs: 160,
      /** Keep-out margin from the canvas edges, waterline and floor. */
      edgeMarginPx: 60,
      /** How long the happy face holds after a catch. */
      happyHoldMs: 700,
    },
    /** Pause before the next problem's bubbles start rising. */
    nextQuestionDelayMs: 600,
    /** Pause before a wave re-spawns after the right bubble floated away. */
    respawnDelayMs: 500,
    /** How long the "Out of time!" banner holds before the next question. */
    timeoutBannerMs: 800,
    /** How long the "Out of lives!" banner holds before Game Over. */
    outOfLivesBannerMs: 1200,
    /** "Floated away! Try again!" note: fully visible for `holdMs`, then fades. */
    escapeNote: { holdMs: 1500, fadeMs: 400, belowWaterlinePx: 132 },
    /** "Oops! Try again!" floater on a wrong catch: rises `risePx` while fading. */
    wrongNote: { durationMs: 1100, risePx: 50, floorMarginPx: 24 },
    /** Q1 "👆 Tap a bubble!" hint: a fixed-size pill this far below the waterline. */
    tapHint: { belowWaterlinePx: 70, widthPx: 240, heightPx: 64, backdropAlpha: 0.5 },
  },
  /**
   * Sprint 2.5.6 — Frog Splash. A frog hops up the river one row of lily
   * pads per question (12 rows; the 12th sits against the far bank). Rows
   * drift left / right in alternating directions; tap the pad with the
   * right answer. A wrong pad sinks (SPLASH) and the frog swims back to
   * the last row; running out of time also costs a life; either way the
   * same question comes back with fresh pads. 3 lives per round.
   * Speed key doubles as the difficulty, mirroring Space Escape's 2/3/4.
   */
  frogSplash: {
    maxLives: 3,
    speed: {
      // Time per hop: the shared `round.baseQuestionSec` (sprint 2.6.1; was 20 / 15 / 10).
      slow: { padCount: 2, driftPxPerSec: 40 },
      medium: { padCount: 3, driftPxPerSec: 60 },
      fast: { padCount: 4, driftPxPerSec: 85 },
    },
    /** Vertical distance between pad rows (world px). */
    rowSpacingPx: 150,
    /** Gap between the shoreline and the first / last row. */
    shoreGapPx: 95,
    /** Height of each bank image (must match BANK_H in scripts/sprites/pond.mjs; tested). */
    bankHeightPx: 240,
    /** Shorelines sit this far inside each bank image (SHORE_INSET in pond.mjs). */
    shoreInsetPx: 30,
    /** Frog start / finish spots: this fraction of the bank height in from the shoreline. */
    startBankFrac: 0.4,
    finishBankFrac: 0.25,
    /** Slow sideways drift of the water texture — reads as the river's current. */
    currentPxPerSec: 14,
    /** Where the frog sits on screen as the camera follows (fraction of canvas height). */
    cameraFrogYFrac: 0.7,
    cameraScrollMs: 450,
    pad: {
      displayPx: 132,
      /** Each pad is drawn up to ± this fraction bigger / smaller, for variety. */
      sizeJitter: 0.08,
      /** Taps within radius × this still hit a pad. */
      tapSlop: 1.15,
      /** A pad the frog jumps to that is split across a screen edge slides
       *  this far in from the edge (over `nudgeMs`) so it lands whole. */
      edgeMarginPx: 10,
      nudgeMs: 380,
      /** A finished row eases to a stop over this long (so the frog stays put). */
      stopMs: 450,
      sinkMs: 520,
    },
    frog: {
      displayPx: 118,
      hopMs: 480,
      crouchMs: 90,
      /** Peak height of the hop arc and how much the frog "grows" at the top of it. */
      hopArcPx: 70,
      hopGrow: 0.22,
      blinkEveryMs: 3200,
    },
    /** After a SPLASH: how long before the frog pops back up on the last row. */
    splashRecoverMs: 1000,
    /** Pause between a correct landing and the next row's question. */
    nextQuestionDelayMs: 350,
    timeoutBannerMs: 900,
    outOfLivesBannerMs: 1300,
    finish: {
      /** Delay before the frog hops from the last row onto the far bank. */
      ashoreDelayMs: 350,
      flyOrbitPx: 46,
      /** One lap of the fly's figure-eight, and how far it bobs up and down. */
      flyOrbitMs: 1600,
      flyBobPx: 14,
      /** Where the fly hovers relative to the frog's finish spot (beside it, in view). */
      flyOffsetX: 170,
      flyOffsetY: -10,
      tongueMs: 140,
      celebrateMs: 1800,
    },
    anim: { splashFps: 12, flyFps: 18 },
    /** "Splash!" note floating up from a pad; kept this far in from the screen edges. */
    note: { edgeMarginPx: 150, risePx: 50, durationMs: 1200 },
    /** Q1 "👆 Tap the right lily pad!" hint: screen-fixed (the camera starts scrolled), this far from the top. */
    tapHint: { y: 150, heightPx: 60, backdropAlpha: 0.55 },
    /** "You made it!" gets a heavier outline than other banners (gold reads poorly on blue water). */
    finishBannerStrokePx: 10,
  },
  /**
   * Sprint 2.6 — Space Shooter. The kid sits in a cockpit looking out the
   * window; alien ships carrying the answers fly around in it on curvy
   * paths, bouncing off the window frame and each other. Tap the ship with
   * the right answer: lasers fire, it explodes, next question. A wrong ship
   * shrugs the lasers off with a shield, warps away, and costs a life; the
   * question stays. Time runs out → the ships blast the cockpit, a life is
   * lost and the same question comes back with fresh ships. 3 lives.
   * Speed key doubles as the difficulty: 3 / 4 / 5 ships.
   */
  spaceShooter: {
    maxLives: 3,
    speed: {
      // Time per question: the shared `round.baseQuestionSec` (sprint 2.6.1; was 20 / 15 / 12).
      slow: { shipCount: 3, flyPxPerSec: 60 },
      medium: { shipCount: 4, flyPxPerSec: 85 },
      fast: { shipCount: 5, flyPxPerSec: 115 },
    },
    /**
     * Where ship CENTRES may fly (design px): between `top` and `bottom`,
     * and left / right of the window's measured edge (`windowEdge`, rows of
     * [y, left, right] printed by `pnpm sprite:cockpit --measure` and checked
     * against the shipped image by `spaceShooterAssets.test.ts`; the opening is
     * rounded and tapers towards the bottom). `edgeHalfWidthPx` is half the
     * widest ship-plus-answer-pill, checked over `edgeReachPx` above and
     * below, so a ship and its label never tuck behind the cockpit frame.
     */
    window: { top: 176, bottom: 540 },
    windowEdge: [
      [120, 304, 983],
      [140, 275, 1014],
      [160, 256, 1034],
      [180, 241, 1046],
      [200, 230, 1053],
      [220, 225, 1057],
      [240, 223, 1060],
      [260, 222, 1061],
      [280, 224, 1061],
      [300, 229, 1059],
      [320, 234, 1054],
      [340, 239, 1049],
      [360, 245, 1042],
      [380, 250, 1036],
      [400, 256, 1030],
      [420, 262, 1024],
      [440, 267, 1018],
      [460, 273, 1012],
      [480, 279, 1006],
      [500, 286, 1000],
      [520, 291, 994],
      [540, 297, 988],
      [560, 303, 983],
      [580, 313, 972],
      [600, 331, 953],
    ] as ReadonlyArray<readonly [number, number, number]>,
    edgeHalfWidthPx: 76,
    edgeReachPx: 40,
    /** Taps outside this (the cockpit around the window) are ignored. */
    tapWindow: { left: 222, right: 1062, top: 108, bottom: 615 },
    ship: {
      displayPx: 132,
      /** Collision / tap radius as a fraction of displayPx (the hull, not the halo). */
      radiusFrac: 0.42,
      tapSlop: 1.2,
      /** How fast a ship's heading can change (rad/s), and how quickly that turn rate wanders. */
      maxTurnRadPerSec: 1.4,
      turnJitterPerSec: 3.0,
      /** Gentle up / down bob and a lean into turns, for a "flying" feel. */
      bobPx: 5,
      bobMs: 1100,
      leanDeg: 8,
      /** Spawn spacing: centres at least this × radius apart. */
      spawnGapFrac: 2.3,
      warpInMs: 320,
      warpOutMs: 260,
      /** A wrong ship's shield flash; it warps away (and taps unlock) after this. */
      shieldMs: 380,
    },
    label: {
      /** Widest a label may get before it shrinks (design px, at ship scale 1). */
      maxWidthPx: 118,
      /** A label wider than the porthole by this much gets a dark "display" pill behind it. */
      pillPadPx: 12,
      pillHeightPadPx: 10,
    },
    laser: {
      /** Cannon muzzles at the bottom corners of the window (design px). */
      leftMuzzle: { x: 300, y: 640 },
      rightMuzzle: { x: 980, y: 640 },
      shotMs: 120,
      fadeMs: 160,
    },
    /** Pause between a hit and the next question's ships warping in. */
    nextQuestionDelayMs: 650,
    /** Time's up: the ships fire at the cockpit for this long before the life is lost. */
    blastMs: 1100,
    outOfLivesBannerMs: 1300,
    note: { edgeMarginPx: 150, risePx: 50, durationMs: 1200 },
    /** Q1 "👆 Tap the ship…" hint, this far above the bottom edge (over the dashboard). */
    tapHint: { aboveBottomPx: 62, heightPx: 60, backdropAlpha: 0.75 },
  },
  /**
   * Sprint 2.7 — Penguin Slide. A penguin sledges down a long snowy hill
   * toward its igloo (the camera sits just behind it). Each question sends a
   * row of fish up the screen toward it, one per lane, each carrying an
   * answer. Tap a fish (or its lane): the penguin swoops over and gulps it.
   * A wrong "fish" is a snowball — BONK, a life lost, the same question with
   * a fresh row. The row reaching the penguin is time's up: it tumbles, a
   * life is lost, same question again. 3 lives; 12 questions; the igloo at
   * the end. Speed key doubles as the difficulty: 3 / 4 / 5 fish per row.
   * Rules: `resolveRetryEvent` (roundRules.ts); geometry: penguinSlideMath.ts.
   */
  penguinSlide: {
    maxLives: 3,
    speed: {
      // Time per question: the shared `round.baseQuestionSec`, stretched for harder math.
      slow: { fishCount: 3 },
      medium: { fishCount: 4 },
      fast: { fishCount: 5 },
    },
    /** The run of the hill the lanes span (screen px); the pines line the edges outside it. */
    lanes: { left: 150, right: 1130 },
    /**
     * Must match HORIZON_Y in scripts/sprites/snowhill.mjs (tested). A new
     * row appears `rowStartBelowHorizonPx` below it and slides down to the
     * catch line, where the penguin waits.
     */
    horizonY: 228,
    rowStartBelowHorizonPx: 40,
    catchY: 560,
    /** The penguin sits this far below the catch line, sprite size in px. */
    penguin: { y: 640, displayPx: 150 },
    fish: { displayPx: 104, farScale: 0.62, nearScale: 1, wiggleFps: 4 },
    /** Answer badge: the dark pill. Never smaller than `floorScale` (readable on a phone), never wider than `maxWidthPx`. */
    badge: {
      offsetY: -56,
      floorScale: 0.85,
      maxWidthPx: 176,
      padPx: 14,
      heightPadPx: 8,
      labelStrokePx: 6,
      fill: 0x1f3550,
      fillAlpha: 0.95,
      rimPx: 3,
      rim: 0xcfe6ff,
      rimAlpha: 0.8,
    },
    /** Fish motion: the tap squish, and the swim-away (the rest of a row, or the right fish at time-out). */
    fishMotion: { squishMs: 90, swimDropPx: 60, swimMs: 380 },
    /**
     * Taps only count on the hill: never on the HUD bar or the sky, where the
     * Q1 tap hint sits (a tap on the hint must not pick the middle lane).
     * The top is under the hint and above the far badges (~y 233).
     */
    tapWindow: { top: 200, bottom: 720, left: 110, right: 1170 },
    /** The penguin's lane: a soft ring under it (shape, not colour, so keyboard players can see it). */
    laneRing: { rx: 70, ry: 16, alpha: 0.35, belowFrac: 0.42, strokePx: 3, stroke: 0x1f3550, strokeAlpha: 0.6 },
    /** Dashed marks between lanes, from just above where rows start to the bottom (dark enough to see on snow). */
    laneMarks: { widthPx: 3, color: 0x7fa8cc, alpha: 0.85, startAboveRowPx: 20, dashPx: 14, gapPx: 14 },
    /** Swoop: glide across to the lane, then up to the fish; the outcome plays on arrival. */
    swoopMs: 250,
    reachMs: 220,
    /** The swoop stops this far below the fish (the beak meets it). */
    reachBelowFishPx: 40,
    /** Back to the catch line before the next row appears. */
    returnMs: 320,
    /** Keyboard lane change (the penguin glides one lane). */
    laneGlideMs: 140,
    /** After a row appears, taps wait this long (a fast second tap after a BONK can't cost another life). */
    inputLockMs: 250,
    gulpMs: 520,
    /** The gulp's happy squash (× the penguin's scale) and its length. */
    gulpSquash: { x: 1.12, y: 0.92, ms: 120 },
    bonkSpinMs: 520,
    /** The time-out tumble spins this much longer than a bonk. */
    tumbleSpinFactor: 1.4,
    nextQuestionDelayMs: 400,
    timeoutBannerMs: 900,
    outOfLivesBannerMs: 1300,
    /** The finish: slide off toward the igloo, then "You made it!". */
    iglooSlideMs: 1300,
    /** The penguin ends this far below the horizon (at the igloo door), this small. */
    iglooStopBelowHorizonPx: 14,
    iglooScale: 0.35,
    celebrateMs: 1800,
    finishBannerStrokePx: 10,
    /** "You made it!" pops in from this scale. */
    finishBannerPop: { fromScale: 0.6, ms: 300 },
    /** Effects placed above the penguin's middle (screen px): where the fish is gulped, the sparkles, the snow puff. */
    fx: { gulpAbovePx: 30, sparkleAbovePx: 20, finishSparkleAbovePx: 10, puffAbovePx: 40, noteAboveFishPx: 70 },
    note: { edgeMarginPx: 150, risePx: 50, durationMs: 1200 },
    /** Q1 "👆 Tap the fish with the right answer!" hint: in the sky, under the HUD and above where rows start. */
    tapHint: { y: 160, heightPx: 60, backdropAlpha: 0.6 },
    /** The ski-slide swoosh now and then while the row comes down: a random gap in this range. */
    slideSound: { minGapMs: 2500, maxGapMs: 5500 },
  },
  /**
   * Sprint 2.8 — Bunny Garden. A bunny on the front grass, a row of holes
   * in the vegetable patch, one carrot per hole. The carrots sinking back
   * into their holes is the countdown. Positions are canvas px (1280 × 720).
   */
  bunnyGarden: {
    maxLives: 3,
    speed: {
      // Time per question: the shared `round.baseQuestionSec`, stretched for harder math.
      slow: { holeCount: 3 },
      medium: { holeCount: 4 },
      fast: { holeCount: 5 },
    },
    /** The patch span the holes share (the basket sits left of it). 5 holes → 190 px lanes. */
    lanes: { left: 230, right: 1180 },
    /** The holes' centre line; must sit inside PATCH_TOP / PATCH_BOTTOM of `scripts/sprites/garden.mjs` (tested). */
    holeY: 486,
    /** Carrots and moles are hidden below this line (the hole's front lip). */
    cropLineY: 494,
    carrot: {
      displayPx: 140,
      /** Fully up: this much of the carrot (display px) shows above the lip. */
      upVisiblePx: 118,
      /** Fully sunk: only the leaf tips show. */
      sunkVisiblePx: 4,
      /**
       * The countdown: the carrots sink on an ease-in curve to `peekDepth`
       * (faces still peeking out) until the last `hideSec`, then duck in.
       */
      peekDepth: 0.4,
      hideSec: 0.8,
      /** "Hurry": in the last `hurryFrac` of the time the leaves shiver. */
      hurryFrac: 0.25,
      shiverPx: 7,
      shiverHz: 4,
      /** A new row pops up (Back.Out); a wrong pick's carrot ducks. */
      popUpMs: 250,
      duckMs: 180,
      /** The right carrot: out of the ground, then an arc into the basket. */
      pullRisePx: 70,
      pullRiseMs: 160,
      tossMs: 420,
      tossArcPx: 120,
    },
    mole: {
      displayPx: 130,
      /** How far up it peeks (0 = fully up), the wave, and how long it stays. */
      peekDepth: 0.12,
      riseMs: 200,
      waveAfterMs: 200,
      stayMs: 400,
    },
    /** The answer sign: a dark pill on a garden stake, fixed above its hole (it never moves while the carrot sinks). */
    sign: {
      y: 326,
      textScale: 1.05,
      padPx: 12,
      heightPadPx: 10,
      /** Never wider than the lane minus this. */
      laneMarginPx: 14,
      labelStrokePx: 6,
      fill: 0x1f3550,
      fillAlpha: 0.96,
      rimPx: 4,
      rim: 0xfff4dc,
      rimAlpha: 1,
      stakeWidthPx: 12,
      stakeColor: 0xc68a52,
      stakeInk: 0x3a2420,
    },
    hole: { scale: 1 },
    bunny: { y: 628, displayPx: 190 },
    /** The bunny's hop to a hole: the same time whatever the distance. */
    hop: { ms: 260, heightPx: 46 },
    /** The bunny's little moves: the pull's squash, the oops wobble, the finish cheer's bounces. */
    bunnyMotion: {
      pullSquash: { x: 1.06, y: 0.94 },
      oopsWobbleDeg: 4,
      oopsWobbleMs: 90,
      cheerBouncePx: 24,
      cheerBounceMs: 180,
      cheerBounces: 2,
    },
    /** Where the bunny cheers at the finish: right beside the basket. */
    finishX: 230,
    /** The pull: the bunny tugs before the carrot comes up. */
    pullMs: 160,
    /** The bunny's lane: a soft ring under it (shape, not colour, so keyboard players can see it). */
    laneRing: { rx: 70, ry: 16, alpha: 0.35, belowFrac: 0.42, strokePx: 3, stroke: 0x2f5a2a, strokeAlpha: 0.6 },
    basket: {
      x: 125,
      y: 618,
      scale: 1,
      /** Carrots in the basket: little icons in two rows of six. */
      iconScale: 0.3,
      perRow: 6,
      rowStartX: -58,
      stepX: 23,
      rowY: [-22, -38],
    },
    /**
     * Taps only count over the patch's lanes: never on the HUD bar, the Q1
     * hint (in the sky) or the basket. The top is under the hint.
     */
    tapWindow: { top: 200, bottom: 720, left: 230, right: 1180 },
    /**
     * A new row: the carrots pop up, then taps and the clock start together
     * (a fast second tap after a mole can't cost another life, and no time is
     * lost to the lock).
     */
    inputLockMs: 500,
    nextQuestionDelayMs: 150,
    happyMs: 200,
    /** The right answer's reward: the bunny's happy hop, the basket's bounce, a bright sparkle. */
    reward: { hopPx: 28, hopMs: 150, basketBounce: 1.12, basketBounceMs: 120, sparkleCount: 22, sparkleScale: 0.55 },
    timeoutBannerMs: 900,
    outOfLivesBannerMs: 1300,
    /** The finish: the bunny hops to the basket and cheers. */
    finishHopMs: 420,
    celebrateMs: 1800,
    finishBannerStrokePx: 10,
    finishBannerPop: { fromScale: 0.6, ms: 300 },
    fx: { sparkleAbovePx: 30, noteAboveSignPx: 70 },
    note: { edgeMarginPx: 150, risePx: 50, durationMs: 1200 },
    /** Q1 "👆 Tap the carrot with the right answer!" hint: in the sky, under the HUD and above the signs. */
    tapHint: { y: 160, heightPx: 60, backdropAlpha: 0.6 },
  },
  /**
   * Sprint 2.12 — Balance Scale (the ninth game). A missing-number sentence
   * on a balance scale; tap the weight that levels it. 3 lives, a miss
   * retries the same sentence (like Bunny Garden). Time per question is
   * the shared `round.baseQuestionSec` (no countdown here).
   * Positions are design px on the 1280 × 720 canvas; the art is drawn by
   * `scripts/sprites/balance.mjs` (its geometry is mirrored in
   * `BALANCE_SHEETS` and `path`; a test checks them).
   */
  balanceScale: {
    maxLives: 3,
    /** Weights in the tray; Medium and Hard also mix in the reversed sentences ("17 = 12 + ?"). */
    speed: {
      slow: { weights: 3, reversed: false },
      medium: { weights: 4, reversed: true },
      fast: { weights: 5, reversed: true },
    },
    scale: {
      /** The beam's pivot (the "=" badge); the pillar hangs down from it. */
      pivot: { x: 610, y: 236 },
      /** Hook to the pan's rim. */
      hangPx: 140,
      /** Centre-to-centre spacing of the things on a pan ("12", "+", "?"). */
      panItemGapPx: 116,
      /** Weights on the pans, and in the tray. */
      itemScale: 0.8,
      /** The start: the "?" side up this much (it can't be weighed yet). */
      startTiltDeg: 9,
      /** A wrong weight tips at least this much, up to max for a big miss (|error| ≥ fullTiltAt × the total). */
      minTiltDeg: 5,
      maxTiltDeg: 14,
      fullTiltAt: 0.5,
      /** The swing to a new angle (eased, with a small overshoot and wobble). */
      swingMs: 420,
    },
    tray: { left: 270, right: 970, bottomY: 690, scale: 0.86, tapTop: 560 },
    /** Three animals from the crowd each question (never the same set twice running). */
    crowd: {
      slots: [
        { x: 62, scale: 0.95 },
        { x: 174, scale: 0.86 },
        { x: 1052, scale: 0.86 },
      ],
      bottomY: 626,
      swapMs: 260,
    },
    /** The winding progress path up the right side (mirrors `PATH` in balance.mjs). */
    path: {
      x: 1205,
      amplitude: 30,
      turns: 2.2,
      bottomY: 600,
      topY: 150,
      stones: 12,
      stoneRadius: 24,
      duckAbovePx: 30,
      duckScale: 0.62,
      hopMs: 360,
    },
    /** Side scenery cross-fades between questions. */
    propsFadeMs: 450,
    label: { plateMinW: 78, plateH: 58, platePadPx: 18, plateRadius: 16 },
    flyMs: 280,
    correctHoldMs: 950,
    wrongHoldMs: 700,
    returnMs: 250,
    resetMs: 300,
    inputLockMs: 400,
    timeoutBannerMs: 900,
    outOfLivesBannerMs: 1300,
    celebrateMs: 1800,
    finishBannerStrokePx: 10,
    finishBannerPop: { fromScale: 0.6, ms: 300 },
    reward: { sparkleCount: 22, sparkleScale: 0.55 },
    note: { edgeMarginPx: 150, risePx: 50, durationMs: 1400 },
    tapHint: { y: 150, heightPx: 60, backdropAlpha: 0.6 },
  },
  /**
   * Sprint 2.13 — Pair Pals (the Puzzles subject): a memory-match game. Turn
   * two cards over per turn; a match stays up, a miss turns back. No points,
   * timer or lives: the round counts turns, and the best (fewest) is kept
   * per size (`PairPalsProgress`).
   */
  pairPals: {
    /** Setup-screen order; the card backs and picture sheets follow it (`THEMES` in pairpals.mjs). */
    themes: ['animals', 'desserts', 'dinosaurs', 'dragons', 'aliens'],
    themeLabels: {
      animals: 'Cute Animals',
      desserts: 'Desserts',
      dinosaurs: 'Dinosaurs',
      dragons: 'Dragons',
      aliens: 'Aliens',
    },
    /** Columns × rows (owner, 2026-10-25). */
    sizes: {
      easy: { label: 'Easy', cols: 4, rows: 3 },
      medium: { label: 'Medium', cols: 5, rows: 4 },
      hard: { label: 'Hard', cols: 6, rows: 5 },
    },
    /** A first visit: Cute Animals, Easy. */
    defaults: { theme: 'animals', size: 'easy' },
    picturesPerTheme: 20,
    /**
     * Near look-alikes (sheet frames, 0-based) that a deal keeps apart when
     * it can: two of them on a small Hard card feels like a trick. A deal
     * takes one per group first, and only reaches for a second one when a
     * size needs more pictures than there are groups.
     */
    twinGroups: {
      animals: [],
      desserts: [],
      dinosaurs: [
        [1, 3, 9],
        [14, 19],
        [0, 7],
        [2, 8, 16],
        [12, 18],
        [13, 17],
      ],
      dragons: [
        [1, 12, 13, 18],
        [5, 15, 17],
        [6, 16],
        [3, 10, 14],
        [8, 19],
      ],
      aliens: [[0, 9]],
    },
    /** Where the board fits (below the top bar), and the side strip the mascot stands in. */
    board: {
      top: 86,
      bottom: 708,
      centerX: 660,
      maxWidth: 820,
      maxCardPx: 180,
      gapPx: { easy: 16, medium: 14, hard: 12 },
    },
    /** The picture's share of the card. */
    pictureScale: 0.86,
    topBar: { height: 66, y: 33 },
    mascot: { x: 128, bottomY: 690, sizePx: 190, bobPx: 6, bobMs: 1400, hopPx: 34, hopMs: 300 },
    /** A card turning: squash to edge-on, swap, open. */
    flipHalfMs: 120,
    flipLiftScale: 1.06,
    /** A miss stays up this long so it can be remembered (a tap skips it); owner: 1.2 s → 2.2 s, 2026-10-26. */
    missHoldMs: 2200,
    /**
     * Owner (2026-10-28): a win is worth up to a whole Add to 10 round at the
     * same difficulty (`services/puzzlePoints.ts`). Full points in at most
     * `fullTurnsPerCard` × the cards in turns; past that, every
     * `stepShareOfCards` of the cards in extra turns (rounded up, the
     * player's way) takes `dropPerStep` off. 30 cards: 33 turns = 90 %.
     */
    points: { fullTurnsPerCard: 1, stepShareOfCards: 0.1, dropPerStep: 0.1 },
    missWiggleDeg: 4,
    matchPopScale: 1.14,
    matchPopMs: 220,
    /** A matched card settles: its ring fades and it dims a little, so face-down cards stand out. */
    matchedSettleMs: 700,
    matchedAlpha: 0.82,
    winPanelDelayMs: 1100,
    winWaveMs: 260,
    winWaveStaggerMs: 45,
    sparkleCount: 10,
    hint: { y: 120, heightPx: 56, backdropAlpha: 0.6 },
    /** The setup screen ("Pair Pals: pick your cards"). */
    setup: {
      headingY: 52,
      themeLabelY: 112,
      themeY: 224,
      themeTile: { w: 196, h: 176, gap: 18 },
      /** A theme tile's sample picture (frame in its sheet) and its size. */
      samples: { animals: 0, desserts: 0, dinosaurs: 15, dragons: 1, aliens: 0 },
      samplePx: 116,
      sizeLabelY: 352,
      sizeY: 432,
      sizeTile: { w: 270, h: 104, gap: 26 },
      bestY: 516,
      buttonsY: 622,
      startW: 240,
      backW: 200,
      buttonH: 72,
    },
  },
  /**
   * Sprint 2.14 — the puzzle pack (Pattern Train, Missing Piece, Odd One
   * Out, Magic Wand, Spin Match, Copy Cat, Symbol Hunt): rounds of 8 puzzles,
   * no lives or points; first-try answers fill the progress bar gold and
   * earn the stars. Art from `scripts/sprites/puzzles.mjs` (the shapes and
   * colours below mirror its `SHAPES` / `COLOURS`; a test checks them).
   */
  puzzles: {
    perRound: 8,
    /** Choices in the tray (Odd One Out: items on the shelf). */
    choices: { easy: 3, medium: 4, hard: 5 },
    /** Green answers for ★★★ and ★★ (fewer: ★). */
    stars: { three: 8, two: 6 },
    /**
     * Each puzzle's step on the progress bar (owner, 2026-10-26): green = right
     * first try (and, on a timed puzzle, in the first `greenShare` of its
     * time); yellow = right after a miss or two, or slower; red = `maxMisses`
     * misses or the time runs out, and the round moves on with the answer shown.
     */
    steps: { maxMisses: 3, greenShare: 0.5, redHoldMs: 1700 },
    /**
     * Owner (2026-10-28): points, measured against an Add to 10 round at the
     * same difficulty (`services/puzzlePoints.ts`). A puzzle round is worth
     * up to `roundShare` of one. The speed bonus is math's
     * (`scoring.speedBonus`); the untimed puzzles count it against
     * `speedSeconds`, Copy Cat against `copyCatSecondsPerTap` per tap of
     * the sequence (from "Your turn!").
     */
    points: {
      roundShare: 0.5,
      speedSeconds: { 'missing-piece': 30, 'magic-wand': 30, 'spin-match': 30 },
      copyCatSecondsPerTap: 4,
    },
    /** Seconds per puzzle for the timed ones (Symbol Hunt's are in `symbolHunt.seconds`). */
    timed: {
      'pattern-train': { easy: 20, medium: 25, hard: 30 },
      'odd-one-out': { easy: 15, medium: 18, hard: 22 },
    },
    shapes: [
      'circle',
      'square',
      'triangle',
      'star',
      'heart',
      'diamond',
      'hexagon',
      'moon',
      'drop',
      'cloud',
      'flower',
      'pentagon',
    ],
    shapeLabels: {
      circle: 'circles',
      square: 'squares',
      triangle: 'triangles',
      star: 'stars',
      heart: 'hearts',
      diamond: 'diamonds',
      hexagon: 'hexagons',
      moon: 'moons',
      drop: 'drops',
      cloud: 'clouds',
      flower: 'flowers',
      pentagon: 'pentagons',
    },
    /** Shapes that look different when turned a quarter (turn rules use only these). */
    turnable: ['triangle', 'heart', 'moon', 'drop', 'cloud', 'pentagon'],
    /**
     * Shapes with corners vs round ones (Odd One Out: one round shape among
     * cornered ones). Owner: only shapes that are plainly round count; the
     * drop has a point and the cloud has two bottom corners.
     */
    cornered: ['square', 'triangle', 'star', 'diamond', 'hexagon', 'pentagon'],
    round: ['circle', 'flower'],
    colours: ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'],
    colourLabels: {
      red: 'red',
      orange: 'orange',
      yellow: 'yellow',
      green: 'green',
      teal: 'teal',
      blue: 'blue',
      purple: 'purple',
      pink: 'pink',
    },
    hats: ['party', 'bow', 'crown', 'glasses', 'cap', 'flower', 'tophat', 'headphones'],
    /** Spin Match's 16 lopsided shapes as grid cells [col, row] (mirrors SPIN_CELLS in puzzles.mjs). */
    spinCells: [
      [
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1],
        [1, 2],
      ],
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
        [1, 3],
      ],
      [
        [1, 0],
        [1, 1],
        [0, 2],
        [1, 2],
        [0, 3],
      ],
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
        [0, 2],
      ],
      [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, 2],
        [1, 3],
      ],
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [1, 2],
        [2, 2],
      ],
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
        [1, 3],
        [2, 3],
      ],
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [1, 2],
        [1, 3],
        [2, 3],
      ],
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 2],
        [2, 2],
        [2, 3],
      ],
      [
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [2, 2],
        [2, 3],
      ],
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1],
        [0, 2],
        [1, 2],
      ],
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
        [1, 2],
        [2, 2],
      ],
      [
        [1, 0],
        [1, 1],
        [0, 2],
        [1, 2],
        [2, 2],
        [2, 3],
      ],
      [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
        [2, 0],
        [3, 0],
      ],
      [
        [0, 1],
        [0, 2],
        [1, 1],
        [2, 0],
        [2, 1],
        [3, 1],
      ],
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 0],
        [1, 1],
        [2, 1],
      ],
    ],
    spinColours: 4,
    /** The shared setup screen ("Pattern Train: how tough?"). */
    setup: { headingY: 70, introY: 150, tileY: 300, tile: { w: 280, h: 120, gapX: 34 }, bestY: 420, buttonsY: 600 },
    /** The setup screen's line under each level, per puzzle. */
    levelNotes: {
      'pattern-train': { easy: 'Short patterns', medium: 'Longer patterns', hard: 'Two patterns at once' },
      'missing-piece': { easy: 'Shape and colour', medium: 'How many and size', hard: 'Tricky windows' },
      'odd-one-out': { easy: 'Shape or colour', medium: 'Size, corners, how many', hard: 'Kinds and flips' },
      'magic-wand': { easy: 'Size and colour', medium: 'Shape, turns, how many', hard: 'Two changes at once' },
      'spin-match': { easy: 'Spot the same shape', medium: 'Watch for mirrors', hard: 'All look alike' },
      'copy-cat': { easy: '4 animals, from 2 sounds', medium: '5 animals, from 3', hard: '6 animals, from 4' },
      'symbol-hunt': { easy: '12 cards', medium: '18 cards, look-alikes', hard: '21 cards, many look-alikes' },
    },
    layout: {
      topBar: { height: 66, y: 33 },
      progress: { y: 92, width: 560, height: 20, gap: 8 },
      prompt: { y: 140, heightPx: 52 },
      /** The puzzle itself sits between these. */
      stage: { top: 176, bottom: 500 },
      tray: { y: 604, cardPx: 128, gapPx: 24, panelPad: 22 },
      /** The sand bar of a timed puzzle (Pattern Train, Odd One Out), along the bottom between the dancers. */
      sand: { y: 706, width: 740, height: 12 },
      /** Two dancing animals at the bottom corners. */
      dancers: [
        { x: 104, bottomY: 742, scale: 0.78 },
        { x: 1176, bottomY: 742, scale: 0.78 },
      ],
    },
    /**
     * A token's two sizes (scale of its frame): small, big. Owner
     * (2026-10-26): only two, about half and full, so a kid can tell them
     * apart at a glance. Every token is big unless a rule makes it small.
     * 2026-10-28: big grew into the card's margin (0.9 → 1.04) so the
     * difference is plain for the youngest.
     */
    sizeScales: [0.46, 1.04],
    timings: {
      popInMs: 220,
      popStaggerMs: 60,
      wrongWiggleMs: 70,
      rightHoldMs: 1100,
      backdropFadeMs: 600,
      swayMs: 2600,
      swayDeg: 5,
      dancerSwapEvery: 3,
      endPanelDelayMs: 700,
    },
    /** Pattern Train: cars shown before the "?" car. */
    patternTrain: { cars: { easy: 5, medium: 6, hard: 6 } },
    /** Odd One Out: items on the shelf (one is odd). */
    oddOneOut: { items: { easy: 4, medium: 4, hard: 5 } },
    copyCat: {
      pads: { easy: 4, medium: 5, hard: 6 },
      startLength: { easy: 2, medium: 3, hard: 4 },
      /** Pair Pals' cute animals (frames) that sit on the pads, in pad order. */
      animals: [7, 5, 6, 19, 12, 2],
      litMs: 600,
      gapMs: 260,
      /** After a turn, before the next sequence plays. */
      betweenMs: 900,
    },
    symbolHunt: {
      cards: { easy: 12, medium: 18, hard: 21 },
      cols: { easy: 4, medium: 6, hard: 7 },
      targets: { easy: [2, 3], medium: [3, 4], hard: [3, 5] },
      seconds: { easy: 40, medium: 40, hard: 45 },
    },
  },
  /**
   * Sprint 2.5.7 — the question mix for the whole-number math types (see
   * `src/math/questionMix.ts`). Weights are relative: 1 = normal, below 1
   * = rarer, above 1 = more often. "Answer" weights set how often each
   * answer comes up; the others pick among problems with the same answer.
   * The resulting shares are locked by `src/math/questionMix.test.ts`.
   */
  questionMix: {
    addTo10: {
      /** Answers 0 and 1 (0 + 0, 1 + 0). */
      tinyAnswerWeight: 0.3,
      /** Answer 2: nearly always "1 + 1" (the "+ 0" forms are rare), so keep it from topping the list. */
      twoAnswerWeight: 0.5,
      /** "+ 0" problems. */
      plusZeroWeight: 0.15,
    },
    addTo20: {
      /** Single-digit sums (2 + 2, 2 + 5): rare at this level. */
      singleDigitAnswerWeight: 0.2,
      /** Both numbers single digits, so the sum crosses ten (8 + 7). */
      crossTenWeight: 2,
      /** "+ 1" and "+ 10" problems. */
      plusOneWeight: 0.2,
      plusTenWeight: 0.2,
      /** Wrong answers may go this far past 20 (21–24 are believable slips), so a
       *  sum of 19 or 20 isn't always the biggest choice. */
      distractorOverflow: 4,
    },
    subTo10: {
      /** Answers 0 (x − x) and 10 (10 − 0). */
      edgeAnswerWeight: 0.3,
      /** Answer 9: only 9 − 0 or 10 − 1, so "10 − 1" would otherwise top the list. */
      nineAnswerWeight: 0.5,
      /** "− 0" and "− 1" problems. */
      minusZeroWeight: 0.15,
      minusOneWeight: 0.6,
    },
    subTo20: {
      /** Answer 0 (x − x) and answers 19–20 (only "− 0" / "− 1" can make them). */
      edgeAnswerWeight: 0.1,
      /** Answers 10–18. Answers 1–9 are 1. */
      teenAnswerWeight: 0.6,
      /** Starting from a teen number and crossing back over ten (13 − 5). */
      crossTenWeight: 2,
      /** Starting from 10 or less (that's Subtract within 10's job). */
      smallStartWeight: 0.3,
      minusZeroWeight: 0.05,
      minusOneWeight: 0.4,
      minusTenWeight: 0.3,
    },
    multDiv: {
      /** Factors 10 and 11 (× 10, × 11) are easy patterns: less often. */
      tenWeight: 0.5,
      elevenWeight: 0.6,
    },
    /** Add / Subtract to 20: wrong answers are drawn within ± this of the right one. */
    nearDistractorSpread: 6,
  },
  layout: {
    /** number of answer lanes across the screen */
    targetLanes: 4,
    /** safe-area padding in design pixels (1280x720 design canvas) */
    safeAreaPaddingPx: 16,
    /**
     * HUD bar height in design pixels. The top-screen ribbon that
     * carries score / prompt / pause / mute / progress dots. Lifted
     * from an inline `barHeight = 48` literal in HudScene to satisfy
     * the project's "no magic numbers" convention — `AsteroidFieldScene`
     * also reads this to compute its playfield top bound so the
     * playfield never overlaps the HUD ribbon. Single source of truth;
     * a future resize is a 1-line edit here.
     */
    hudBarHeightPx: 64,
    /**
     * Bottom gutter of the design canvas, in design pixels, kept clear of
     * gameplay elements. `TouchFireButton` and the playfield bounds read it.
     *
     * Sprint 2.5.2: the AGPL §7(b) attribution footer moved OUT of the
     * canvas into the DOM (`index.html` `#app-footer`, filled by
     * `mountAttributionFooter`), laid out directly BELOW the canvas — so
     * the footer can no longer overlap anything in the game, and this value
     * is no longer the footer's height. It is retained as a plain bottom
     * gutter so existing gameplay layout (FIRE button, speeder line,
     * playfield bounds) stays exactly as tuned. The DOM footer's own height
     * lives in CSS (`--footer-min-h`).
     *
     * Tuning history (from when this mirrored the in-canvas footer):
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
    canvasBottomGutterPx: 32,
    /**
     * Sprint 2.7 — mixed numbers in answers and prompts (`MathText`): the whole
     * part is drawn this much bigger, with a gap (× font size) before its
     * fraction, so "1 1/2" can't be misread as "11/2".
     */
    mixedNumber: { wholeScale: 1.3, gapEm: 0.35 },
    /**
     * Sprint 2.6.3 — the shared look of game callouts (`src/game/ui/callouts.ts`):
     * the pulsing "👆 …" tap hint, floating notes ("Oops! Try again!") and
     * centred banners ("Out of lives!"). Colours live in `uiPalette.ts`;
     * where each game puts its hint is in that game's own block.
     */
    callout: {
      /** Tap-hint pill width = label width + this, unless the game sets a width. */
      pillPaddingPx: 48,
      pillBorderPx: 2,
      pillBorderAlpha: 0.7,
      /** Tap hints sit above the playfield; notes and banners above everything. */
      hintDepth: 50,
      textDepth: 100,
      noteStrokePx: 6,
      bannerStrokePx: 8,
      bannerShadowOffsetY: 3,
      bannerShadowBlur: 6,
      /**
       * Sprint 2.7 — the lighter outline for HUD and Game Over text (score,
       * question, timer, headline) so it reads on any backdrop, bright snow included.
       */
      textStrokePx: 5,
      textShadowOffsetY: 2,
      textShadowBlur: 4,
      /** The tap hint pulses down to this alpha and back, every `pulseMs`. */
      pulseMs: 800,
      pulseMinAlpha: 0.6,
    },
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
      /** Gap between buttons stacked vertically (`stackButtons`). */
      stackGapPx: 12,
      /**
       * Gap between buttons side by side (`rowButtons`, sprint 2.6.1) — wide
       * enough that a thumb aimed at one doesn't land on its neighbour.
       */
      rowGapPx: 32,
      tileW: 320,
      tileH: 200,
    },
    /**
     * Sprint 2.9 — the challenge-first flow: the challenge picker (and the
     * same grid inside the pause card), the challenge chip on Game Select
     * and Difficulty, the per-game Difficulty tiles, and the Pause / Game
     * Over button grids. Sized for a phone, where 1 CSS px is about 2
     * canvas px: every target is at least 72 canvas px tall.
     */
    challengeFlow: {
      /** The challenge buttons: 4 + 4 + 3, the name and its "1.5x Points!" inside each. */
      grid: { cellW: 280, cellH: 96, gapX: 16, gapY: 16, perRow: 4 },
      picker: {
        headingY: 58,
        subjectTabY: 135,
        subjectTab: { w: 220, h: 64 },
        gridTopY: 230,
        backY: 610,
        /** Sprint 2.13 — the Puzzles tab's game tiles (two across). */
        puzzleGrid: { firstRowY: 290, cellW: 292, cellH: 132, gapX: 14, gapY: 16, perRow: 4 },
        /** The picture on each puzzle tile (sprint 2.14). */
        puzzleIcon: { sizePx: 84, padPx: 10 },
        /** A tab swap fades the buttons below in. */
        swapFadeMs: 160,
      },
      backButton: { w: 220, h: 72 },
      /** "Challenge: Add to 10 🔄" on Game Select and Difficulty. */
      chip: { w: 440, h: 72 },
      /**
       * Sprint 2.13.1 — the games in two tabs (Math Basher, Math Fun; see
       * `core/gameGroups.ts`), each tab's tiles in two rows (4 → 2 + 2,
       * 5 → 3 + 2). A tile shows the game's picture on its left.
       */
      gameSelect: {
        headingY: 50,
        chipY: 128,
        tabY: 212,
        tab: { w: 240, h: 60, gapX: 16 },
        grid: { firstRowY: 334, cellW: 390, cellH: 150, gapX: 16, gapY: 16, rows: 2 },
        /** The picture on each tile: its size and the space around it. */
        icon: { sizePx: 92, padPx: 12 },
        backY: 636,
        /** A tab swap fades the tiles in. */
        swapFadeMs: 160,
      },
      difficulty: {
        headingY: 58,
        chipY: 150,
        /** Space Escape's "12 floors per round" line. */
        floorsY: 222,
        tileY: 320,
        tile: { w: 260, h: 96, gapX: 40 },
        /** "Up to 1,500 points!" under each tile, then a fraction challenge's level note. */
        upToGapPx: 14,
        noteGapPx: 44,
        buttonsY: 600,
        startW: 240,
        backW: 200,
        buttonH: 72,
      },
      /** Pause: Resume, then a 2 × 2 grid; the challenge view reuses `grid`. */
      pause: {
        titleY: 190,
        resume: { y: 300, w: 360, h: 80 },
        grid: { topY: 400, cellW: 300, cellH: 72, gapX: 24, gapY: 16, perRow: 2 },
        challengeHeadingY: 130,
        challengeGridTopY: 230,
        challengeBackY: 590,
      },
      /** Game Over: Play again, then a 2 × 2 grid; the bonuses, stars and the badge sit above. */
      gameOver: {
        summaryY: 208,
        /** Sprint 2.10 — "Finish Bonus! +300   Perfect Round! +300", under the score (2.11: speed first). */
        bonusY: 266,
        bonusGapPx: 40,
        /** Sprint 2.11 — the row shrinks to fit inside this width (three bonuses at hard math are wide). */
        bonusMaxW: 1160,
        starsY: 316,
        badgeY: 372,
        playAgain: { y: 440, w: 360, h: 80 },
        grid: { topY: 532, cellW: 280, cellH: 72, gapX: 24, gapY: 16, perRow: 2 },
      },
    },
    /**
     * Sprint 2.9.2 — My Scores. Only the list (between `list.top` and
     * `list.bottom`) scrolls; the heading, tabs, total, date, note and Back
     * stay put. About 8 rows show at once.
     */
    myScores: {
      headingY: 50,
      tabY: 122,
      tab: { w: 220, h: 64, gapX: 16 },
      totalY: 186,
      dateY: 216,
      list: {
        top: 242,
        bottom: 566,
        w: 920,
        /** Tappable subject rows (fold / unfold). */
        subjectRowH: 72,
        /** Challenge rows: text only, not tappable. */
        challengeRowH: 38,
        gapPx: 8,
        /** Mouse wheel: list pixels per wheel pixel. */
        wheelScale: 0.5,
        /** A press that moves further than this scrolls instead of tapping. */
        dragThresholdPx: 10,
        scrollBarW: 8,
        /** A soft dark panel behind the list, so rows read over the starry backdrop. */
        panel: { padPx: 12, color: 0x0b1020, alpha: 0.55, radius: 12 },
      },
      noteY: 594,
      backY: 652,
    },
    /**
     * Floating "+N" points popup on a correct answer (HudScene, every
     * game). Sprint 2.5.4 playtest: 0.7 s was too quick to read, so it
     * now holds fully visible for `holdMs`, then fades over `fadeMs`
     * while drifting up `risePx` the whole time.
     */
    scorePopup: {
      holdMs: 550,
      fadeMs: 800,
      risePx: 60,
      /** Sprint 2.11 — the "⚡⚡⚡ Lightning Fast!" line sits this far under the points. */
      speedLineGapPx: 32,
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
     *  - `gutterClearancePx` — vertical gap between the BOTTOM of the
     *    button's hit area and the top of the canvas bottom gutter
     *    (`canvasBottomGutterPx`). Bumped to 16 (was 8) in sprint 0.6
     *    when the footer was in-canvas, to keep the hit-circle out of the
     *    Source-URL click zone. Since sprint 2.5.2 the footer is a DOM strip
     *    below the canvas, so this is just thumb-room spacing.
     */
    touchFire: {
      radiusPx: 40,
      hitPadPx: 14,
      gutterClearancePx: 16,
    },
  },
} as const;

export type SpeedKey = keyof typeof config.scoring.speed;
export type MathId = keyof typeof config.scoring.mathDifficulty;
/** Sprint 2.13 — a Pair Pals card theme and board size. */
export type PairPalsTheme = (typeof config.pairPals.themes)[number];
export type PairPalsSize = keyof typeof config.pairPals.sizes;
/** Sprint 2.14 — a puzzle level (the puzzle pack and Pair Pals share the three). */
export type PuzzleLevel = keyof typeof config.puzzles.choices;
export type PuzzleShape = (typeof config.puzzles.shapes)[number];
export type PuzzleColour = (typeof config.puzzles.colours)[number];
export type PuzzleHat = (typeof config.puzzles.hats)[number];

/** Sprint 2.5.7 — time-limit multiplier for a math type (1 = as configured per difficulty). */
export function mathTimeScale(mathId: MathId | null): number {
  return mathId === null ? 1 : config.round.mathTimeScale[mathId];
}

/** A difficulty's time limit stretched for the math type, in whole seconds. */
export function scaledSeconds(sec: number, mathId: MathId | null): number {
  return Math.round(sec * mathTimeScale(mathId));
}

/**
 * Sprint 2.6.1 — time to answer one question (whole seconds): the shared
 * base for the difficulty, stretched for the math type. Every timed game
 * reads its countdown here.
 */
export function questionSeconds(speed: SpeedKey, mathId: MathId | null): number {
  return scaledSeconds(config.round.baseQuestionSec[speed], mathId);
}

/** A whole round's timer (Space Escape): the per-question base × the questions, stretched for the math. */
export function roundSeconds(speed: SpeedKey, mathId: MathId | null, questions: number): number {
  return scaledSeconds(config.round.baseQuestionSec[speed] * questions, mathId);
}

/**
 * Mobile-vs-desktop threshold for picking between two-value config
 * fields like `config.numberClimb.floorSpacingPx`. Same logic the
 * sprite-tier picker uses (viewport width × DPR ≥ 1920 = desktop).
 * Lives here next to the config so any future two-value config field
 * has a single canonical helper to read.
 *
 * Reads `window.innerWidth` + `window.devicePixelRatio` directly each
 * call — cheap. For test paths that don't have a real window,
 * pass an explicit `viewportWidth × dpr` via the optional arg.
 */
export function isDesktopViewport(viewportProduct?: number): boolean {
  const product = viewportProduct ?? window.innerWidth * window.devicePixelRatio;
  return product >= 1920;
}

/**
 * Sprint 2.2 — true if the user's PRIMARY input pointer is touch
 * (phones, tablets) as opposed to a mouse/trackpad (desktops, laptops).
 * Returns the CSS media query `(pointer: coarse)` result — the W3C
 * standard for "touch-primary" detection. Decoupled from viewport size
 * (`isDesktopViewport`) because iPads can have large viewports but
 * still be touch-primary, and conversely small-window desktop browsers
 * are still mouse-primary.
 *
 * Used by AsteroidFieldScene's aim hint — touch users see it (gesture
 * needs the visual cue), mouse users skip it (cursor follows aim
 * already, no gesture to learn).
 *
 * `matchMedia` is universally supported in browsers that run Phaser 3;
 * the `?? false` guard covers the headless / non-browser test path
 * where `window.matchMedia` may be undefined.
 */
export function isTouchPrimary(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

/** Sprint 2.2 — pick the floor-spacing value for the current viewport. */
export function pickFloorSpacingPx(): number {
  return isDesktopViewport() ? config.numberClimb.floorSpacingPx.desktop : config.numberClimb.floorSpacingPx.mobile;
}
