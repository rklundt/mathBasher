// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { ALIEN_SHIP_SHEET, ParticleSpriteKeys } from '@/core/spriteKeys';
import { textStyle } from '@/game/ui/typography';
import { shipLabelLayout, type ShipBody } from '@/game/systems/spaceShooterMath';

/** arriving = warping in (flies, can't be shot yet) · flying · leaving = hit / warping out. */
export type ShipState = 'arriving' | 'flying' | 'leaving';

/**
 * One alien ship in Space Shooter (sprint 2.6): a frame of the code-drawn
 * ship sheet with the answer printed in its dark porthole. Wide answers
 * (mixed numbers) shrink a little and sit on a dark "display" pill so they
 * stay readable over any hull colour.
 *
 * The scene owns the flight (`body`, stepped by `stepShips`); this class
 * draws the ship there and plays its effects. Everything is tweens, so the
 * scene's tween pause freezes it.
 */
export class AlienShip {
  readonly container: Phaser.GameObjects.Container;
  readonly body: ShipBody;
  state: ShipState = 'arriving';
  private readonly sprite: Phaser.GameObjects.Image;
  /** Sprite + answer together, so they bob and shake as one. */
  private readonly hull: Phaser.GameObjects.Container;
  private readonly cfg = config.spaceShooter;
  private readonly scale: number;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    frame: number,
    heading: number,
    readonly answer: number,
    display: string,
  ) {
    const { displayPx, radiusFrac } = this.cfg.ship;
    this.scale = displayPx / ALIEN_SHIP_SHEET.frame;
    this.body = { x, y, heading, turn: 0, r: displayPx * radiusFrac };

    this.sprite = scene.add.image(0, 0, ALIEN_SHIP_SHEET.key, frame).setScale(this.scale);
    const portholeY = (ALIEN_SHIP_SHEET.porthole.y - ALIEN_SHIP_SHEET.frame / 2) * this.scale;
    const label = scene.add.text(0, portholeY, display, textStyle('alienAnswer')).setOrigin(0.5);
    // Same dark outline as every other game's answer labels.
    label.setStroke('#0b1020', 7);
    const layout = shipLabelLayout({
      textWidth: label.width,
      textHeight: label.height,
      portholeDiameter: ALIEN_SHIP_SHEET.porthole.r * 2 * this.scale,
      maxWidth: this.cfg.label.maxWidthPx,
      pillPad: this.cfg.label.pillPadPx,
      pillHeightPad: this.cfg.label.pillHeightPadPx,
    });
    label.setScale(layout.scale);
    const parts: Phaser.GameObjects.GameObject[] = [this.sprite];
    if (layout.pill) {
      // Porthole-coloured "display" with a thin light rim, behind the number.
      const { width, height } = layout.pill;
      const pill = scene.add.graphics();
      pill.fillStyle(0x121a35, 0.94).fillRoundedRect(-width / 2, portholeY - height / 2, width, height, height / 2);
      pill.lineStyle(3, 0xcfe6ff, 0.75).strokeRoundedRect(-width / 2, portholeY - height / 2, width, height, height / 2);
      parts.push(pill);
    }
    parts.push(label);
    this.hull = scene.add.container(0, 0, parts);
    this.container = scene.add.container(x, y, [this.hull]).setDepth(5);

    // A gentle bob (answer and all), so a ship never looks parked.
    scene.tweens.add({
      targets: this.hull,
      y: this.cfg.ship.bobPx,
      duration: this.cfg.ship.bobMs * (0.85 + Math.random() * 0.3),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  /** Draw the ship where its body is, leaning into the turn. */
  sync(leanDeg: number): void {
    this.container.setPosition(this.body.x, this.body.y);
    this.container.setAngle(leanDeg);
  }

  /** Pop in from nothing with a bright ring (a new wave arriving). */
  warpIn(): void {
    this.container.setScale(0).setAlpha(0);
    this.scene.tweens.add({
      targets: this.container,
      scale: 1,
      alpha: 1,
      duration: this.cfg.ship.warpInMs,
      ease: 'Back.Out',
      onComplete: () => {
        if (this.state === 'arriving') this.state = 'flying';
      },
    });
    this.ring(0x9fe8ff, 0.2, 1.3, this.cfg.ship.warpInMs + 120);
  }

  /** Shrink away into a point of light, then remove itself. */
  warpOut(onDone?: () => void): void {
    this.state = 'leaving';
    this.scene.tweens.killTweensOf(this.container);
    this.scene.tweens.add({
      targets: this.container,
      scale: 0,
      alpha: 0,
      angle: this.container.angle + 90,
      duration: this.cfg.ship.warpOutMs,
      ease: 'Back.In',
      onComplete: () => {
        this.destroy();
        onDone?.();
      },
    });
  }

  /** Right answer: a fiery burst and a flash, then the ship is gone. */
  explode(): void {
    this.state = 'leaving';
    const { x, y } = this.body;
    const fire = this.scene.add.particles(x, y, ParticleSpriteKeys.Flame03, {
      speed: { min: 80, max: 260 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 520,
      tint: [0xffffff, 0xffd23f, 0xff8a2e, 0xff4b4b],
      blendMode: 'ADD',
      emitting: false,
    });
    const sparks = this.scene.add.particles(x, y, ParticleSpriteKeys.Spark05, {
      speed: { min: 160, max: 380 },
      scale: { start: 0.3, end: 0 },
      lifespan: 450,
      tint: [0xffffff, 0x9fe8ff],
      blendMode: 'ADD',
      emitting: false,
    });
    fire.setDepth(7).explode(22);
    sparks.setDepth(7).explode(16);
    this.ring(0xffffff, 0.3, 1.6, 300);
    this.scene.time.delayedCall(650, () => {
      fire.destroy();
      sparks.destroy();
    });
    this.destroy();
  }

  /** Wrong answer: the lasers splash off a shield and the ship shakes. */
  shieldBlock(): void {
    this.ring(0x5ad1ff, 0.9, 1.25, this.cfg.ship.shieldMs, 6);
    this.sprite.setTint(0x9fe8ff);
    // Shake the hull (the outer container is placed every frame by the flight).
    this.scene.tweens.add({
      targets: this.hull,
      x: 8,
      duration: 50,
      yoyo: true,
      repeat: 3,
      onComplete: () => this.sprite.clearTint(),
    });
  }

  /** Expanding ring around the ship (warp / shield / blast flash). */
  private ring(color: number, fromScale: number, toScale: number, ms: number, width = 4): void {
    const r = this.cfg.ship.displayPx * 0.55;
    const ring = this.scene.add.circle(this.body.x, this.body.y, r).setStrokeStyle(width, color, 1).setDepth(6);
    ring.setScale(fromScale);
    this.scene.tweens.add({
      targets: ring,
      scale: toScale,
      alpha: 0,
      duration: ms,
      ease: 'Quad.Out',
      onComplete: () => ring.destroy(),
    });
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.container);
    this.scene.tweens.killTweensOf(this.hull);
    this.container.destroy();
  }
}
