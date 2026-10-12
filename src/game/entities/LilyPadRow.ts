// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { POND_PAD_KEYS } from '@/core/spriteKeys';
import { textStyle } from '@/game/ui/typography';
import { padXs, pickPadLooks } from '@/game/systems/frogSplashMath';

interface Pad {
  readonly container: Phaser.GameObjects.Container;
  readonly label: Phaser.GameObjects.Text;
  answer: number | null;
}

/**
 * One drifting row of lily pads (sprint 2.5.6). Pads are evenly spaced
 * and wrap across a span a little wider than the screen, drifting in the
 * row's direction. The active row carries answer labels; other rows are
 * plain scenery. A row can hold still (the frog committed to a hop, or
 * the row is done) and a single pad can sink after a wrong landing.
 */
export class LilyPadRow {
  private readonly pads: Pad[] = [];
  private readonly cfg = config.frogSplash.pad;
  private offset: number;
  /** 1 = drifting at full speed, 0 = still; tweened when easing to a stop. */
  private readonly drift = { factor: 1 };
  private stopped = false;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly y: number,
    private readonly dir: 1 | -1,
    count: number,
    private readonly speedPxPerSec: number,
    private readonly screenWidth: number,
    rng: () => number,
  ) {
    this.offset = rng() * (screenWidth + this.cfg.wrapExtraPx);
    const looks = pickPadLooks(count, POND_PAD_KEYS.length, rng);
    for (let i = 0; i < count; i++) {
      const size = this.cfg.displayPx * (1 + (rng() * 2 - 1) * this.cfg.sizeJitter);
      const img = scene.add.image(0, 0, POND_PAD_KEYS[looks[i]!]!).setDisplaySize(size, size);
      img.setAngle(rng() * 360);
      const label = scene.add.text(0, 0, '', textStyle('alienAnswer')).setOrigin(0.5);
      // Same dark outline as the other games' answer labels (readable on any pad shade).
      label.setStroke('#0b1020', 7);
      const container = scene.add.container(0, y, [img, label]).setDepth(2);
      this.pads.push({ container, label, answer: null });
    }
    this.layout();
  }

  get count(): number {
    return this.pads.length;
  }

  update(dtMs: number): void {
    if (this.stopped) return;
    this.offset += this.dir * this.speedPxPerSec * this.drift.factor * (dtMs / 1000);
    this.layout();
  }

  padPosition(i: number): { x: number; y: number } {
    const c = this.pads[i]!.container;
    return { x: c.x, y: c.y };
  }

  positions(): Array<{ x: number; y: number }> {
    return this.pads.map((p) => ({ x: p.container.x, y: p.container.y }));
  }

  answerAt(i: number): number | null {
    return this.pads[i]?.answer ?? null;
  }

  /** Label the pads with answers (in order), or clear them (`null` = scenery row). */
  setAnswers(answers: ReadonlyArray<{ answer: number; display: string }> | null): void {
    this.pads.forEach((p, i) => {
      const a = answers?.[i];
      p.answer = a ? a.answer : null;
      p.label.setText(a ? a.display : '');
      p.label.setScale(a && a.display.length >= 5 ? 0.7 : a && a.display.length === 4 ? 0.85 : 1);
    });
  }

  /** Hold still right away (the frog has committed to a hop onto this row). */
  hold(): void {
    this.scene.tweens.killTweensOf(this.drift);
    this.drift.factor = 0;
  }

  /** Start drifting again (after a splash). */
  release(): void {
    this.stopped = false;
    this.scene.tweens.killTweensOf(this.drift);
    this.drift.factor = 1;
  }

  /** Ease to a permanent stop (row done — the frog sits here). */
  stop(): void {
    this.scene.tweens.add({
      targets: this.drift,
      factor: 0,
      duration: this.cfg.stopMs,
      ease: 'Quad.Out',
      onComplete: () => {
        this.stopped = true;
      },
    });
  }

  /** The pad under a wrong landing sinks out of sight. */
  sink(i: number): void {
    const c = this.pads[i]!.container;
    this.scene.tweens.add({
      targets: c,
      scale: 0.55,
      alpha: 0,
      duration: this.cfg.sinkMs,
      ease: 'Quad.In',
    });
  }

  /** Bring every pad back (after a splash, before the retry). */
  restore(): void {
    for (const p of this.pads) {
      this.scene.tweens.killTweensOf(p.container);
      p.container.setAlpha(0).setScale(0.8);
      this.scene.tweens.add({ targets: p.container, alpha: 1, scale: 1, duration: 260, ease: 'Back.Out' });
    }
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.drift);
    for (const p of this.pads) {
      this.scene.tweens.killTweensOf(p.container);
      p.container.destroy();
    }
    this.pads.length = 0;
  }

  private layout(): void {
    const xs = padXs(this.pads.length, this.screenWidth, this.cfg.wrapExtraPx, this.offset);
    this.pads.forEach((p, i) => p.container.setX(xs[i]!));
  }
}
