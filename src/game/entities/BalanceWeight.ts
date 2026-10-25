// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { BALANCE_SHEETS } from '@/core/spriteKeys';
import { MathText } from '@/game/ui/MathText';
import { textStyle } from '@/game/ui/typography';

const INK = 0x3a2420;
const PLATE = 0xfffaf0;

/**
 * Sprint 2.12 — one Balance Scale weight (a pastel kettlebell with a big
 * label on a white plate), or the empty "?" slot where the answer goes.
 * The container's origin is the weight's bottom centre, so it sits on a
 * pan's rim or the tray's line. Labels use `MathText` (mixed numbers read
 * clearly); a long one shrinks to fit the plate rather than overflow.
 */
export class BalanceWeight extends Phaser.GameObjects.Container {
  private shell?: Phaser.GameObjects.Image;
  /** The weight colour (0–4) it shows. */
  colour = 0;
  private plate?: Phaser.GameObjects.Graphics;
  private label?: MathText;
  private mark?: Phaser.GameObjects.Text;
  private bob?: Phaser.Tweens.Tween;
  /** Its value (for the scene's checks) and how it's shown. */
  value = 0;
  display = '';

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this);
  }

  /** A weight: colour 0–4 and its label. */
  setWeight(colour: number, value: number, display: string): this {
    this.clear();
    const s = BALANCE_SHEETS.weights;
    this.value = value;
    this.display = display;
    this.colour = colour;
    this.shell = this.scene.add.image(0, 0, s.key, colour % s.colours).setOrigin(0.5, s.bottomY / s.frameHeight);
    const plateY = s.bodyY - s.bottomY;
    const L = config.balanceScale.label;
    this.label = new MathText(this.scene, 0, plateY, display, textStyle('weightLabel'));
    const maxW = s.frameWidth - 6;
    const fit = Math.min(1, (maxW - L.platePadPx) / Math.max(1, this.label.width));
    this.label.setScale(fit);
    const w = Math.max(L.plateMinW, Math.min(maxW, this.label.width * fit + L.platePadPx));
    this.plate = this.scene.add.graphics();
    this.plate.fillStyle(PLATE, 1);
    this.plate.fillRoundedRect(-w / 2, plateY - L.plateH / 2, w, L.plateH, L.plateRadius);
    this.plate.lineStyle(3, INK, 1);
    this.plate.strokeRoundedRect(-w / 2, plateY - L.plateH / 2, w, L.plateH, L.plateRadius);
    this.add([this.shell, this.plate, this.label]);
    return this;
  }

  /** The empty slot with a bold "?" that bobs gently while it waits. */
  setSlot(): this {
    this.clear();
    const s = BALANCE_SHEETS.weights;
    this.shell = this.scene.add.image(0, 0, BALANCE_SHEETS.slot.key).setOrigin(0.5, s.bottomY / s.frameHeight);
    this.mark = this.scene.add.text(0, s.bodyY - s.bottomY, '?', textStyle('slotMark')).setOrigin(0.5);
    this.add([this.shell, this.mark]);
    this.bob = this.scene.tweens.add({
      targets: this.mark,
      y: this.mark.y - 6,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    return this;
  }

  isSlot(): boolean {
    return this.mark !== undefined;
  }

  private clear(): void {
    this.bob?.remove();
    this.bob = undefined;
    this.removeAll(true);
    this.shell = undefined;
    this.plate = undefined;
    this.label = undefined;
    this.mark = undefined;
  }

  override destroy(fromScene?: boolean): void {
    this.bob?.remove();
    super.destroy(fromScene);
  }
}
