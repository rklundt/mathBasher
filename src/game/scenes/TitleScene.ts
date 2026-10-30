// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { TITLE_ART_KEY } from '@/core/spriteKeys';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { createMuteIconButton } from '@/game/ui/MuteIconButton';
import { openSettings } from '@/game/ui/topBar';
import { addScreenTag } from '@/game/ui/screenTag';
import { text, TEXT_SOFT } from '@/game/ui/typography';
import { setupScene } from '@/game/scenes/sceneSetup';
import { openChooser } from '@/game/services/chooserNavigation';

/**
 * Sprint 2.15 — the Title Screen (it replaced the old main menu): the game's
 * name and line, **Play** (the Game Chooser) and **Settings**, the title art
 * on the right, mute in the corner. Nothing else: My Scores lives in the
 * chooser's top bar now, and no screen comes back here except Back from the
 * chooser's first step.
 */
export class TitleScene extends Phaser.Scene {
  static readonly key = SceneKeys.Title;

  constructor() {
    super(TitleScene.key);
  }

  create(): void {
    setupScene(this);
    addScreenTag(this, 'TitleScene');
    const T = config.layout.chooser.title;
    const { width } = this.scale;

    if (this.textures.exists(TITLE_ART_KEY)) {
      this.add.image(T.art.x, T.art.y, TITLE_ART_KEY).setDisplaySize(T.art.size, T.art.size);
    }
    text(this, T.textX, T.nameY, 'mathBasher', 'titleHero').setOrigin(0.5);
    text(this, T.textX, T.lineY, 'Math and puzzle games', 'tileTagline').setOrigin(0.5).setColor(TEXT_SOFT);

    const play = new PlaceholderButton({
      scene: this,
      x: T.textX,
      y: T.playY,
      width: T.buttonW,
      height: T.playH,
      label: '▶  Play',
      labelKind: 'h3',
      variant: 'primary',
      onClick: () => openChooser(this),
    });
    const settings = new PlaceholderButton({
      scene: this,
      x: T.textX,
      y: T.settingsY,
      width: T.buttonW,
      height: T.settingsH,
      label: '⚙️  Settings',
      labelKind: 'setupHeading',
      onClick: () => openSettings(this),
    });
    const mute = createMuteIconButton(this, width - 28 - 32, 52, { width: 64, height: 64 });

    new KeyboardNavigator(this, [play, settings, mute]);
  }
}
