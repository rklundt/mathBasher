// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { Alien } from '@/game/entities/Alien';
import type { Question } from '@/math/types';

export interface WaveSystemOpts {
  scene: Phaser.Scene;
  /** Number of lanes — alien count per wave. From config.layout.targetLanes. */
  lanes: number;
  /** Initial descent speed for each wave (config.scoring.speed[speed].descentPxPerSec). */
  descentSpeedPxPerSec: number;
  /** Speed used for the rest of the wave once the player has fired a wrong shot. */
  penaltyPxPerSec: number;
  /** Left edge of the play area where lane 0 starts. */
  leftBound: number;
  /** Right edge of the play area where the last lane ends. */
  rightBound: number;
  /** Y where aliens spawn (top of the canvas, above the visible area). */
  spawnY: number;
  /** Y representing the hero's position — when an alien crosses this, the wave fails. */
  heroY: number;
}

export type WaveOutcome = 'in-progress' | 'reached-hero';

/**
 * Owns the four-alien wave that represents one math question. WaveSystem
 * spawns aliens (one per lane carrying one of the question's `choices`),
 * advances them each frame, and reports when one reaches the hero.
 *
 * The "wrong-shot speed penalty" is applied as a one-shot speed boost on
 * EVERY live alien — the player gets shorter time to recover when they fire
 * at the wrong answer.
 *
 * NOTE: WaveSystem owns descent state for the GROUP. Individual `Alien`
 * entities have their own per-instance speed too (so `applyWrongShotPenalty`
 * just walks the array and updates each), but the system is the source of
 * truth for wave state.
 */
export class WaveSystem {
  private aliens: Alien[] = [];
  private correctAnswerLane = -1;
  private penaltyApplied = false;
  private paused = false;

  constructor(private readonly opts: WaveSystemOpts) {}

  /**
   * Freeze descent. While paused, `update(dt)` early-returns 'in-progress'
   * without advancing aliens — they sit at their current Y positions, so a
   * resume continues from exactly where the player left off (no snap, no
   * accumulated drift). Idempotent.
   */
  pause(): void {
    this.paused = true;
  }

  /** Resume descent. Idempotent. */
  resume(): void {
    this.paused = false;
  }

  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Spawn one wave of `lanes` aliens for the given question. The shuffled
   * `question.choices` are assigned to lanes in order; the lane carrying
   * `question.correctAnswer` is recorded so `isCorrect()` can answer later.
   */
  spawnWave(question: Question): Alien[] {
    if (this.aliens.length > 0) {
      // Defensive: clear any leftover wave before spawning a new one.
      this.clearWave(true);
    }
    this.penaltyApplied = false;
    this.correctAnswerLane = -1;

    const span = this.opts.rightBound - this.opts.leftBound;
    const laneWidth = span / this.opts.lanes;
    const speed = this.opts.descentSpeedPxPerSec;

    for (let lane = 0; lane < this.opts.lanes; lane++) {
      const x = this.opts.leftBound + laneWidth * (lane + 0.5);
      const answer = question.choices[lane] ?? 0;
      const alien = new Alien({
        scene: this.opts.scene,
        x,
        y: this.opts.spawnY,
        lane,
        answer,
        descentSpeedPxPerSec: speed,
      });
      this.aliens.push(alien);
      if (answer === question.correctAnswer && this.correctAnswerLane < 0) {
        this.correctAnswerLane = lane;
      }
    }
    return this.aliens.slice();
  }

  /**
   * Advance every live alien this frame; report the wave's status so
   * GameScene can decide whether to end the question. While paused, this
   * is a no-op that always reports 'in-progress' — aliens stay frozen at
   * their current positions until `resume()` is called.
   */
  update(dt: number): WaveOutcome {
    if (this.paused) return 'in-progress';
    for (const a of this.aliens) {
      if (!a.isDestroyed()) a.advance(dt);
    }
    for (const a of this.aliens) {
      if (!a.isDestroyed() && a.bottomY() >= this.opts.heroY) {
        return 'reached-hero';
      }
    }
    return 'in-progress';
  }

  /**
   * Apply the wrong-shot speed penalty to every live alien. Idempotent — only
   * the first call has effect; subsequent calls are no-ops (a second wrong
   * shot doesn't keep accelerating the wave).
   */
  applyWrongShotPenalty(): void {
    if (this.penaltyApplied) return;
    this.penaltyApplied = true;
    for (const a of this.aliens) {
      if (!a.isDestroyed()) a.setDescentSpeed(this.opts.penaltyPxPerSec);
    }
  }

  /** True if `usedWrongShotPenalty()` has been called this wave. */
  hasUsedWrongShot(): boolean {
    return this.penaltyApplied;
  }

  /** Was the alien at this lane the correct answer? */
  isCorrectLane(lane: number): boolean {
    return lane === this.correctAnswerLane;
  }

  /** Live aliens (not yet destroyed/exploded). Used by HitSystem. */
  liveAliens(): Alien[] {
    return this.aliens.filter((a) => !a.isDestroyed());
  }

  /**
   * Tear down the wave. `instant=true` snaps them away (used at scene exit
   * or right before spawning a fresh wave); otherwise the caller is
   * expected to have already played explode/fade animations on them.
   */
  clearWave(instant = false): void {
    for (const a of this.aliens) {
      if (instant && !a.isDestroyed()) a.destroy();
    }
    this.aliens = [];
    this.correctAnswerLane = -1;
    this.penaltyApplied = false;
    this.paused = false;
  }
}
