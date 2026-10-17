// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { POND_PAD_KEYS } from '@/core/spriteKeys';
import { textStyle } from '@/game/ui/typography';
import { MathText } from '@/game/ui/MathText';
import { labelShiftX, nudgeIntoView, padXs, pickPadLooks, wrapPeerX } from '@/game/systems/frogSplashMath';

/** Gap kept between a pad's number and the screen edge. */
const LABEL_EDGE_PX = 4;

interface Pad {
  readonly container: Phaser.GameObjects.Container;
  readonly label: MathText;
  /**
   * The same pad drawn one screen width away, seen while it straddles an
   * edge. No label: the number shows once, on the main copy. (A container
   * like the main copy, so sink / restore scale both the same way.)
   */
  readonly peer: Phaser.GameObjects.Container;
  readonly radius: number;
  answer: number | null;
}

/**
 * One drifting row of lily pads (sprint 2.5.6). Pads are evenly spaced
 * and wrap around a loop one screen wide, drifting in the row's
 * direction: a pad leaving one edge is already coming back in on the
 * other (drawn twice while it straddles the edge), so no answer hides. The active row carries answer labels; other rows are
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
    this.offset = rng() * screenWidth;
    const looks = pickPadLooks(count, POND_PAD_KEYS.length, rng);
    for (let i = 0; i < count; i++) {
      const size = this.cfg.displayPx * (1 + (rng() * 2 - 1) * this.cfg.sizeJitter);
      const angle = rng() * 360;
      const padImage = (): Phaser.GameObjects.Image =>
        scene.add.image(0, 0, POND_PAD_KEYS[looks[i]]).setDisplaySize(size, size).setAngle(angle);
      const label = new MathText(scene, 0, 0, '', textStyle('alienAnswer'));
      // Same dark outline as the other games' answer labels (readable on any pad shade).
      label.setStroke('#0b1020', 7);
      const container = scene.add.container(0, y, [padImage(), label]).setDepth(2);
      const peer = scene.add.container(0, y, [padImage()]).setDepth(2);
      this.pads.push({ container, label, peer, radius: size / 2, answer: null });
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

  /** Centre of pad `i` — the copy showing more of it (always the main one). */
  padPosition(i: number): { x: number; y: number } {
    const c = this.pads[i].container;
    return { x: c.x, y: c.y };
  }

  positions(): Array<{ x: number; y: number }> {
    return this.pads.map((p) => ({ x: p.container.x, y: p.container.y }));
  }

  /** Every drawn copy of every pad (main + wrap copy), for tap hit-testing. */
  tapTargets(): Array<{ x: number; y: number; i: number }> {
    return this.pads.flatMap((p, i) => [
      { x: p.container.x, y: this.y, i },
      { x: p.peer.x, y: this.y, i },
    ]);
  }

  answerAt(i: number): number | null {
    return this.pads[i]?.answer ?? null;
  }

  /** Label the pads with answers (in order), or clear them (`null` = scenery row). */
  setAnswers(answers: ReadonlyArray<{ answer: number; display: string }> | null): void {
    this.pads.forEach((p, i) => {
      const a = answers?.[i];
      p.answer = a ? a.answer : null;
      const scale = a && a.display.length >= 5 ? 0.7 : a && a.display.length === 4 ? 0.85 : 1;
      // Only the main copy carries the number (the wrap copy is the smaller
      // half): a "15" split across the edge must never read as "1" and "5".
      p.label.setText(a ? a.display : '').setScale(scale);
    });
    this.layout();
  }

  /**
   * Hold still right away (the frog has committed to a hop onto pad `i`).
   * If that pad is split across a screen edge, the row slides it whole
   * onto the screen during the hop, so the frog never lands half on each side.
   */
  hold(i: number): void {
    this.scene.tweens.killTweensOf(this.drift);
    this.drift.factor = 0;
    const p = this.pads[i];
    if (!p) return;
    const shift = nudgeIntoView(p.container.x, p.radius, this.screenWidth, this.cfg.edgeMarginPx);
    if (shift === 0) return;
    const nudge = { v: this.offset };
    this.scene.tweens.add({
      targets: nudge,
      v: this.offset + shift,
      duration: this.cfg.nudgeMs,
      ease: 'Sine.Out',
      onUpdate: () => {
        this.offset = nudge.v;
        this.layout();
      },
    });
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
    const p = this.pads[i];
    this.scene.tweens.add({
      targets: [p.container, p.peer],
      scale: 0.55,
      alpha: 0,
      duration: this.cfg.sinkMs,
      ease: 'Quad.In',
    });
  }

  /** Bring every pad back (after a splash, before the retry). */
  restore(): void {
    for (const p of this.pads) {
      const both = [p.container, p.peer];
      this.scene.tweens.killTweensOf(both);
      for (const c of both) c.setAlpha(0).setScale(0.8);
      this.scene.tweens.add({ targets: both, alpha: 1, scale: 1, duration: 260, ease: 'Back.Out' });
    }
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.drift);
    for (const p of this.pads) {
      this.scene.tweens.killTweensOf([p.container, p.peer]);
      p.container.destroy();
      p.peer.destroy();
    }
    this.pads.length = 0;
  }

  private layout(): void {
    const xs = padXs(this.pads.length, this.screenWidth, this.offset);
    this.pads.forEach((p, i) => {
      const x = xs[i];
      p.container.setX(x);
      p.peer.setX(wrapPeerX(x, this.screenWidth));
      // Keep the whole number on screen while its pad straddles an edge.
      p.label.setX(labelShiftX(x, p.label.displayWidth / 2, this.screenWidth, LABEL_EDGE_PX));
    });
  }
}
