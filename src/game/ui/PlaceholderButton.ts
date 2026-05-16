// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { getAudioManager } from '@/services/audioManagerFactory';
import { SfxKeys } from '@/core/audioKeys';
import {
  SLATE_BG,
  SLATE_HOVER,
  DISABLED_BG,
  BORDER_GREY,
  BORDER_GREY_DISABLED,
  FOCUS_BLUE,
  SELECTED_AMBER,
} from '@/game/ui/uiPalette';
import {
  FONT_FAMILY,
  TEXT_PRIMARY,
  TEXT_BUTTON_SUBTITLE,
} from '@/game/ui/typography';

export interface PlaceholderButtonOpts {
  scene: Phaser.Scene;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  /** Optional secondary line under the label (e.g. tile description). */
  subtitle?: string;
  /** Disabled buttons render dimmer and ignore pointer + keyboard activation. */
  disabled?: boolean;
  /** Selected buttons get an amber border to indicate active choice. */
  selected?: boolean;
  /** Click / tap / Enter / Space handler. Not invoked when `disabled` is true. */
  onClick?: () => void;
}

/**
 * Reusable placeholder button — rounded rectangle with a centered label and
 * optional subtitle. Used everywhere through the menu sprint so spacing and
 * styling are consistent before the real Kenney-art polish lands.
 *
 * Visual states:
 *   - normal: dim slate fill + grey 2px border
 *   - hover:  slightly brighter slate fill
 *   - selected: amber 3px border (active choice in a multi-choice group)
 *   - focused: blue 3px border (current keyboard focus, distinct from amber)
 *   - disabled: very dim fill + grey 2px border, IGNORES pointer and keyboard
 *
 * Important invariants:
 * - Disabled buttons IGNORE pointer events AND keyboard activation. This is
 *   load-bearing for DifficultyScene tile gating (a kid clicking a "Coming
 *   soon" tile must NOT trigger anything).
 * - Text inside disabled buttons does NOT have its alpha reduced — only the
 *   background and border dim. This keeps text contrast above WCAG 1.4.3
 *   (~4.5:1) on the dark canvas background. Reducing alpha on the whole
 *   container previously dropped subtitle contrast below the AA threshold.
 * - Subtitle font size is 14px (bumped from 12px) for elementary-school
 *   readability on phones in landscape.
 *
 * Keyboard accessibility:
 * - `setFocused(boolean)` paints the keyboard-focus ring; KeyboardNavigator
 *   in the same folder calls this as Tab/Shift-Tab moves through buttons.
 * - `activate()` invokes the click handler programmatically (Enter/Space
 *   uses this).
 * - `isDisabled()` exposes the disabled flag so KeyboardNavigator skips
 *   focus-stop on disabled buttons.
 */
export class PlaceholderButton extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly border: Phaser.GameObjects.Rectangle;
  private readonly textChildren: Phaser.GameObjects.Text[] = [];
  private _disabled: boolean;
  private _selected: boolean;
  private _focused = false;
  private readonly onClick?: () => void;

  constructor(opts: PlaceholderButtonOpts) {
    super(opts.scene, opts.x, opts.y);
    opts.scene.add.existing(this);

    this._disabled = opts.disabled ?? false;
    this._selected = opts.selected ?? false;
    this.onClick = opts.onClick;

    // Background (filled) + border (stroked).
    //
    // The BACKGROUND rectangle is the interactive surface, NOT the container.
    // Why: putting setInteractive on the container with a custom hit-area was
    // producing dead zones — only narrow horizontal bands of the button
    // responded to clicks, and the rest silently swallowed the pointer. The
    // root cause is that Phaser's input pipeline, when resolving a hit on a
    // Container, walks the container's children and lets non-interactive
    // children (the text glyphs sitting on top of the bg) shadow portions of
    // the hit-test in some configurations. Anchoring `setInteractive` to the
    // bg rectangle directly bypasses all of that: the bg is a leaf node, its
    // hit area is auto-derived from its width/height, and Phaser computes the
    // world-to-local transform via its parent container automatically. Net:
    // the entire button surface is clickable, regardless of where the text
    // sits.
    this.bg = opts.scene.add.rectangle(0, 0, opts.width, opts.height, SLATE_BG);
    this.border = opts.scene.add.rectangle(0, 0, opts.width, opts.height);
    this.border.setStrokeStyle(2, BORDER_GREY);
    this.border.setFillStyle();
    this.add([this.bg, this.border]);

    const label = opts.scene.add.text(0, opts.subtitle ? -10 : 0, opts.label, {
      fontFamily: FONT_FAMILY,
      fontSize: '24px', // Sprint 0.7.5 Story 1 — was 20 (button label)
      color: TEXT_PRIMARY,
    });
    label.setOrigin(0.5);
    this.add(label);
    this.textChildren.push(label);

    if (opts.subtitle) {
      const subtitle = opts.scene.add.text(0, 14, opts.subtitle, {
        fontFamily: FONT_FAMILY,
        fontSize: '17px', // Sprint 0.7.5 Story 1 — was 14 (button subtitle)
        color: TEXT_BUTTON_SUBTITLE,
      });
      subtitle.setOrigin(0.5);
      this.add(subtitle);
      this.textChildren.push(subtitle);
    }

    // Container size is still set so layout consumers (KeyboardNavigator focus
    // ring math, future tween-on-press) have correct bounds, but the container
    // itself is NOT interactive — see the comment on `this.bg` above.
    this.setSize(opts.width, opts.height);

    // Make the BG the click target. `useHandCursor: true` flips the CSS cursor
    // to a pointing hand on hover so users get visual feedback before clicking.
    this.bg.setInteractive({ useHandCursor: true });

    // Hover state (only when enabled).
    this.bg.on('pointerover', () => {
      if (!this._disabled) this.bg.setFillStyle(SLATE_HOVER);
    });
    this.bg.on('pointerout', () => {
      if (!this._disabled) this.bg.setFillStyle(SLATE_BG);
    });
    // Click handler uses POINTERDOWN, not pointerup. pointerup is bug-shaped
    // here for two reasons:
    //   1. After a scene transition, if the cursor is already over the target
    //      when the scene activates, the first down/up pair is sometimes
    //      treated as "incomplete" and the click is silently dropped — the
    //      user has to hover off and back on to re-sync the state.
    //   2. pointerdown fires the moment the button is pressed, which feels
    //      snappier for arcade-game menus.
    // pointerdown works the same for mouse, touch, and pen via Phaser's
    // unified pointer abstraction.
    this.bg.on('pointerdown', () => {
      if (this._disabled) return;
      this.playClickSfx();
      this.onClick?.();
    });

    this.refreshAppearance();
  }

  /**
   * Play the universal button-click SFX. Triggered on every successful
   * activation (pointer click + keyboard Enter/Space when focused).
   * Disabled buttons skip this — they suppress the sound just like they
   * suppress the onClick callback.
   *
   * Volume rides on the sfx slider in SettingsScene + master mute,
   * because AudioManager's `play(key, 'sfx')` already handles both.
   * If audio.init() hasn't fired yet (e.g. dev hot-reload skips the
   * splash flow), the call is a silent no-op rather than a crash.
   */
  private playClickSfx(): void {
    getAudioManager().play(SfxKeys.ButtonClick1, 'sfx');
  }

  setSelected(value: boolean): void {
    if (this._selected === value) return;
    this._selected = value;
    this.refreshAppearance();
  }

  setDisabled(value: boolean): void {
    if (this._disabled === value) return;
    this._disabled = value;
    this.refreshAppearance();
  }

  setFocused(value: boolean): void {
    if (this._focused === value) return;
    this._focused = value;
    this.refreshAppearance();
  }

  isDisabled(): boolean {
    return this._disabled;
  }

  /**
   * Programmatically activate the button (used by KeyboardNavigator on
   * Enter/Space). No-op when disabled. Plays the same click SFX as a
   * mouse/touch activation so keyboard users get audible confirmation.
   */
  activate(): void {
    if (this._disabled) return;
    this.playClickSfx();
    this.onClick?.();
  }

  private refreshAppearance(): void {
    // Disabled state: dim bg/border, but KEEP TEXT BRIGHT for WCAG 1.4.3
    // contrast on the dark canvas background. The previous setAlpha(0.55)
    // on the whole container dropped subtitle text below the 4.5:1 ratio.
    if (this._disabled) {
      this.bg.setFillStyle(DISABLED_BG);
      this.bg.setAlpha(0.7);
      this.border.setStrokeStyle(2, BORDER_GREY_DISABLED);
      this.border.setAlpha(0.7);
      this.textChildren.forEach((t) => t.setAlpha(1));
      this.setAlpha(1); // container itself stays full-alpha
      return;
    }

    this.bg.setAlpha(1);
    this.border.setAlpha(1);
    this.textChildren.forEach((t) => t.setAlpha(1));

    // Border colors: focus > selected > normal. Focus uses a distinct blue
    // so it never gets confused with the amber selected state.
    if (this._focused) {
      this.bg.setFillStyle(SLATE_HOVER);
      this.border.setStrokeStyle(3, FOCUS_BLUE);
    } else if (this._selected) {
      this.bg.setFillStyle(SLATE_HOVER);
      this.border.setStrokeStyle(3, SELECTED_AMBER);
    } else {
      this.bg.setFillStyle(SLATE_BG);
      this.border.setStrokeStyle(2, BORDER_GREY);
    }
  }
}
