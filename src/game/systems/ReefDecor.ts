// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { REEF_SHEETS, ReefSpriteKeys } from '@/core/spriteKeys';

/**
 * Math-a-lotl background life (sprint 2.5.4): coral on the sea floor,
 * swaying seaweed, faint background fish drifting across, and tiny
 * bubbles rising. Purely decorative — nothing here is interactive, and
 * everything sits behind the answer bubbles and the axolotl (depth < 10).
 *
 * Layout is in fractions of the canvas so it holds at any design size.
 */

/** Coral + seaweed placement along the floor: x as a fraction of width, display height in px. */
const FLOOR_PIECES: ReadonlyArray<{ key: string; xFrac: number; heightPx: number; sway?: boolean }> = [
  { key: ReefSpriteKeys.Coral2, xFrac: 0.09, heightPx: 120 },
  { key: ReefSpriteKeys.Coral1, xFrac: 0.22, heightPx: 150 },
  { key: 'reef-seaweed', xFrac: 0.36, heightPx: 210, sway: true },
  { key: 'reef-seaweed', xFrac: 0.42, heightPx: 170, sway: true },
  { key: ReefSpriteKeys.Coral3, xFrac: 0.8, heightPx: 92 },
  { key: 'reef-seaweed', xFrac: 0.93, heightPx: 200, sway: true },
];

/** Soft pastel tints for the background fish (the sheet is white). */
const FISH_TINTS = [0xbfe3ff, 0xffd1e8, 0xd9ccff, 0xc9f5e3];
const FISH_COUNT = 3;
const FISH_ALPHA = 0.3;
const FISH_SPEED_PX = { min: 22, max: 46 };
const FISH_HEIGHT_PX = 42;
const MINI_BUBBLE_COUNT = 12;
const MINI_BUBBLE_SPEED_PX = { min: 22, max: 52 };
const MINI_BUBBLE_SIZE_PX = { min: 6, max: 16 };

interface Drifter {
  readonly obj: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  speed: number;
}

export class ReefDecor {
  private readonly objects: Array<Phaser.GameObjects.Image | Phaser.GameObjects.Sprite> = [];
  private readonly fish: Drifter[] = [];
  private readonly minis: Drifter[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bounds: { width: number; waterlineY: number; floorY: number },
  ) {
    this.ensureAnims();
    this.buildFloor();
    this.buildFish();
    this.buildMiniBubbles();
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    const { width, waterlineY, floorY } = this.bounds;
    for (const f of this.fish) {
      f.obj.x += f.speed * dt;
      const margin = f.obj.displayWidth;
      if (f.speed > 0 && f.obj.x > width + margin) this.resetFish(f, -margin);
      if (f.speed < 0 && f.obj.x < -margin) this.resetFish(f, width + margin);
    }
    for (const m of this.minis) {
      m.obj.y -= m.speed * dt;
      if (m.obj.y < waterlineY + 8) {
        m.obj.y = floorY + Phaser.Math.Between(0, 60);
        m.obj.x = Phaser.Math.Between(0, width);
      }
    }
  }

  pause(): void {
    for (const o of this.objects) if (o instanceof Phaser.GameObjects.Sprite) o.anims.pause();
  }

  resume(): void {
    for (const o of this.objects) if (o instanceof Phaser.GameObjects.Sprite) o.anims.resume();
  }

  destroy(): void {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
    this.fish.length = 0;
    this.minis.length = 0;
  }

  private ensureAnims(): void {
    const anims = this.scene.anims;
    const make = (key: 'reef-seaweed' | 'reef-fish', frameRate: number, yoyo: boolean): void => {
      const animKey = `${key}/loop`;
      if (anims.exists(animKey)) return;
      anims.create({
        key: animKey,
        frames: anims.generateFrameNumbers(key, { start: 0, end: REEF_SHEETS[key].frames - 1 }),
        frameRate,
        repeat: -1,
        yoyo,
      });
    };
    make('reef-seaweed', 3, true);
    make('reef-fish', 4, false);
  }

  private buildFloor(): void {
    const { width, floorY } = this.bounds;
    for (const p of FLOOR_PIECES) {
      const obj = p.sway
        ? this.scene.add.sprite(width * p.xFrac, floorY, p.key, 0).play({ key: 'reef-seaweed/loop', startFrame: Phaser.Math.Between(0, 3) })
        : this.scene.add.image(width * p.xFrac, floorY, p.key);
      obj.setOrigin(0.5, 1);
      obj.setScale(p.heightPx / obj.height);
      obj.setDepth(2);
      this.objects.push(obj);
    }
  }

  private buildFish(): void {
    const { width } = this.bounds;
    for (let i = 0; i < FISH_COUNT; i++) {
      const obj = this.scene.add.sprite(Phaser.Math.Between(0, width), 0, 'reef-fish', 0).play('reef-fish/loop');
      obj.setScale(FISH_HEIGHT_PX / REEF_SHEETS['reef-fish'].frameHeight);
      obj.setAlpha(FISH_ALPHA);
      obj.setDepth(1);
      const f: Drifter = { obj, speed: 0 };
      this.resetFish(f, obj.x);
      this.objects.push(obj);
      this.fish.push(f);
    }
  }

  private resetFish(f: Drifter, x: number): void {
    const { waterlineY, floorY } = this.bounds;
    const dir = Math.random() < 0.5 ? -1 : 1;
    f.speed = dir * Phaser.Math.Between(FISH_SPEED_PX.min, FISH_SPEED_PX.max);
    f.obj.x = x;
    f.obj.y = Phaser.Math.Between(waterlineY + 60, floorY - 160);
    f.obj.setFlipX(dir < 0);
    f.obj.setTint(FISH_TINTS[Phaser.Math.Between(0, FISH_TINTS.length - 1)]!);
  }

  private buildMiniBubbles(): void {
    const { width, waterlineY, floorY } = this.bounds;
    for (let i = 0; i < MINI_BUBBLE_COUNT; i++) {
      const obj = this.scene.add.image(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(waterlineY + 20, floorY),
        ReefSpriteKeys.Bubble,
      );
      const size = Phaser.Math.Between(MINI_BUBBLE_SIZE_PX.min, MINI_BUBBLE_SIZE_PX.max);
      obj.setDisplaySize(size, size);
      obj.setAlpha(0.6);
      obj.setDepth(3);
      this.objects.push(obj);
      this.minis.push({ obj, speed: Phaser.Math.Between(MINI_BUBBLE_SPEED_PX.min, MINI_BUBBLE_SPEED_PX.max) });
    }
  }
}
