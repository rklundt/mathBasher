// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import { config } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { _th, SeverityLevel } from '@/core/telemetry';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { createIconButton, type IconButtonInstance } from '@/game/ui/IconButton';
import { createMuteIconButton } from '@/game/ui/MuteIconButton';
import { MUTE_ICON_BG, MUTE_ICON_HOVER } from '@/game/ui/uiPalette';
import { text, textStyle } from '@/game/ui/typography';
import type { SettingsSceneInit } from '@/game/scenes/SettingsScene';
import type { Focusable } from '@/game/ui/KeyboardNavigator';

export interface TopBarOpts {
  title: string;
  /** A picture before the title (a setup screen shows its game's). */
  picture?: { key: string; frame: number };
  onBack: () => void;
  /** My Scores (the chooser and setup screens); left out, no trophy button. */
  onScores?: () => void;
}

export interface TopBar {
  back: PlaceholderButton;
  /** Back first, then My Scores, Settings and mute (Tab order). */
  focusables: Focusable[];
}

/**
 * Sprint 2.15 — the bar across the top of every chooser and setup screen:
 * Back on the left, the title (with an optional picture) centred between,
 * then My Scores, Settings and mute on the right. Settings opens over the
 * screen and comes back to it.
 */
export function createTopBar(scene: Phaser.Scene, opts: TopBarOpts): TopBar {
  const B = config.layout.chooser.topBar;
  const { width } = scene.scale;

  const back = new PlaceholderButton({
    scene,
    x: B.sidePadPx + B.backW / 2,
    y: B.y,
    width: B.backW,
    height: B.h,
    label: '‹  Back',
    onClick: opts.onBack,
  });

  // From the right: mute, Settings, then My Scores.
  let right = width - B.sidePadPx;
  const mute = createMuteIconButton(scene, right - B.iconW / 2, B.y, { width: B.iconW, height: B.h });
  right -= B.iconW + B.gapPx;
  const settings = createGlyphButton(scene, right - B.iconW / 2, B.y, '⚙️', () => openSettings(scene));
  right -= B.iconW + B.gapPx;
  let scores: PlaceholderButton | undefined;
  if (opts.onScores !== undefined) {
    scores = new PlaceholderButton({
      scene,
      x: right - B.scoresW / 2,
      y: B.y,
      width: B.scoresW,
      height: B.h,
      label: '🏆 My Scores',
      selected: true,
      onClick: opts.onScores,
    });
    right -= B.scoresW + B.gapPx;
  }

  // The title, centred in the space between Back and the buttons on the right.
  const left = B.sidePadPx + B.backW + B.gapPx;
  const cx = (left + right) / 2;
  const title = text(scene, cx, B.y, opts.title, 'barTitle').setOrigin(0.5);
  if (opts.picture !== undefined && scene.textures.exists(opts.picture.key)) {
    const size = B.h;
    const gap = 12;
    const total = size + gap + title.width;
    const pic = scene.add.image(cx - total / 2 + size / 2, B.y, opts.picture.key, opts.picture.frame);
    pic.setDisplaySize(size, size);
    title.setX(cx - total / 2 + size + gap + title.width / 2);
  }
  // A long title shrinks to fit rather than run under the buttons.
  const room = right - left;
  if (title.width > room) title.setScale(room / title.width);

  return { back, focusables: [back, ...(scores ? [scores] : []), settings, mute] };
}

/** Open Settings over this screen; its Back closes it and this screen carries on. */
export function openSettings(scene: Phaser.Scene): void {
  if (scene.scene.isActive(SceneKeys.Settings)) return;
  _th.logToAi('SettingsOpened', SeverityLevel.Information, { sceneKey: scene.scene.key });
  const init: SettingsSceneInit = { onBack: () => scene.scene.stop(SceneKeys.Settings) };
  scene.scene.launch(SceneKeys.Settings, init);
}

/** A square icon button with an emoji glyph (Settings' gear). */
function createGlyphButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  glyph: string,
  onActivate: () => void,
): IconButtonInstance {
  const B = config.layout.chooser.topBar;
  return createIconButton({
    scene,
    x,
    y,
    width: B.iconW,
    height: B.h,
    baseFill: MUTE_ICON_BG,
    hoverFill: MUTE_ICON_HOVER,
    render: (container) => {
      container.add(scene.add.text(0, 1, glyph, textStyle('iconGlyph')).setOrigin(0.5));
      return undefined;
    },
    onActivate,
  });
}
