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
     * Asteroid drift speed (px/s) per
     * Speed selector. The countdown is a HARD timeout — when it hits 0,
     * the question is marked wrong and the wave advances.
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
     * hits a wrong asteroid. Sprint 2.1 wrap-up addition (in addition
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
     * Sprint 2.1 wrap-up — visual tuning constants for the procedural
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
     * Total floors per round. Stars + GameOverScene's "Pass" both
     * pivot off reaching this. Sprint 2.2 wrap-up playtest: 10 felt
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
       * resting position (start floor, each climbed floor, mulligan
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
      [120, 304, 983], [140, 275, 1014], [160, 256, 1034], [180, 241, 1046], [200, 230, 1053],
      [220, 225, 1057], [240, 223, 1060], [260, 222, 1061], [280, 224, 1061], [300, 229, 1059],
      [320, 234, 1054], [340, 239, 1049], [360, 245, 1042], [380, 250, 1036], [400, 256, 1030],
      [420, 262, 1024], [440, 267, 1018], [460, 273, 1012], [480, 279, 1006], [500, 286, 1000],
      [520, 291, 994], [540, 297, 988], [560, 303, 983], [580, 313, 972], [600, 331, 953],
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
      // Sprint 2.2 story 15b — bumped 64 → 56 to reclaim vertical
      // headroom now that the speed row carries standalone subtitles
      // below each button + a per-game section title ("Speed" vs
      // "Difficulty"). 56 stays above the iOS HIG 44 px touch-target
      // floor with margin.
      mathHeightPx: 56,
      mathColGapPx: 20,
      mathRowGapPx: 12,
      mathMaxPerRow: 4,
      speedWidthPx: 160,
      // Same 64 → 56 height bump as the math tiles.
      speedHeightPx: 56,
      // Sprint 2.2 story 15b — bumped 20 → 60 so the standalone subtitle
      // text under each speed button has horizontal breathing room. At
      // 20 px gap the three subtitles read as one continuous run-on
      // string ("2 rungs · 5:00 timer 3 rungs · 3:36 timer …").
      speedGapPx: 60,
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
      /**
       * Sprint 2.5.2 — Number Climb only. Climb adds a "N floors per
       * round" line between the section label and the difficulty buttons,
       * which needs more room than the 75px offset leaves. The section
       * label lifts by this extra amount on Climb (keeps ~14px clear of the
       * third Math Type row above).
       */
      climbSectionLabelExtraOffsetY: 18,
      /**
       * Sprint 2.5.2 — gap between the BOTTOM of the Climb floor-count
       * line and the TOP edge of the difficulty buttons (the line is
       * bottom-anchored so its descenders never touch the button stroke).
       */
      floorCountLabelGapPx: 8,
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
     *    button's hit area and the top of the canvas bottom gutter
     *    (`attributionFooterHeightPx`). Bumped to 16 (was 8) in sprint 0.6
     *    when the footer was in-canvas, to keep the hit-circle out of the
     *    Source-URL click zone. Since sprint 2.5.2 the footer is a DOM strip
     *    below the canvas, so this is just thumb-room spacing.
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
  return isDesktopViewport()
    ? config.numberClimb.floorSpacingPx.desktop
    : config.numberClimb.floorSpacingPx.mobile;
}
