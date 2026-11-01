// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { THEME_FLYERS_SHEET, type FlyerMotion, type PuzzleThemeArt } from '@/core/spriteKeys';

const F = config.puzzles.flyers;
const between = ([lo, hi]: readonly [number, number] | readonly number[]): number => lo + Math.random() * (hi - lo);

/**
 * Sprint 2.16 — a little life behind a Words or Numbers puzzle (owner:
 * "anything we can do to make these games more animated in the
 * background"): now and then one of the look's flyers drifts across the
 * backdrop: butterflies and birds flutter, balloons rise, leaves twirl down;
 * UFOs and satellites glide with a bob, comets and rockets streak past.
 * Behind the puzzle (`depth`), never more than `maxAtOnce`; scene time and
 * tweens drive it, so pausing the round pauses it.
 */
export class ThemeFlyers {
  private live = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: PuzzleThemeArt,
    private readonly depth: number,
  ) {
    // The first one comes soon, so the backdrop isn't still for long.
    this.schedule(between(F.everyMs) / 2);
  }

  private schedule(ms: number): void {
    this.scene.time.delayedCall(ms, () => {
      if (this.live < F.maxAtOnce) this.launch();
      this.schedule(between(F.everyMs));
    });
  }

  private launch(): void {
    const { width, height } = this.scene.scale;
    const pick = this.art.flyers[Math.floor(Math.random() * this.art.flyers.length)];
    const size = between(F.sizePx);
    // The holder crosses the screen; the picture inside it wiggles (two tweens never fight over one x or y).
    const img = this.scene.add
      .image(0, 0, THEME_FLYERS_SHEET.key, pick.frame)
      .setDisplaySize(size, size)
      .setAlpha(F.alpha);
    const holder = this.scene.add.container(0, 0, [img]).setDepth(this.depth);
    const fromLeft = Math.random() < 0.5;
    const ms = between(F.crossMs[pick.motion]);
    const path = this.path(pick.motion, fromLeft, width, height);
    holder.setPosition(path.x0, path.y0);
    img.setFlipX(!fromLeft && pick.motion !== 'rise' && pick.motion !== 'fall');
    if (pick.motion === 'streak') holder.setAngle(fromLeft ? -20 : 20);
    this.live++;
    const done = (): void => {
      this.live--;
      this.scene.tweens.killTweensOf(img);
      holder.destroy();
    };
    this.scene.tweens.add({ targets: holder, x: path.x1, y: path.y1, duration: ms, ease: 'Linear', onComplete: done });
    this.wiggle(img, pick.motion);
  }

  /** Where it starts and ends: across for most, up for a balloon, down for a leaf. */
  private path(
    motion: FlyerMotion,
    fromLeft: boolean,
    width: number,
    height: number,
  ): { x0: number; y0: number; x1: number; y1: number } {
    const off = 80;
    if (motion === 'rise') {
      const x = between([80, width - 80]);
      return { x0: x, y0: height + off, x1: x + between([-120, 120]), y1: -off };
    }
    if (motion === 'fall') {
      const x = between([80, width - 80]);
      return { x0: x, y0: -off, x1: x + between([-160, 160]), y1: height + off };
    }
    const y = motion === 'streak' ? between([100, 260]) : between([170, 560]);
    const drop = motion === 'streak' ? between([120, 260]) : between([-60, 60]);
    return fromLeft
      ? { x0: -off, y0: y, x1: width + off, y1: y + drop }
      : { x0: width + off, y0: y, x1: -off, y1: y + drop };
  }

  /** The little extra movement on top of the crossing. */
  private wiggle(img: Phaser.GameObjects.Image, motion: FlyerMotion): void {
    const t = this.scene.tweens;
    switch (motion) {
      case 'flutter':
        // Wings: a quick squash; and a bob up and down.
        t.add({ targets: img, scaleY: img.scaleY * 0.7, duration: 140, yoyo: true, repeat: -1 });
        t.add({ targets: img, y: '+=26', duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        break;
      case 'rise':
        t.add({ targets: img, angle: { from: -8, to: 8 }, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        break;
      case 'fall':
        t.add({ targets: img, angle: 360, duration: 3200, repeat: -1 });
        t.add({ targets: img, x: '+=60', duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        break;
      case 'glide':
        t.add({ targets: img, y: '+=18', duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        break;
      case 'streak':
        t.add({ targets: img, alpha: { from: F.alpha, to: 0.4 }, duration: 260, yoyo: true, repeat: -1 });
        break;
    }
  }
}
