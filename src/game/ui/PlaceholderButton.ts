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
  /** Disabled buttons render dimmer and ignore pointer events. */
  disabled?: boolean;
  /** Selected buttons get a brighter border to indicate active choice. */
  selected?: boolean;
  /** Click / tap handler. Not invoked when `disabled` is true. */
  onClick?: () => void;
}

/**
 * Reusable placeholder button — rounded rectangle with a centered label and
 * optional subtitle. Used everywhere through sprint 0.4 so spacing and styling
 * are consistent before the real Kenney-art polish lands.
 *
 * The component is small but encodes a few invariants worth keeping:
 * - Disabled buttons IGNORE pointer events entirely (not just visually dim).
 *   This is load-bearing for the DifficultyScene tile-gating: a kid clicking
 *   a "Coming soon" tile must NOT trigger anything.
 * - Hit area exactly matches the rectangle bounds (no off-by-one phantom hits).
 * - The button exposes `setSelected(boolean)` so scenes can flip selection
 *   state without rebuilding the button.
 */
export class PlaceholderButton extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly border: Phaser.GameObjects.Rectangle;
  private _disabled: boolean;
  private _selected: boolean;
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

    if (opts.subtitle) {
      const subtitle = opts.scene.add.text(0, 12, opts.subtitle, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#9ca3af',
      });
      subtitle.setOrigin(0.5);
      this.add(subtitle);
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

  private refreshAppearance(): void {
    if (this._disabled) {
      this.bg.setFillStyle(0x161b2c);
      this.border.setStrokeStyle(2, 0x374151);
      this.setAlpha(0.55);
    } else if (this._selected) {
      this.bg.setFillStyle(0x2a3454);
      this.border.setStrokeStyle(3, 0xfacc15); // amber for selected
      this.setAlpha(1);
    } else {
      this.bg.setFillStyle(0x1f2740);
      this.border.setStrokeStyle(2, 0x6b7280);
      this.setAlpha(1);
    }
  }
}
