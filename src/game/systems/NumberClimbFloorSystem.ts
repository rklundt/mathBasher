// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { NumberClimbRung } from '@/game/entities/NumberClimbRung';
import { NumberClimbFloorFrame } from '@/game/entities/NumberClimbFloorFrame';
import { defaultRng } from '@/math/rng';
import {
  ClimbEscapeShipKeys,
  ClimbFloorBgKeys,
  pickRandomClimbFloorBgKey,
  type ClimbFloorBgKey,
} from '@/core/spriteKeys';
import type { Question } from '@/math/types';
import type { SpeedKey } from '@/core/config';
import {
  pickSubsetWithCorrect,
  resolveRungPick,
  RUNGS_PER_DIFFICULTY,
} from '@/game/systems/numberClimbFloorMath';

/**
 * Owns the per-floor lifecycle for Number Climb: spawning rungs at
 * the next floor, tracking which rungs the kid has tried on this
 * floor, and producing the events the scene needs to drive the
 * gameplay loop:
 *
 *   - **correctPicked(rung)** — kid picked the right rung; scene
 *     should award score, animate the hero up, scroll camera,
 *     advance to the next floor.
 *   - **wrongPickedMulligan(rung)** — a wrong pick; scene deducts
 *     timer + plays wrong SFX + spends one cumulative life + falls the
 *     hero back to this floor's base, then keeps this floor up for
 *     another try (as long as lives remain). Sprint 2.5.2 removed the
 *     per-floor "2nd wrong ends the round" terminal — the scene's
 *     climb-wide 3-life cap is now the sole wrong-pick round-ender.
 *
 * Difficulty controls rung count:
 *   - Easy → 2 rungs
 *   - Medium → 3 rungs
 *   - Hard → 4 rungs
 *
 * Wired to the math content via the question's `choices` array. A
 * Question always has 4 choices (per the math generator contract);
 * for Easy/Medium we use the first 2/3 in shuffled order (so the
 * correct answer isn't always in the same slot). The correct answer
 * is guaranteed to be among the chosen subset by re-rolling the
 * shuffle if it omits the correct one (small fixed-iteration loop).
 *
 * Position model: rungs are spawned at a known floor y-coordinate,
 * distributed horizontally across the playfield with even spacing.
 * Each rung has a 1-based index matching the keyboard shortcut.
 */

// `RUNGS_PER_DIFFICULTY` lives in `numberClimbFloorMath.ts` so tests
// can import it without dragging Phaser into the Node test env.

/**
 * Sprint 2.2 story 13b — alpha used for the next-floor preview frame.
 * 0.25 = quarter visibility — readable enough that the kid sees the
 * silhouette / palette of what's coming, but the current floor stays
 * visually dominant. 0.33 was the upper end of the design call (per
 * sprint conversation); 0.25 chosen so the active floor wins the
 * attention contest cleanly.
 */
const PREVIEW_ALPHA = 0.25;
/** Tween duration (ms) for the preview-promote alpha ramp (0.25 → 1.0). */
const PREVIEW_PROMOTE_TWEEN_MS = 300;

export interface NumberClimbFloorSystemOpts {
  scene: Phaser.Scene;
  /** Playfield bounds for rung-distribution math. */
  leftBound: number;
  rightBound: number;
  /** Difficulty key (reused from SpeedKey today; story 10 may split into its own type if needed). */
  difficulty: SpeedKey;
  /** Vertical span of one floor (px). Matches `FLOOR_SPACING_PX` in the scene. */
  floorHeight: number;
  /** Z-depth for the floor frames (story 13a). Frames render BELOW rungs + hero. */
  frameDepth: number;
  /**
   * Total climbable floors in this round. Used by story 13b's
   * next-floor-preview to know when NOT to spawn a preview (no floor
   * above the top floor).
   */
  totalFloors: number;
  /** Optional RNG injection for deterministic tests. */
  rng?: () => number;
}

/**
 * The discrete outcomes a `pickRung` call can produce. The scene
 * dispatches on the outcome:
 *   - 'correct'           → award score, advance floor
 *   - 'wrong-mulligan'    → a wrong pick; time penalty + spend a life +
 *                           fall back to retry (round ends only when the
 *                           scene's cumulative 3-life cap is exhausted —
 *                           sprint 2.5.2 removed the per-floor terminal)
 *   - 'rung-consumed'     → defensive — the picked rung was already
 *                           tried this floor (e.g. double-tap of the
 *                           same wrong rung). Scene should ignore.
 */
export type RungPickOutcome =
  | { kind: 'correct'; rung: NumberClimbRung }
  | { kind: 'wrong-mulligan'; rung: NumberClimbRung }
  | { kind: 'rung-consumed' };

export class NumberClimbFloorSystem {
  private rungs: NumberClimbRung[] = [];
  /**
   * Sprint 2.2 story 13a — per-floor framing visuals (bg image inside
   * black side-bars + horizontal separator). Frames PERSIST across
   * floor advances so the kid sees the stack of floors below them as
   * they climb. Cleaned up only at scene shutdown via `clearAllFrames`.
   */
  private frames: NumberClimbFloorFrame[] = [];
  /**
   * Sprint 2.2 story 13b — the NEXT floor's frame, pre-spawned at
   * reduced alpha so the kid can see what's coming. On the next
   * `spawnFloor` call (when the kid actually arrives), this frame is
   * promoted: alpha tweens from `PREVIEW_ALPHA` → 1.0 and the frame
   * moves into `frames`. A fresh preview is spawned for the floor
   * above. Null only at the very start (before the first spawnFloor)
   * or after the top floor (no floor above to preview).
   */
  private nextFloorPreview: NumberClimbFloorFrame | null = null;
  /**
   * Spawn-call counter. Increments on each `spawnFloor`. Used to know
   * when the current spawn is for the TOP floor (so we skip the
   * next-floor preview that would otherwise sit above the climb's max
   * height).
   */
  private floorsSpawned = 0;
  /**
   * Sprint 2.2 story 13c — keys already used as floor bgs in this round.
   * Passed to `pickRandomClimbFloorBgKey` as exclusions so a single
   * 10-floor round never repeats a room. Reset on `clearAllFrames`.
   * Stores the keys for BOTH the current-floor frame and the
   * next-floor preview (the preview becomes the current floor on the
   * next promote, so it counts toward distinctness too).
   */
  private usedFloorBgKeys: ClimbFloorBgKey[] = [];
  /**
   * Sprint 2.2 story 13e — reference to the escape (top) floor's frame
   * so the scene can trigger its win-animation by name. Set when the
   * escape frame is created (as preview on floor N-1's spawnFloor);
   * stays valid through the promote-to-current transition because the
   * preview IS the current floor — same Phaser instance.
   */
  private escapeFrame: NumberClimbFloorFrame | null = null;
  /**
   * Wrong-rung count for the current floor. Starts at 0 each
   * `spawnFloor` call. A first wrong increments to 1 (mulligan); a
   * second wrong increments to 2 (terminal). Reset on every new
   * floor.
   */
  private wrongsThisFloor = 0;
  private correctAnswer = -1;
  private paused = false;

  constructor(private readonly opts: NumberClimbFloorSystemOpts) {}

  // ----- Pause / resume ----------------------------------------------------

  pause(): void {
    this.paused = true;
    // Disable rung pick during pause — kid mashing taps during a
    // pause shouldn't queue up picks for after-resume.
    for (const rung of this.rungs) {
      rung.setInputEnabled(false);
    }
  }

  resume(): void {
    this.paused = false;
    for (const rung of this.rungs) {
      rung.setInputEnabled(true);
    }
  }

  isPaused(): boolean {
    return this.paused;
  }

  // ----- Floor lifecycle ---------------------------------------------------

  /**
   * Spawn N rungs at the supplied floor y-coordinate for the given
   * question. N is from `RUNGS_PER_DIFFICULTY` based on the
   * difficulty setting. The correct-answer rung is guaranteed to be
   * present.
   *
   * Returns the spawned rungs so the scene can wire up its input
   * system to listen for pointer events on each.
   */
  spawnFloor(question: Question, floorY: number): NumberClimbRung[] {
    // Tear down any leftover rungs from the previous floor.
    if (this.rungs.length > 0) {
      this.clearFloor();
    }
    this.wrongsThisFloor = 0;
    this.correctAnswer = question.correctAnswer;

    const rng = this.opts.rng ?? defaultRng;
    const targetRungCount = RUNGS_PER_DIFFICULTY[this.opts.difficulty];

    this.floorsSpawned += 1;

    // Sprint 2.2 story 13b — current-floor frame is either promoted from
    // a preview spawned on the previous call, or created fresh if this
    // is the first spawnFloor (no preview yet). Floor 0 (the fire ground)
    // is spawned separately via `spawnGroundFloorFrame`, so we never
    // draw the ground bar from this code path.
    if (this.nextFloorPreview !== null) {
      // Promote the preview: tween alpha 0.25 → 1.0 so the kid sees the
      // "you've arrived" reveal smoothly. The bg key is whatever the
      // preview was created with — stable across the promote, so the
      // image the kid saw faintly is the same one they're now standing on.
      const promoted = this.nextFloorPreview;
      this.opts.scene.tweens.add({
        targets: promoted,
        alpha: 1.0,
        duration: PREVIEW_PROMOTE_TWEEN_MS,
        ease: 'Quad.Out',
      });
      this.frames.push(promoted);
      this.nextFloorPreview = null;
    } else {
      // First call (or post-`clearAllFrames` reuse) — no preview to promote.
      const isCurrentTop = this.floorsSpawned === this.opts.totalFloors;
      const frame = this.makeFloorFrame(floorY, isCurrentTop, 1.0, rng);
      this.frames.push(frame);
    }

    // Sprint 2.2 story 13b — pre-spawn the NEXT floor's frame at reduced
    // alpha so the kid can see where they're headed. Skip on the top
    // floor (nothing to preview beyond it).
    if (this.floorsSpawned < this.opts.totalFloors) {
      const isNextTop = this.floorsSpawned + 1 === this.opts.totalFloors;
      const previewY = floorY - this.opts.floorHeight;
      const preview = this.makeFloorFrame(previewY, isNextTop, PREVIEW_ALPHA, rng);
      this.nextFloorPreview = preview;
    }

    // Pick `targetRungCount` answers from `question.choices`, guaranteeing
    // the correct answer is included. Choices is 4 per the math
    // generator contract; if Easy/Medium subset accidentally omits
    // the correct answer, replace a random slot with it.
    const pickedAnswers = pickSubsetWithCorrect(
      question.choices,
      question.correctAnswer,
      targetRungCount,
      rng,
    );

    // Sprint 2.4 story 5 — map each numeric choice back to its parallel
    // display string. For integer generators `choiceDisplays` is undefined;
    // the map stays empty and rungs render the bare number. For fraction
    // generators, the map gives each picked numeric value (a decimal like
    // 0.375) its rendered fraction string ("3/8"). Choices are distinct
    // per the generator contract, so value-keyed lookup is safe.
    const displayByValue = new Map<number, string>();
    if (question.choiceDisplays !== undefined) {
      for (let j = 0; j < question.choices.length; j++) {
        const value = question.choices[j];
        const display = question.choiceDisplays[j];
        if (value !== undefined && display !== undefined) {
          displayByValue.set(value, display);
        }
      }
    }

    // Distribute rungs horizontally — even spacing across the
    // playfield with safe margins. With N rungs, the spacing between
    // centers = playfieldWidth / N (so each rung gets its own band).
    const playfieldWidth = this.opts.rightBound - this.opts.leftBound;
    const bandWidth = playfieldWidth / targetRungCount;
    for (let i = 0; i < targetRungCount; i++) {
      // Center of the i-th band, in world coords.
      const x = this.opts.leftBound + bandWidth * (i + 0.5);
      const answer = pickedAnswers[i]!;
      const rung = new NumberClimbRung({
        scene: this.opts.scene,
        x,
        y: floorY,
        answer,
        answerDisplay: displayByValue.get(answer),
        index: i + 1, // 1-based for the keyboard shortcut + visible prefix
      });
      this.rungs.push(rung);
    }

    return this.rungs.slice();
  }

  /**
   * Resolve a rung pick. The scene calls this from its input system
   * after a tap/click/key resolves to a specific rung. Pure dispatch
   * — the FloorSystem doesn't tween the hero or advance the floor;
   * the SCENE owns the visual response. FloorSystem only tracks the
   * wrong-this-floor counter and consumes spent rungs.
   */
  pickRung(rung: NumberClimbRung): RungPickOutcome {
    // Pure decision (state machine) lives in `numberClimbFloorMath.ts`
    // so it's unit-testable without Phaser; this method applies the
    // side-effects + attaches the rung.
    const decision = resolveRungPick({
      paused: this.paused,
      rungInFloor: this.rungs.includes(rung),
      rungAnswer: rung.answer,
      correctAnswer: this.correctAnswer,
      wrongsSoFar: this.wrongsThisFloor,
    });
    this.wrongsThisFloor = decision.wrongsAfter;
    if (decision.consumeRung) {
      // Consume the wrong rung so the kid can't re-pick the same one.
      rung.consume();
    }

    switch (decision.kind) {
      case 'rung-consumed':
        return { kind: 'rung-consumed' };
      case 'correct':
        _th.logToAi('NumberClimb.correctPick', SeverityLevel.Verbose, {
          reason: `answer=${String(rung.answer)} usedMulligan=${String(this.wrongsThisFloor > 0)}`,
        });
        return { kind: 'correct', rung };
      case 'wrong-mulligan':
        _th.logToAi('NumberClimb.wrongMulligan', SeverityLevel.Information, {
          reason: `wrongAnswer=${String(rung.answer)}`,
        });
        return { kind: 'wrong-mulligan', rung };
    }
  }

  /**
   * True if the kid has used the floor's one mulligan. ScoreCalculator
   * convention: a floor-pass after a mulligan scores half points
   * (matches the existing `usedWrongShot` flag from other modes).
   */
  hasUsedMulligan(): boolean {
    return this.wrongsThisFloor > 0;
  }

  /** Live rung-by-index lookup (1-based). Returns null if out of range or consumed. */
  rungByIndex(index1Based: number): NumberClimbRung | null {
    const i = index1Based - 1;
    if (i < 0 || i >= this.rungs.length) return null;
    return this.rungs[i] ?? null;
  }

  /** All rungs in the current floor (for tap-hit-detection or fade-out tweens). */
  liveRungs(): NumberClimbRung[] {
    return this.rungs.slice();
  }

  /** Tear down current floor's rungs. Called between floors AND at scene shutdown. */
  clearFloor(): void {
    for (const rung of this.rungs) {
      rung.destroy();
    }
    this.rungs = [];
  }

  /**
   * Sprint 2.2 story 13e — build a floor frame at the given normal-floor
   * y position. If `isTopFloor` is true, use the fixed Escape bg image,
   * draw at 2× height, offset the centerY so the bottom aligns with
   * where a 1× frame's bottom would have been, and attach the escape
   * ship overlay. Otherwise pick a random non-repeating room bg.
   *
   * Stashes the escape frame in `this.escapeFrame` so the scene can
   * later call `playEscapeWinAnimation()`.
   */
  private makeFloorFrame(
    floorY: number,
    isTopFloor: boolean,
    alpha: number,
    rng: () => number,
  ): NumberClimbFloorFrame {
    let bgKey: ClimbFloorBgKey;
    let frameHeight: number;
    let centerY: number;
    let escapeShipKey: string | undefined;

    if (isTopFloor) {
      bgKey = ClimbFloorBgKeys.Escape;
      frameHeight = this.opts.floorHeight * 2;
      // Center-y is half a (normal) floor-band ABOVE the normal floor
      // position so the 2× frame's BOTTOM aligns with where the 1×
      // bottom would have sat. Rungs still spawn at `floorY`, so the
      // kid lands at the bottom of the escape room — under the ship.
      centerY = floorY - this.opts.floorHeight / 2;
      escapeShipKey = ClimbEscapeShipKeys.EscapeShip;
    } else {
      bgKey = pickRandomClimbFloorBgKey(rng, this.usedFloorBgKeys);
      this.usedFloorBgKeys.push(bgKey);
      frameHeight = this.opts.floorHeight;
      centerY = floorY;
    }

    const frame = new NumberClimbFloorFrame({
      scene: this.opts.scene,
      centerX: (this.opts.leftBound + this.opts.rightBound) / 2,
      centerY,
      playfieldWidth: this.opts.rightBound - this.opts.leftBound,
      floorHeight: frameHeight,
      bgKey,
      drawGroundBar: false,
      escapeShipKey,
    });
    frame.setDepth(this.opts.frameDepth);
    frame.setAlpha(alpha);

    if (isTopFloor) {
      this.escapeFrame = frame;
    }
    return frame;
  }

  /**
   * Sprint 2.2 story 13e — kid reached floor 10; play the win beat.
   * The escape frame's ship tweens off-screen with a smoke trail.
   * No-op (immediate onComplete) if the escape frame isn't set
   * (shouldn't happen in production but defensive).
   */
  playEscapeWinAnimation(onComplete?: () => void): void {
    if (this.escapeFrame === null) {
      onComplete?.();
      return;
    }
    this.escapeFrame.playEscapeAnimation(onComplete);
  }

  /**
   * Spawn the floor-0 (ground) frame — the platform the hero starts on.
   * Uses the fixed `Fire` bg image (the "on fire, climb to escape"
   * visual cue) and draws the ground bar at its bottom edge so the
   * tower visually rests on something. Called ONCE from the scene's
   * `create()` before any `spawnFloor(...)` calls. Excluded from the
   * pickRandom pool — see `CLIMB_RANDOM_FLOOR_KEYS` in `spriteKeys.ts`.
   */
  spawnGroundFloorFrame(floorY: number): void {
    const frame = new NumberClimbFloorFrame({
      scene: this.opts.scene,
      centerX: (this.opts.leftBound + this.opts.rightBound) / 2,
      centerY: floorY,
      playfieldWidth: this.opts.rightBound - this.opts.leftBound,
      floorHeight: this.opts.floorHeight,
      bgKey: ClimbFloorBgKeys.Fire,
      drawGroundBar: true,
    });
    frame.setDepth(this.opts.frameDepth);
    this.frames.push(frame);
  }

  /**
   * Tear down all accumulated floor frames AND the next-floor preview.
   * Called at scene shutdown only — frames persist across floor advances
   * (the kid sees floors stacked below them as they climb). Also resets
   * `floorsSpawned` so a scene-instance reuse (sprint 0.6.1 Phaser
   * scene-reuse gotcha) doesn't carry the counter into the next round.
   */
  clearAllFrames(): void {
    for (const frame of this.frames) {
      frame.destroy();
    }
    this.frames = [];
    if (this.nextFloorPreview !== null) {
      this.nextFloorPreview.destroy();
      this.nextFloorPreview = null;
    }
    this.floorsSpawned = 0;
    this.usedFloorBgKeys = [];
    this.escapeFrame = null;
  }
}

// `pickSubsetWithCorrect` + helpers live in `numberClimbFloorMath.ts`
// (separate file so the test imports skip Phaser).
