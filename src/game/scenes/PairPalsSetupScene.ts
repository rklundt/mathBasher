// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config, type PairPalsSize, type PairPalsTheme } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { PAIR_PALS_PICTURE_KEYS } from '@/core/spriteKeys';
import { Settings } from '@/services/Settings';
import { getPairPalsProgress } from '@/services/PairPalsProgress';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { text, textStyle } from '@/game/ui/typography';
import { applyTextOutline } from '@/game/ui/callouts';
import { setupScene } from '@/game/scenes/sceneSetup';
import { createMuteIconButton } from '@/game/ui/MuteIconButton';
import { loadGameBundle } from '@/game/services/assetLoader';
import type { ChallengePickerInit } from '@/game/services/challengeSelection';

/** "6 pairs · 4 × 3" under a size's name. */
export function sizeSubtitle(size: PairPalsSize): string {
  const { cols, rows } = config.pairPals.sizes[size];
  return `${String((cols * rows) / 2)} pairs · ${String(cols)} × ${String(rows)}`;
}

/** The best line for a size: fewer is better, said so a kid gets it. */
export function bestLine(best: number | null): string {
  return best === null
    ? 'Find all the pairs in as few turns as you can!'
    : `Your best: ${String(best)} turns · Can you do it in fewer?`;
}

/**
 * Sprint 2.13 — Pair Pals' setup: the card theme (five tiles, each with a
 * sample picture) and the board size (Easy 4 × 3, Medium 5 × 4, Hard 6 × 5),
 * the best for that size, Back and Start. The picks are remembered in this
 * browser (`PairPalsProgress`).
 *
 * Reached through Loading (from the picker's Puzzles tab, Menu Start, the
 * win panel and the pause card's Change Cards or Difficulty), so the pictures are in
 * memory. Start goes straight to the board; Back to the picker on Puzzles.
 */
export class PairPalsSetupScene extends Phaser.Scene {
  static readonly key = SceneKeys.PairPalsSetup;

  private theme: PairPalsTheme = config.pairPals.defaults.theme;
  private size: PairPalsSize = config.pairPals.defaults.size;
  private themeButtons = new Map<PairPalsTheme, PlaceholderButton>();
  private sizeButtons = new Map<PairPalsSize, PlaceholderButton>();
  private bestText!: Phaser.GameObjects.Text;

  constructor() {
    super(PairPalsSetupScene.key);
  }

  preload(): void {
    // A safety net for a direct entry; Loading has normally cached everything.
    loadGameBundle(this, 'pair-pals');
  }

  create(): void {
    setupScene(this);
    Settings.setGameId('pair-pals');
    this.themeButtons.clear();
    this.sizeButtons.clear();
    const progress = getPairPalsProgress();
    this.theme = progress.theme;
    this.size = progress.size;

    const { width } = this.scale;
    const cx = width / 2;
    const S = config.pairPals.setup;

    text(this, cx, S.headingY, 'Pair Pals: pick your cards', 'h2').setOrigin(0.5);
    createMuteIconButton(this, width - 16 - 22, 16 + 18);

    // Themes: a sample picture and the name on each tile.
    text(this, cx, S.themeLabelY, 'Cards', 'sectionLabel').setOrigin(0.5);
    const themes = config.pairPals.themes;
    const { w, h, gap } = S.themeTile;
    const themeX0 = cx - ((themes.length - 1) * (w + gap)) / 2;
    themes.forEach((theme, i) => {
      const x = themeX0 + i * (w + gap);
      const button = new PlaceholderButton({
        scene: this,
        x,
        y: S.themeY,
        width: w,
        height: h,
        label: '',
        onClick: () => this.pickTheme(theme),
      });
      const sample = this.add.image(0, -14, PAIR_PALS_PICTURE_KEYS[theme], S.samples[theme]);
      sample.setDisplaySize(S.samplePx, S.samplePx);
      const name = this.add.text(0, h / 2 - 24, config.pairPals.themeLabels[theme], textStyle('buttonLabel'));
      name.setOrigin(0.5);
      button.add([sample, name]);
      this.themeButtons.set(theme, button);
    });

    // Difficulty (the board size): the level first, then pairs and grid.
    text(this, cx, S.sizeLabelY, 'Difficulty', 'sectionLabel').setOrigin(0.5);
    const sizes = Object.keys(config.pairPals.sizes) as PairPalsSize[];
    const T = S.sizeTile;
    const sizeX0 = cx - ((sizes.length - 1) * (T.w + T.gap)) / 2;
    sizes.forEach((size, i) => {
      const button = new PlaceholderButton({
        scene: this,
        x: sizeX0 + i * (T.w + T.gap),
        y: S.sizeY,
        width: T.w,
        height: T.h,
        label: config.pairPals.sizes[size].label,
        subtitle: sizeSubtitle(size),
        onClick: () => this.pickSize(size),
      });
      this.sizeButtons.set(size, button);
    });

    this.bestText = text(this, cx, S.bestY, '', 'bodyAccent').setOrigin(0.5);
    applyTextOutline(this.bestText);

    const back = new PlaceholderButton({
      scene: this,
      x: cx - S.startW / 2 - 20,
      y: S.buttonsY,
      width: S.backW,
      height: S.buttonH,
      label: 'Back',
      onClick: () => this.goBack(),
    });
    const start = new PlaceholderButton({
      scene: this,
      x: cx + S.backW / 2 + 20,
      y: S.buttonsY,
      width: S.startW,
      height: S.buttonH,
      label: 'Start',
      onClick: () => this.start(),
    });

    // Tab order: the themes, the sizes, Back, Start; focus lands on Start.
    const order = [...this.themeButtons.values(), ...this.sizeButtons.values(), back, start];
    new KeyboardNavigator(this, order, { initialIndex: order.indexOf(start) });
    wireEscBack(this, () => this.goBack());

    this.refresh();
  }

  private pickTheme(theme: PairPalsTheme): void {
    this.theme = theme;
    this.refresh();
  }

  private pickSize(size: PairPalsSize): void {
    this.size = size;
    this.refresh();
  }

  private refresh(): void {
    for (const [theme, b] of this.themeButtons) b.setSelected(theme === this.theme);
    for (const [size, b] of this.sizeButtons) b.setSelected(size === this.size);
    this.bestText.setText(bestLine(getPairPalsProgress().best(this.size)));
  }

  private start(): void {
    getPairPalsProgress().choose(this.theme, this.size);
    this.scene.start(SceneKeys.PairPals);
  }

  /** Back to the picker, on the Puzzles tab. */
  private goBack(): void {
    const init: ChallengePickerInit = {
      next: SceneKeys.GameSelect,
      back: SceneKeys.Menu,
      source: 'menu',
      subject: 'puzzles',
    };
    this.scene.start(SceneKeys.ChallengePicker, init);
  }
}
