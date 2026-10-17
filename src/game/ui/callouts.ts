// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { clampNoteX } from '@/game/ui/calloutGeometry';
import { text, type TextKind } from '@/game/ui/typography';
import { CALLOUT_BORDER, CALLOUT_INK, CALLOUT_INK_CSS } from '@/game/ui/uiPalette';

/**
 * Sprint 2.6.3 — the callouts the tap-to-answer games share, moved here from
 * copies in Frog Splash, Math-a-lotl and Space Shooter. Number Climb and
 * Asteroid Field use `screenBanner` / `applyBannerLegibility` for their banners:
 *
 *  - `createTapHint`: the pulsing "👆 …" pill shown on question 1.
 *  - `floatNote`: a note that rises while it fades ("Splash! Try again!").
 *  - `fadeNote`: a note that holds still, then fades ("Floated away!").
 *  - `screenBanner`: a centred banner ("Out of lives!").
 *
 * Numbers come from `config.layout.callout`, colours from `uiPalette.ts`;
 * where each game puts its hint lives in that game's config block.
 *
 * No shutdown listeners here on purpose: Phaser's tween manager and display
 * list clean these up when the scene shuts down, and each scene builds its
 * hint again in `create`.
 */

const C = config.layout.callout;

export interface TapHintOptions {
  x: number;
  y: number;
  label: string;
  heightPx: number;
  backdropAlpha: number;
  /** Fixed pill width; by default the pill is the label's width plus padding. */
  widthPx?: number;
  /** Ignore camera scroll (Frog Splash's camera starts scrolled down the river). */
  fixedToCamera?: boolean;
}

export interface TapHint {
  show(): void;
  /** Removes the hint. Safe to call more than once (a tap and a key press can both dismiss it). */
  destroy(): void;
}

/** The Q1 "👆 …" hint: built hidden; `show()` reveals it, `destroy()` removes it for good. */
export function createTapHint(scene: Phaser.Scene, opts: TapHintOptions): TapHint {
  let container: Phaser.GameObjects.Container | undefined = scene.add.container(opts.x, opts.y);
  if (opts.fixedToCamera) container.setScrollFactor(0);
  const label = text(scene, 0, 0, opts.label, 'rowLabel').setOrigin(0.5);
  const width = opts.widthPx ?? label.width + C.pillPaddingPx;
  const bg = scene.add
    .rectangle(0, 0, width, opts.heightPx, CALLOUT_INK, opts.backdropAlpha)
    .setStrokeStyle(C.pillBorderPx, CALLOUT_BORDER, C.pillBorderAlpha);
  container.add([bg, label]);
  container.setDepth(C.hintDepth).setVisible(false);
  scene.tweens.add({
    targets: container,
    alpha: { from: 1, to: C.pulseMinAlpha },
    duration: C.pulseMs,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.InOut',
  });
  return {
    show: () => {
      container?.setVisible(true);
    },
    destroy: () => {
      if (!container) return;
      scene.tweens.killTweensOf(container);
      container.destroy();
      container = undefined;
    },
  };
}

export interface FloatNoteOptions {
  risePx: number;
  durationMs: number;
  /** Keep the note this far in from the screen edges; omit to leave x as given. */
  edgeMarginPx?: number;
}

/** A note that rises `risePx` while fading out over `durationMs`, then removes itself. */
export function floatNote(scene: Phaser.Scene, x: number, y: number, msg: string, opts: FloatNoteOptions): void {
  const cx = opts.edgeMarginPx === undefined ? x : clampNoteX(x, scene.scale.width, opts.edgeMarginPx);
  const note = text(scene, cx, y, msg, 'rowLabel').setOrigin(0.5).setDepth(C.textDepth);
  note.setStroke(CALLOUT_INK_CSS, C.noteStrokePx);
  scene.tweens.add({
    targets: note,
    y: y - opts.risePx,
    alpha: { from: 1, to: 0 },
    duration: opts.durationMs,
    ease: 'Quad.In',
    onComplete: () => note.destroy(),
  });
}

export interface FadeNoteOptions {
  holdMs: number;
  fadeMs: number;
}

/** A note that stays put for `holdMs`, fades over `fadeMs`, then removes itself. */
export function fadeNote(scene: Phaser.Scene, x: number, y: number, msg: string, opts: FadeNoteOptions): void {
  const note = text(scene, x, y, msg, 'rowLabel').setOrigin(0.5).setDepth(C.textDepth);
  note.setStroke(CALLOUT_INK_CSS, C.noteStrokePx);
  scene.tweens.add({
    targets: note,
    alpha: 0,
    delay: opts.holdMs,
    duration: opts.fadeMs,
    onComplete: () => note.destroy(),
  });
}

export interface ScreenBannerOptions {
  /** Typography style; default `'warning'`. */
  style?: TextKind;
  /** Ignore camera scroll, for scenes whose camera moves. */
  fixedToCamera?: boolean;
}

/**
 * A banner centred on the screen. Returns the text so the caller decides
 * when it goes (and can restyle it, like Frog Splash's finish banner).
 */
export function screenBanner(
  scene: Phaser.Scene,
  msg: string,
  opts: ScreenBannerOptions = {},
): Phaser.GameObjects.Text {
  const banner = text(scene, scene.scale.width / 2, scene.scale.height / 2, msg, opts.style ?? 'warning')
    .setOrigin(0.5)
    .setDepth(C.textDepth);
  if (opts.fixedToCamera) banner.setScrollFactor(0);
  applyBannerLegibility(banner);
  return banner;
}

/**
 * The heavy dark outline + soft shadow every banner uses, so it stays
 * readable on bright backdrops (Number Climb's fire floor, the sunny river).
 */
export function applyBannerLegibility(banner: Phaser.GameObjects.Text): void {
  banner.setStroke(CALLOUT_INK_CSS, C.bannerStrokePx);
  banner.setShadow(0, C.bannerShadowOffsetY, CALLOUT_INK_CSS, C.bannerShadowBlur, true, true);
}
