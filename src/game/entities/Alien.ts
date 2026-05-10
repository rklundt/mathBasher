// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { advanceY } from '@/game/systems/waveKinematics';
import { FONT_FAMILY, TEXT_WHITE } from '@/game/ui/typography';

export interface AlienOpts {
  scene: Phaser.Scene;
  x: number;
  y: number;
  /** 0-indexed lane this alien occupies. Stored so HitSystem can match shots. */
  lane: number;
  /** The answer this alien carries — displayed as text on its body. */
  answer: number;
  /** Initial descent speed in pixels per second. WaveSystem can change it. */
  descentSpeedPxPerSec: number;
}

/**
 * One descending alien carrying an answer. Four of these spawn per question
 * (one per lane); WaveSystem owns descent speed for all live aliens so the
 * wrong-shot penalty can boost them as a group.
 *
 * Visuals: a placeholder rounded-corner panel (~80x60) with the answer rendered
 * as large centered text. Real Kenney sprites land in the art-polish milestone.
 */
export class Alien extends Phaser.GameObjects.Container {
  static readonly WIDTH = 80;
  static readonly HEIGHT = 60;

  readonly lane: number;
  readonly answer: number;
  private descentSpeed: number;
  private destroyed = false;
  private readonly chassis: Phaser.GameObjects.Rectangle;
  private readonly answerText: Phaser.GameObjects.Text;

  constructor(opts: AlienOpts) {
    super(opts.scene, opts.x, opts.y);
    opts.scene.add.existing(this);

    this.lane = opts.lane;
    this.answer = opts.answer;
    this.descentSpeed = opts.descentSpeedPxPerSec;

    this.chassis = opts.scene.add.rectangle(0, 0, Alien.WIDTH, Alien.HEIGHT, 0x4338ca);
    this.chassis.setStrokeStyle(2, 0x6366f1);

    this.answerText = opts.scene.add.text(0, 0, String(opts.answer), {
      fontFamily: FONT_FAMILY,
      fontSize: '32px',
      color: TEXT_WHITE,
      fontStyle: 'bold',
    });
    this.answerText.setOrigin(0.5);

    this.add([this.chassis, this.answerText]);
    this.setSize(Alien.WIDTH, Alien.HEIGHT);
  }

  /**
   * Per-frame descent. WaveSystem calls this for every live alien.
   * Pause is handled at the WaveSystem layer (its `update(dt)` early-returns
   * when paused), so this method can stay unconditional.
   */
  advance(dt: number): void {
    if (this.destroyed) return;
    this.y = advanceY(this.y, dt, this.descentSpeed);
  }

  /** Change descent speed mid-flight (used for the wrong-shot speed penalty). */
  setDescentSpeed(speed: number): void {
    this.descentSpeed = speed;
  }

  /** Y-coordinate of the alien's BOTTOM edge. Used to detect "reached hero". */
  bottomY(): number {
    return this.y + Alien.HEIGHT / 2;
  }

  /**
   * Explode animation. Tints the chassis green (correct) or red (wrong),
   * scales up + fades out, then calls `onComplete`. Short (~250ms) for
   * snappy feedback.
   */
  playExplodeAnim(correct: boolean, onComplete: () => void): void {
    if (this.destroyed) {
      onComplete();
      return;
    }
    this.destroyed = true;
    this.chassis.setFillStyle(correct ? 0x22c55e : 0xef4444);
    this.chassis.setStrokeStyle(2, correct ? 0x16a34a : 0xb91c1c);
    this.scene.tweens.add({
      targets: this,
      scale: 1.4,
      alpha: 0,
      duration: 250,
      ease: 'Quad.Out',
      onComplete: () => {
        this.destroy();
        onComplete();
      },
    });
  }

  /** Smooth fade-out for the OTHER aliens in the wave when one is hit. */
  playFadeOut(onComplete?: () => void): void {
    if (this.destroyed) {
      onComplete?.();
      return;
    }
    this.destroyed = true;
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 200,
      ease: 'Linear',
      onComplete: () => {
        this.destroy();
        onComplete?.();
      },
    });
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }
}
