// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { ReefSpriteKeys } from '@/core/spriteKeys';
import { textStyle } from '@/game/ui/typography';

/**
 * One rising Math-a-lotl answer bubble (sprint 2.5.4): the glossy
 * bubble image with the answer printed on it. Rises at a constant
 * speed with a gentle side-to-side sway. Three ways to leave:
 *  - `popCorrect` — swells and bursts into sparkles (caught, right),
 *  - `popWrong`   — squishes / wobbles, then bursts (caught, wrong),
 *  - `popQuiet`   — a small fade (escaped at the surface, or cleared).
 * Each pop is one-shot; `alive` goes false at the start of the pop so
 * the scene stops treating the bubble as catchable straight away.
 */
export class AnswerBubble {
  readonly container: Phaser.GameObjects.Container;
  readonly answer: number;
  readonly radius: number;
  alive = true;
  private readonly baseX: number;
  private readonly rise: number;
  /** Random sway phase so neighbouring bubbles don't sway in lockstep. */
  private readonly phase: number;
  private elapsed = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    opts: { x: number; y: number; answer: number; display: string; risePxPerSec: number },
  ) {
    const cfg = config.mathALotl.bubble;
    this.answer = opts.answer;
    this.radius = cfg.diameterPx / 2;
    this.baseX = opts.x;
    this.rise = opts.risePxPerSec;
    this.phase = Math.random() * Math.PI * 2;

    const img = scene.add.image(0, 0, ReefSpriteKeys.Bubble);
    img.setDisplaySize(cfg.diameterPx, cfg.diameterPx);
    const label = scene.add.text(0, 0, opts.display, textStyle('alienAnswer')).setOrigin(0.5);
    label.setShadow(0, 2, '#1d4f8a', 4, true, true);
    // Same long-label shrink as the other games' answer carriers so
    // fraction strings ("1 2/3") fit inside the bubble.
    if (opts.display.length >= 5) label.setScale(0.7);
    else if (opts.display.length === 4) label.setScale(0.85);
    this.container = scene.add.container(opts.x, opts.y, [img, label]);
    this.container.setDepth(10);
  }

  get x(): number {
    return this.container.x;
  }

  get y(): number {
    return this.container.y;
  }

  update(dtMs: number): void {
    if (!this.alive) return;
    const dt = dtMs / 1000;
    const { swayPx, swayHz } = config.mathALotl.bubble;
    this.elapsed += dt;
    this.container.y -= this.rise * dt;
    this.container.x = this.baseX + swayPx * Math.sin(Math.PI * 2 * swayHz * this.elapsed + this.phase);
  }

  popCorrect(onDone?: () => void): void {
    if (!this.alive) return;
    this.alive = false;
    this.scene.tweens.add({
      targets: this.container,
      scale: 1.35,
      alpha: 0,
      duration: 220,
      ease: 'Quad.Out',
      onComplete: () => {
        this.container.destroy();
        onDone?.();
      },
    });
  }

  popWrong(onDone?: () => void): void {
    if (!this.alive) return;
    this.alive = false;
    // Squish-wobble (reads as "oops", not as an explosion), then burst.
    this.scene.tweens.chain({
      targets: this.container,
      tweens: [
        { scaleX: 1.25, scaleY: 0.8, duration: 90, ease: 'Sine.InOut' },
        { scaleX: 0.85, scaleY: 1.2, duration: 90, ease: 'Sine.InOut' },
        { scaleX: 1.1, scaleY: 0.92, duration: 80, ease: 'Sine.InOut' },
        { scale: 1.3, alpha: 0, duration: 160, ease: 'Quad.Out' },
      ],
      onComplete: () => {
        this.container.destroy();
        onDone?.();
      },
    });
  }

  popQuiet(onDone?: () => void): void {
    if (!this.alive) return;
    this.alive = false;
    this.scene.tweens.add({
      targets: this.container,
      scale: 1.15,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        this.container.destroy();
        onDone?.();
      },
    });
  }

  /** Immediate teardown (scene shutdown). */
  destroy(): void {
    this.alive = false;
    this.scene.tweens.killTweensOf(this.container);
    this.container.destroy();
  }
}
