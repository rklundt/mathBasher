// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { GARDEN_SHEETS } from '@/core/spriteKeys';
import { textStyle } from '@/game/ui/typography';
import { MathText } from '@/game/ui/MathText';
import { CALLOUT_INK_CSS } from '@/game/ui/uiPalette';
import { carrotTopY, visibleFrameRows } from '@/game/systems/bunnyGardenMath';

/**
 * One hole in Bunny Garden's patch (sprint 2.8), kept for the whole round:
 * the hole (its dark opening behind, its dirt lip in front), the answer
 * sign on its garden stake (fixed: it never moves while the carrot sinks),
 * and the carrot or the mole that comes up out of it. Carrot and mole are
 * cropped at the lip, so they really sink into the ground. Each row only
 * changes the answer, the carrot kind and the depth.
 */
export class GardenPlot {
  readonly x: number;
  answer = 0;
  private readonly cfg = config.bunnyGarden;
  private readonly back: Phaser.GameObjects.Image;
  private readonly lip: Phaser.GameObjects.Image;
  private readonly carrot: Phaser.GameObjects.Sprite;
  private readonly mole: Phaser.GameObjects.Sprite;
  private readonly sign: Phaser.GameObjects.Container;
  private readonly pill: Phaser.GameObjects.Graphics;
  private readonly label: MathText;
  private readonly carrotScale: number;
  private readonly moleScale: number;
  private kind = 0;
  /** 0 = fully up, 1 = hidden. */
  private depth = 1;
  private moleDepth = 1;
  private shiverX = 0;
  /** The carrot left the ground (pulled): no crop, no depth, until the next row. */
  private pulled = false;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    private readonly laneWidth: number,
  ) {
    this.x = x;
    const { holeY, hole } = this.cfg;
    this.back = scene.add.image(x, holeY, GARDEN_SHEETS.hole.key, 0).setScale(hole.scale).setDepth(3);
    this.lip = scene.add.image(x, holeY, GARDEN_SHEETS.hole.key, 1).setScale(hole.scale).setDepth(6);
    this.carrotScale = this.cfg.carrot.displayPx / GARDEN_SHEETS.carrots.frame;
    this.moleScale = this.cfg.mole.displayPx / GARDEN_SHEETS.mole.frame;
    this.carrot = scene.add
      .sprite(x, 0, GARDEN_SHEETS.carrots.key, 0)
      .setOrigin(0.5, 0)
      .setScale(this.carrotScale)
      .setDepth(4);
    this.mole = scene.add
      .sprite(x, 0, GARDEN_SHEETS.mole.key, 0)
      .setOrigin(0.5, 0)
      .setScale(this.moleScale)
      .setDepth(4)
      .setVisible(false);

    // The sign: a stake from the pill down behind the hole, the pill, the answer.
    const s = this.cfg.sign;
    const stake = scene.add.graphics();
    const stakeTop = 0;
    const stakeBottom = holeY - s.y;
    stake.fillStyle(s.stakeColor, 1).fillRoundedRect(-s.stakeWidthPx / 2, stakeTop, s.stakeWidthPx, stakeBottom, 4);
    stake.lineStyle(3, s.stakeInk, 1).strokeRoundedRect(-s.stakeWidthPx / 2, stakeTop, s.stakeWidthPx, stakeBottom, 4);
    this.pill = scene.add.graphics();
    this.label = new MathText(scene, 0, 0, '', textStyle('alienAnswer'));
    this.label.setStroke(CALLOUT_INK_CSS, s.labelStrokePx);
    this.sign = scene.add.container(x, s.y, [stake, this.pill, this.label]).setDepth(2).setVisible(false);
    this.applyDepth();
  }

  /** A new row: this hole's answer, carrot kind, and the carrot fully hidden (ready to pop up). */
  setAnswer(answer: number, display: string, kind: number): void {
    this.answer = answer;
    this.kind = kind;
    this.pulled = false;
    this.scene.tweens.killTweensOf(this.carrot);
    this.carrot
      .setFrame(kind * GARDEN_SHEETS.carrots.frames)
      .setAngle(0)
      .setAlpha(1)
      .setScale(this.carrotScale)
      .setVisible(true);
    this.carrot.setPosition(this.x, 0);
    this.hideMole();
    this.drawSign(display);
    this.depth = 1;
    this.applyDepth();
  }

  private drawSign(display: string): void {
    const s = this.cfg.sign;
    this.label.setText(display);
    const maxW = this.laneWidth - s.laneMarginPx;
    const fit = Math.min(s.textScale, (maxW - s.padPx * 2) / Math.max(1, this.label.width));
    this.label.setScale(fit);
    const w = this.label.width * fit + s.padPx * 2;
    const h = this.label.height * fit + s.heightPadPx;
    this.pill.clear();
    this.pill.fillStyle(s.fill, s.fillAlpha).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    this.pill.lineStyle(s.rimPx, s.rim, s.rimAlpha).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    this.sign.setVisible(true);
  }

  /** The countdown's picture: how deep the carrot is (0 up … 1 hidden). */
  setDepth(depth: number): void {
    if (this.pulled) return;
    this.depth = depth;
    this.applyDepth();
  }

  /** The "hurry" shiver (x offset in px; 0 stops it). */
  setShiver(px: number): void {
    if (this.pulled) return;
    this.shiverX = px;
    this.carrot.setX(this.x + px);
  }

  private applyDepth(): void {
    const c = this.cfg.carrot;
    const top = carrotTopY(this.depth, this.cfg.cropLineY, c.upVisiblePx, c.sunkVisiblePx);
    this.carrot.setPosition(this.x + this.shiverX, top);
    const rows = visibleFrameRows(top, this.cfg.cropLineY, this.carrotScale, GARDEN_SHEETS.carrots.frame);
    this.carrot.setCrop(0, 0, GARDEN_SHEETS.carrots.frame, rows);
  }

  /** A new row's carrot pops up out of the hole. */
  popUp(): void {
    const proxy = { d: 1 };
    this.scene.tweens.add({
      targets: proxy,
      d: 0,
      duration: this.cfg.carrot.popUpMs,
      ease: 'Back.Out',
      onUpdate: () => this.setDepth(Math.max(0, proxy.d)),
    });
  }

  /** Wrong pick or the row ending: the carrot ducks back in. */
  duck(onDone?: () => void): void {
    const proxy = { d: this.depth };
    this.scene.tweens.add({
      targets: proxy,
      d: 1,
      duration: this.cfg.carrot.duckMs,
      ease: 'Quad.In',
      onUpdate: () => this.setDepth(proxy.d),
      onComplete: () => onDone?.(),
    });
  }

  /** The right carrot: out of the ground (delighted), then an arc into the basket. */
  pullOut(toX: number, toY: number, onLanded: () => void): void {
    const c = this.cfg.carrot;
    this.pulled = true;
    this.carrot.setCrop();
    this.carrot.setFrame(this.kind * GARDEN_SHEETS.carrots.frames + 1);
    const startY = this.carrot.y;
    this.scene.tweens.add({
      targets: this.carrot,
      y: startY - c.pullRisePx,
      duration: c.pullRiseMs,
      ease: 'Quad.Out',
      onComplete: () => {
        const fromX = this.carrot.x;
        const fromY = this.carrot.y;
        const arc = { t: 0 };
        this.scene.tweens.add({
          targets: arc,
          t: 1,
          duration: c.tossMs,
          ease: 'Sine.In',
          onUpdate: () => {
            this.carrot.setX(fromX + (toX - fromX) * arc.t);
            this.carrot.setY(fromY + (toY - fromY) * arc.t - Math.sin(Math.PI * arc.t) * c.tossArcPx);
            this.carrot.setScale(this.carrotScale * (1 - 0.65 * arc.t));
            this.carrot.setAngle(-200 * arc.t);
          },
          onComplete: () => {
            this.carrot.setVisible(false);
            onLanded();
          },
        });
      },
    });
  }

  /** A wrong hole: the carrot ducks, the friendly mole peeks up and waves, then ducks. */
  showMole(onDone: () => void): void {
    const m = this.cfg.mole;
    this.duck();
    this.mole.setFrame(0).setVisible(true);
    this.moleDepth = 1;
    this.applyMole();
    const proxy = { d: 1 };
    this.scene.tweens.add({
      targets: proxy,
      d: m.peekDepth,
      duration: m.riseMs,
      ease: 'Back.Out',
      onUpdate: () => {
        this.moleDepth = proxy.d;
        this.applyMole();
      },
    });
    this.scene.time.delayedCall(m.riseMs + m.waveAfterMs, () => this.mole.setFrame(1));
    this.scene.time.delayedCall(m.riseMs + m.stayMs, () => {
      const down = { d: this.moleDepth };
      this.scene.tweens.add({
        targets: down,
        d: 1,
        duration: m.riseMs,
        ease: 'Quad.In',
        onUpdate: () => {
          this.moleDepth = down.d;
          this.applyMole();
        },
        onComplete: () => {
          this.hideMole();
          onDone();
        },
      });
    });
  }

  private applyMole(): void {
    const c = this.cfg.carrot;
    const top = carrotTopY(this.moleDepth, this.cfg.cropLineY, c.upVisiblePx, 0);
    this.mole.setPosition(this.x, top);
    this.mole.setCrop(
      0,
      0,
      GARDEN_SHEETS.mole.frame,
      visibleFrameRows(top, this.cfg.cropLineY, this.moleScale, GARDEN_SHEETS.mole.frame),
    );
  }

  private hideMole(): void {
    this.mole.setVisible(false);
    this.moleDepth = 1;
  }

  /** Between rows: no sign, nothing in the hole. */
  clearRow(): void {
    this.sign.setVisible(false);
  }

  /** The carrot kind (sheet row) this row's carrot uses. */
  get kindIndex(): number {
    return this.kind;
  }

  /** The sign's position (where "Oops!" notes float up from). */
  get signY(): number {
    return this.cfg.sign.y;
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.carrot);
    this.scene.tweens.killTweensOf(this.mole);
    this.back.destroy();
    this.lip.destroy();
    this.carrot.destroy();
    this.mole.destroy();
    this.sign.destroy();
  }
}
