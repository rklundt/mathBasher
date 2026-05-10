// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { getAudioManager } from '@/services/audioManagerFactory';
import { SfxKeys } from '@/core/audioKeys';
import type { Focusable } from '@/game/ui/KeyboardNavigator';
import {
  SLATE_BG,
  SLATE_HOVER,
  BORDER_GREY,
  FOCUS_BLUE,
} from '@/game/ui/uiPalette';

export interface IconButtonOpts {
  scene: Phaser.Scene;
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Paints the icon glyph(s) inside the button. Called once during
   * construction with the container so the caller can `add` text /
   * shapes at local coordinates (0,0 = center of the button).
   *
   * The render callback should NOT touch the bg or border — those are
   * owned by the wrapper and repainted on hover/focus state changes.
   * The callback CAN return an updater function that the wrapper
   * invokes whenever it would like the glyph re-evaluated (e.g. after
   * a state change like mute toggling). Return `undefined` for static
   * glyphs (Pause icon).
   */
  render: (container: Phaser.GameObjects.Container) => (() => void) | undefined;
  /** Click / Enter / Space handler. Plays the standard click SFX before invoking. */
  onActivate: () => void;
  /** Optional palette overrides — Mute icon uses warm-amber-tinted variants. */
  baseFill?: number;
  hoverFill?: number;
}

/**
 * Reusable HUD-style icon button. Container with a colored background +
 * border + a caller-supplied glyph painted via the `render` callback.
 *
 * Owns: bg + border + hover repaint + focus repaint + click SFX +
 * Focusable shim for KeyboardNavigator. Caller owns: the glyph itself
 * (pause bars, speaker emoji, etc.) and the activate handler's behavior.
 *
 * Why this exists: pre-refactor, HudScene had two ~40-line near-identical
 * blocks (`createPauseButton`, `createMuteButton`) doing the exact same
 * dance. They differed only in the glyph rendering and the activate
 * behavior. The rule-of-three threshold was already met inside HudScene
 * itself; extracting now collapses both call sites to ~10 lines each
 * AND makes a future third icon (full-screen toggle, help, etc.) cheap
 * to add.
 *
 * Hit-area pattern matches PlaceholderButton: the BG rectangle (a leaf
 * node) is the interactive surface, NOT the container. Putting
 * setInteractive on the container with a custom hit-area produced dead
 * zones (PlaceholderButton's comment block has the full diagnosis).
 *
 * Visual states:
 *   - normal:  baseFill + 2px BORDER_GREY
 *   - hover:   hoverFill (caller-overridable)
 *   - focused: 3px FOCUS_BLUE ring (matches PlaceholderButton's focus convention)
 *
 * The `render` callback's optional return value is a re-paint hook the
 * wrapper invokes whenever appearance might need to update (focus /
 * pointer state changes). Mute icon uses this to switch its emoji glyph
 * 🔊 ↔ 🔇 in sync with audio mute state.
 */
export type IconButtonInstance = Phaser.GameObjects.Container & Focusable;

export function createIconButton(opts: IconButtonOpts): IconButtonInstance {
  const { scene, x, y, width: w, height: h, render, onActivate } = opts;
  const baseFill = opts.baseFill ?? SLATE_BG;
  const hoverFill = opts.hoverFill ?? SLATE_HOVER;

  const container = scene.add.container(x, y) as IconButtonInstance;
  const bg = scene.add.rectangle(0, 0, w, h, baseFill);
  bg.setStrokeStyle(2, BORDER_GREY);
  container.add(bg);

  // Glyph(s) layered on top of the bg. Render callback may return an
  // updater used after state changes to re-evaluate appearance.
  const glyphRefresh = render(container);

  container.setSize(w, h);

  let focused = false;

  const repaint = (): void => {
    bg.setStrokeStyle(focused ? 3 : 2, focused ? FOCUS_BLUE : BORDER_GREY);
    glyphRefresh?.();
  };

  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerover', () => bg.setFillStyle(hoverFill));
  bg.on('pointerout', () => bg.setFillStyle(baseFill));
  bg.on('pointerdown', () => activateInternal());

  // Single source of truth for activation — pointer click + keyboard
  // Enter/Space (via Focusable.activate) both go through here. Plays the
  // standard click SFX, runs the caller's behavior, then triggers the
  // glyph refresh hook so any state-driven glyph changes (mute icon
  // emoji swap) become visible immediately.
  const activateInternal = (): void => {
    getAudioManager().play(SfxKeys.ButtonClick1, 'sfx');
    onActivate();
    glyphRefresh?.();
  };

  container.setFocused = (value: boolean): void => {
    focused = value;
    repaint();
  };
  container.activate = activateInternal;
  container.isDisabled = (): boolean => false;

  return container;
}
