// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config, type PairPalsSize, type PairPalsTheme } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { PAIR_PALS_PICTURE_KEYS } from '@/core/spriteKeys';
import { Settings } from '@/services/Settings';
import { getPairPalsProgress } from '@/services/PairPalsProgress';
import { getRememberedPicks } from '@/services/RememberedPicks';
import { pairPalsMaxPoints } from '@/services/puzzlePoints';
import { formatPoints } from '@/services/challengePoints';
import type { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { createChoiceTile } from '@/game/ui/choiceTile';
import { createSetupFrame, sectionHeading, type SetupFrame } from '@/game/ui/setupFrame';
import { text } from '@/game/ui/typography';
import { setupScene } from '@/game/scenes/sceneSetup';
import { loadGameBundle } from '@/game/services/assetLoader';

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
 * the best for that size, and Start. The picks are remembered in this
 * browser (`PairPalsProgress`).
 *
 * Sprint 2.15 — restyled to the chooser's look: the top bar, the trail
 * (Puzzles › Pair Pals), "Which cards?" and "How tough?" with "Up to N
 * points!" under each size, the best line and a big Start. Reached through
 * Loading (so the pictures are in memory) from the chooser, and from the
 * pause card and the win panel's Change Cards or Difficulty. Start goes
 * straight to the board; Back to the puzzles.
 */
export class PairPalsSetupScene extends Phaser.Scene {
  static readonly key = SceneKeys.PairPalsSetup;

  private theme: PairPalsTheme = config.pairPals.defaults.theme;
  private size: PairPalsSize = config.pairPals.defaults.size;
  private themeButtons = new Map<PairPalsTheme, PlaceholderButton>();
  private sizeButtons = new Map<PairPalsSize, PlaceholderButton>();
  private frame!: SetupFrame;

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

    this.frame = createSetupFrame(this, 'pair-pals', 'PairPalsSetupScene', () => this.start());
    const P = config.layout.chooser.pairPalsSetup;
    const cx = this.scale.width / 2;

    // "Which cards?": a sample picture and the name on each tile.
    sectionHeading(this, P.cardsHeadingY, 'Which cards?');
    const themes = config.pairPals.themes;
    const T = P.themes;
    const themeX0 = cx - ((themes.length - 1) * (T.w + T.gapX)) / 2;
    themes.forEach((theme, i) => {
      const button = createChoiceTile({
        scene: this,
        x: themeX0 + i * (T.w + T.gapX),
        y: T.y,
        width: T.w,
        height: T.h,
        pictures: [{ key: PAIR_PALS_PICTURE_KEYS[theme], frame: config.pairPals.setup.samples[theme] }],
        picturePx: config.pairPals.setup.samplePx,
        name: config.pairPals.themeLabels[theme],
        nameKind: 'pickLabel',
        onClick: () => this.pickTheme(theme),
      });
      this.themeButtons.set(theme, button);
    });

    // "How tough?": the board size, its pairs and grid, and its points.
    sectionHeading(this, P.levelsHeadingY, 'How tough?');
    const sizes = Object.keys(config.pairPals.sizes) as PairPalsSize[];
    const L = P.levels;
    const sizeX0 = cx - ((sizes.length - 1) * (L.w + L.gapX)) / 2;
    sizes.forEach((size, i) => {
      const x = sizeX0 + i * (L.w + L.gapX);
      const button = createChoiceTile({
        scene: this,
        x,
        y: L.y,
        width: L.w,
        height: L.h,
        name: config.pairPals.sizes[size].label,
        nameKind: 'tileName',
        lines: [{ text: sizeSubtitle(size), kind: 'tileLine' }],
        onClick: () => this.pickSize(size),
      });
      const upTo = `Up to ${formatPoints(pairPalsMaxPoints(size))} points!`;
      text(this, x, L.y + L.h / 2 + P.upToGapPx, upTo, 'upTo').setOrigin(0.5, 0);
      this.sizeButtons.set(size, button);
    });

    // Tab order: top bar, trail, the themes, the sizes, Start; focus lands on Start.
    const order = [...this.frame.top, ...this.themeButtons.values(), ...this.sizeButtons.values(), this.frame.start];
    new KeyboardNavigator(this, order, { initialIndex: order.indexOf(this.frame.start) });
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
    this.frame.best.setText(bestLine(getPairPalsProgress().best(this.size)));
  }

  private start(): void {
    getPairPalsProgress().choose(this.theme, this.size);
    getRememberedPicks().setLastGame('pair-pals');
    this.scene.start(SceneKeys.PairPals);
  }
}
