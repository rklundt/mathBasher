// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { config } from '@/core/config';
import { NumberClimbRung } from '@/game/entities/NumberClimbRung';
import { NumberClimbFloorFrame } from '@/game/entities/NumberClimbFloorFrame';
import { defaultRng } from '@/math/rng';
import { ClimbFloorBgKeys, pickRandomClimbFloorBgKey } from '@/core/spriteKeys';
import type { Question } from '@/math/types';
import type { SpeedKey } from '@/core/config';
import {
  pickSubsetWithCorrect,
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
 *   - **wrongPickedMulligan(rung)** — first wrong pick on this floor;
 *     scene should deduct timer + play wrong SFX + fall hero back to
 *     this floor's base, then keep this floor up for the second try.
 *   - **wrongPickedTerminal(rung)** — second wrong on this floor;
 *     scene should end the round (fall hero off screen, GameOver).
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
 * Three discrete outcomes a `pickRung` call can produce. The scene
 * dispatches on the outcome:
 *   - 'correct'           → award score, advance floor
 *   - 'wrong-mulligan'    → first wrong; time penalty + fall back
 *   - 'wrong-terminal'    → second wrong on same floor; end round
 *   - 'rung-consumed'     → defensive — the picked rung was already
 *                           tried this floor (e.g. double-tap of the
 *                           same wrong rung). Scene should ignore.
 */
export type RungPickOutcome =
  | { kind: 'correct'; rung: NumberClimbRung }
  | { kind: 'wrong-mulligan'; rung: NumberClimbRung }
  | { kind: 'wrong-terminal'; rung: NumberClimbRung }
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
      const frame = new NumberClimbFloorFrame({
        scene: this.opts.scene,
        centerX: (this.opts.leftBound + this.opts.rightBound) / 2,
        centerY: floorY,
        playfieldWidth: this.opts.rightBound - this.opts.leftBound,
        floorHeight: this.opts.floorHeight,
        bgKey: pickRandomClimbFloorBgKey(rng),
        drawGroundBar: false,
      });
      frame.setDepth(this.opts.frameDepth);
      this.frames.push(frame);
    }

    // Sprint 2.2 story 13b — pre-spawn the NEXT floor's frame at reduced
    // alpha so the kid can see where they're headed. Skip on the top
    // floor (nothing to preview beyond it).
    if (this.floorsSpawned < this.opts.totalFloors) {
      const previewY = floorY - this.opts.floorHeight;
      const preview = new NumberClimbFloorFrame({
        scene: this.opts.scene,
        centerX: (this.opts.leftBound + this.opts.rightBound) / 2,
        centerY: previewY,
        playfieldWidth: this.opts.rightBound - this.opts.leftBound,
        floorHeight: this.opts.floorHeight,
        bgKey: pickRandomClimbFloorBgKey(rng),
        drawGroundBar: false,
      });
      preview.setDepth(this.opts.frameDepth);
      preview.setAlpha(PREVIEW_ALPHA);
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

    // Distribute rungs horizontally — even spacing across the
    // playfield with safe margins. With N rungs, the spacing between
    // centers = playfieldWidth / N (so each rung gets its own band).
    const playfieldWidth = this.opts.rightBound - this.opts.leftBound;
    const bandWidth = playfieldWidth / targetRungCount;
    for (let i = 0; i < targetRungCount; i++) {
      // Center of the i-th band, in world coords.
      const x = this.opts.leftBound + bandWidth * (i + 0.5);
      const rung = new NumberClimbRung({
        scene: this.opts.scene,
        x,
        y: floorY,
        answer: pickedAnswers[i]!,
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
    if (this.paused) return { kind: 'rung-consumed' }; // defensive — shouldn't happen but safe
    if (!this.rungs.includes(rung)) return { kind: 'rung-consumed' };

    if (rung.answer === this.correctAnswer) {
      _th.logToAi('NumberClimb.correctPick', SeverityLevel.Verbose, {
        reason: `answer=${String(rung.answer)} usedMulligan=${String(this.wrongsThisFloor > 0)}`,
      });
      return { kind: 'correct', rung };
    }

    // Wrong rung — consume it so the kid can't re-pick the same one.
    rung.consume();
    this.wrongsThisFloor += 1;
    if (this.wrongsThisFloor === 1) {
      _th.logToAi('NumberClimb.wrongMulligan', SeverityLevel.Information, {
        reason: `wrongAnswer=${String(rung.answer)}`,
      });
      return { kind: 'wrong-mulligan', rung };
    }
    // Second wrong on this floor — terminal.
    _th.logToAi('NumberClimb.wrongTerminal', SeverityLevel.Information, {
      reason: `wrongAnswer=${String(rung.answer)}`,
    });
    return { kind: 'wrong-terminal', rung };
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
  }
}

// `pickSubsetWithCorrect` + helpers live in `numberClimbFloorMath.ts`
// (separate file so the test imports skip Phaser).
// Avoid the "config is declared but unused" lint by reading it once
// for documentation purposes. The current implementation reads
// nothing from config but future tuning likely will.
void config;
