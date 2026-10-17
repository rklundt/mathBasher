// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { splitMixedNumbers } from '@/math/mixedNumberText';

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;
type Shadow = [x: number, y: number, color: string, blur: number, stroke: boolean, fill: boolean];

/**
 * Sprint 2.7 — answer labels and question prompts. A mixed number's whole
 * part is drawn a little bigger, with a gap before its fraction, so
 * "1 1/2" can't be misread as "11/2". Anything else draws exactly like one
 * plain text.
 *
 * A container of text runs, always centred on its x / y (in place of
 * `setOrigin(0.5)`). `width` / `height` are the unscaled size, like a Text's.
 */
export class MathText extends Phaser.GameObjects.Container {
  private value = '';
  private stroke: { color: string; px: number } | null = null;
  private shadow: Shadow | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    value: string,
    private readonly style: TextStyle,
  ) {
    super(scene, x, y);
    scene.add.existing(this);
    this.setText(value);
  }

  get text(): string {
    return this.value;
  }

  setText(value: string): this {
    if (value === this.value && this.list.length > 0) return this;
    this.value = value;
    this.removeAll(true);
    const { wholeScale } = config.layout.mixedNumber;
    for (const seg of splitMixedNumbers(value)) {
      const run = new Phaser.GameObjects.Text(this.scene, 0, 0, seg.text, this.style).setOrigin(0, 0.5);
      if (seg.whole) run.setScale(wholeScale).setData('whole', true);
      this.add(run);
    }
    return this.restyle();
  }

  setStroke(color: string, px: number): this {
    this.stroke = { color, px };
    return this.restyle();
  }

  setShadow(...shadow: Shadow): this {
    this.shadow = shadow;
    return this.restyle();
  }

  /** Apply the outline to every run, then lay the runs out left to right, centred. */
  private restyle(): this {
    const runs = this.list as Phaser.GameObjects.Text[];
    for (const run of runs) {
      if (this.stroke) run.setStroke(this.stroke.color, this.stroke.px);
      if (this.shadow) run.setShadow(...this.shadow);
    }
    const gap = parseFloat(String(this.style.fontSize)) * config.layout.mixedNumber.gapEm;
    let x = 0;
    let height = 0;
    runs.forEach((run, i) => {
      run.setX(x);
      x += run.displayWidth + (run.getData('whole') === true && i < runs.length - 1 ? gap : 0);
      height = Math.max(height, run.displayHeight);
    });
    for (const run of runs) run.setX(run.x - x / 2);
    this.setSize(x, height);
    return this;
  }
}
