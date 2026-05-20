// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { config } from '@/core/config';
import { NumberClimbRung } from '@/game/entities/NumberClimbRung';
import { defaultRng } from '@/math/rng';
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

export interface NumberClimbFloorSystemOpts {
  scene: Phaser.Scene;
  /** Playfield bounds for rung-distribution math. */
  leftBound: number;
  rightBound: number;
  /** Difficulty key (reused from SpeedKey today; story 10 may split into its own type if needed). */
  difficulty: SpeedKey;
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
}

// `pickSubsetWithCorrect` + helpers live in `numberClimbFloorMath.ts`
// (separate file so the test imports skip Phaser).
// Avoid the "config is declared but unused" lint by reading it once
// for documentation purposes. The current implementation reads
// nothing from config but future tuning likely will.
void config;
