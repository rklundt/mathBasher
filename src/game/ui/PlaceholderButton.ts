// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';

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
    this.bg = opts.scene.add.rectangle(0, 0, opts.width, opts.height, 0x1f2740);
    this.border = opts.scene.add.rectangle(0, 0, opts.width, opts.height);
    this.border.setStrokeStyle(2, 0x6b7280);
    this.border.setFillStyle();
    this.add([this.bg, this.border]);

    const label = opts.scene.add.text(0, opts.subtitle ? -10 : 0, opts.label, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      color: '#eaeaf2',
    });
    label.setOrigin(0.5);
    this.add(label);
    this.textChildren.push(label);

    if (opts.subtitle) {
      const subtitle = opts.scene.add.text(0, 14, opts.subtitle, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: '#cbd5e1',
      });
      subtitle.setOrigin(0.5);
      this.add(subtitle);
      this.textChildren.push(subtitle);
    }

    // Hit area exactly matches the rectangle.
    this.setSize(opts.width, opts.height);
    this.setInteractive(
      new Phaser.Geom.Rectangle(-opts.width / 2, -opts.height / 2, opts.width, opts.height),
      Phaser.Geom.Rectangle.Contains,
    );

    // Hover + press states (only when enabled).
    this.on('pointerover', () => {
      if (!this._disabled) this.bg.setFillStyle(0x2a3454);
    });
    this.on('pointerout', () => {
      if (!this._disabled) this.bg.setFillStyle(0x1f2740);
    });
    this.on('pointerup', () => {
      if (this._disabled) return;
      this.onClick?.();
    });

    this.refreshAppearance();
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
   * Enter/Space). No-op when disabled.
   */
  activate(): void {
    if (this._disabled) return;
    this.onClick?.();
  }

  private refreshAppearance(): void {
    // Disabled state: dim bg/border, but KEEP TEXT BRIGHT for WCAG 1.4.3
    // contrast on the dark canvas background. The previous setAlpha(0.55)
    // on the whole container dropped subtitle text below the 4.5:1 ratio.
    if (this._disabled) {
      this.bg.setFillStyle(0x161b2c);
      this.bg.setAlpha(0.7);
      this.border.setStrokeStyle(2, 0x374151);
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
      this.bg.setFillStyle(0x2a3454);
      this.border.setStrokeStyle(3, 0x60a5fa); // blue for keyboard focus
    } else if (this._selected) {
      this.bg.setFillStyle(0x2a3454);
      this.border.setStrokeStyle(3, 0xfacc15); // amber for selected
    } else {
      this.bg.setFillStyle(0x1f2740);
      this.border.setStrokeStyle(2, 0x6b7280);
    }
  }
}
