// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';

/**
 * Sprint 2.14 — a little life behind the puzzles (owner, 2026-10-28, from a
 * focus group: "modern games have more going on to keep attention"):
 *
 *  - the backdrop drifts and zooms very slowly (`driftBackdrop`);
 *  - soft bubbles and small stars float up behind everything;
 *  - now and then a sparkle twinkles somewhere.
 *
 * Plain bubbles and sparkles only, never puzzle shapes or pictures, so
 * nothing in the background can be mistaken for an answer (Symbol Hunt's
 * cards, Pair Pals' pictures). It all sits under the puzzle, runs on the
 * scene's tweens and clock (so it stops with pause), and every number is
 * in `config.puzzles.ambience`.
 */

const A = config.puzzles.ambience;
const BUBBLE_KEY = 'puzzle-ambience-bubble';
const STAR_KEY = 'star_05';

/** A soft bubble texture (white, tinted per bubble), drawn once per game. */
function ensureBubble(scene: Phaser.Scene): void {
  if (scene.textures.exists(BUBBLE_KEY)) return;
  const r = 32;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 0.55).fillCircle(r, r, r);
  g.lineStyle(3, 0xffffff, 0.9).strokeCircle(r, r, r - 2);
  g.fillStyle(0xffffff, 0.95).fillCircle(r * 0.62, r * 0.6, r * 0.2);
  g.generateTexture(BUBBLE_KEY, r * 2, r * 2);
  g.destroy();
}

const between = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

/**
 * A slow drift and zoom on a full-screen backdrop image, back and forth for
 * as long as the scene runs. The image is re-anchored at its centre and
 * kept zoomed in enough that its edges never show.
 */
export function driftBackdrop(scene: Phaser.Scene, image: Phaser.GameObjects.Image): void {
  const { width, height } = scene.scale;
  const D = A.drift;
  image
    .setOrigin(0.5)
    .setPosition(width / 2, height / 2)
    .setScale(D.scaleFrom);
  scene.tweens.add({
    targets: image,
    scale: D.scaleTo,
    x: width / 2 + D.panPx,
    y: height / 2 - D.panPx / 2,
    duration: D.ms,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.InOut',
    delay: Math.random() * 2000,
  });
}

/** Floating bubbles and stars, and the odd twinkle, at `depth` (under the puzzle). */
export class PuzzleAmbience {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {
    ensureBubble(scene);
    for (let i = 0; i < A.floaters; i++) this.float(true);
    scene.time.addEvent({ delay: A.twinkleEveryMs, loop: true, callback: () => this.twinkle() });
  }

  /** One floater rising from the bottom (or, at the start, from anywhere), then again. */
  private float(anywhere: boolean): void {
    const { width, height } = this.scene.scale;
    const star = Math.random() < A.starShare;
    const size = between(A.sizePx[0], A.sizePx[1]) * (star ? 0.8 : 1);
    const tint = A.tints[Math.floor(Math.random() * A.tints.length)];
    const img = this.scene.add
      .image(between(0, width), anywhere ? between(0, height) : height + size, star ? STAR_KEY : BUBBLE_KEY)
      .setDisplaySize(size, size)
      .setTint(tint)
      .setAlpha(between(A.alpha[0], A.alpha[1]))
      .setDepth(this.depth);
    const top = -size;
    // The same speed from wherever it starts.
    const secs = between(A.riseSecs[0], A.riseSecs[1]);
    const ms = (secs * 1000 * (img.y - top)) / (height + 2 * size);
    const sway = this.scene.tweens.add({
      targets: img,
      x: img.x + between(-A.swayPx, A.swayPx),
      duration: between(2200, 4200),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    if (star) this.scene.tweens.add({ targets: img, angle: 360, duration: secs * 1000, repeat: -1 });
    this.scene.tweens.add({
      targets: img,
      y: top,
      duration: ms,
      onComplete: () => {
        sway.stop();
        this.scene.tweens.killTweensOf(img);
        img.destroy();
        this.float(false);
      },
    });
  }

  /** A sparkle that grows, turns and fades somewhere on screen. */
  private twinkle(): void {
    const { width, height } = this.scene.scale;
    const tint = A.tints[Math.floor(Math.random() * A.tints.length)];
    const img = this.scene.add
      .image(between(40, width - 40), between(90, height - 40), STAR_KEY)
      .setTint(tint)
      .setScale(0)
      .setDepth(this.depth);
    this.scene.tweens.add({
      targets: img,
      scale: between(0.25, 0.42),
      angle: 90,
      duration: 420,
      yoyo: true,
      ease: 'Sine.Out',
      onComplete: () => img.destroy(),
    });
  }
}
