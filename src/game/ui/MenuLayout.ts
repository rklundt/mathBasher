// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import { config } from '@/core/config';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';

export type ButtonKind = 'primary' | 'secondary';

export interface StackItem {
  label: string;
  /** Optional secondary line (matches PlaceholderButton `subtitle`). */
  subtitle?: string;
  /** Activation handler. Disabled buttons may omit it. */
  onClick?: () => void;
  /** Visual size class — picks `config.layout.button.primary*` vs `secondary*`. */
  kind?: ButtonKind;
  /** When true the button renders dim and ignores activation. */
  disabled?: boolean;
}

export interface StackOpts {
  /** Vertical center of the entire stack, in scene-design pixels. */
  centerY: number;
  /** Pixel gap between adjacent buttons. Default 12. */
  gap?: number;
  /** Horizontal center for every button. Defaults to scene midpoint. */
  centerX?: number;
  items: ReadonlyArray<StackItem>;
}

/**
 * Vertically stack a column of PlaceholderButtons centered on `centerX`,
 * `centerY` with consistent spacing. Returns the constructed buttons in
 * tab order so the caller can pass them to `KeyboardNavigator`.
 *
 * Why this exists: pre-refactor, every menu scene re-computed
 * `cx = width/2` and hand-coded `y: height * 0.5`, `0.62`, `0.74` for
 * stacked buttons. Spacing was inconsistent (some scenes used `* 0.12`
 * gaps, others `* 0.13`); button widths/heights were sprinkled (some
 * 280×64, some 240×56, some 200×56). A "make the menu rhythm tighter
 * for mobile" change had to touch six scenes.
 *
 * Now: scenes describe their menu as data — labels + handlers + kind —
 * and this helper computes the geometry against the canonical
 * `config.layout.button` constants.
 *
 * Picks button width/height from `config.layout.button` based on the
 * item's `kind` (defaulting to `primary`). The pixel gap defaults to
 * 12px which produces a comfortable stack at both 720p and 1080p
 * design heights.
 */
export function stackButtons(
  scene: Phaser.Scene,
  opts: StackOpts,
): PlaceholderButton[] {
  const { width: sceneW } = scene.scale;
  const cx = opts.centerX ?? sceneW / 2;
  const gap = opts.gap ?? 12;
  const items = opts.items;

  // Compute total height first so we can center the stack on `centerY`.
  const heights = items.map((it) =>
    (it.kind ?? 'primary') === 'primary'
      ? config.layout.button.primaryH
      : config.layout.button.secondaryH,
  );
  const totalHeight = heights.reduce((sum, h) => sum + h, 0) + gap * (items.length - 1);

  let y = opts.centerY - totalHeight / 2;
  const buttons: PlaceholderButton[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const kind = item.kind ?? 'primary';
    const w =
      kind === 'primary'
        ? config.layout.button.primaryW
        : config.layout.button.secondaryW;
    const h = heights[i];
    const buttonY = y + h / 2;

    buttons.push(
      new PlaceholderButton({
        scene,
        x: cx,
        y: buttonY,
        width: w,
        height: h,
        label: item.label,
        ...(item.subtitle !== undefined && { subtitle: item.subtitle }),
        ...(item.onClick !== undefined && { onClick: item.onClick }),
        ...(item.disabled !== undefined && { disabled: item.disabled }),
      }),
    );

    y += h + gap;
  }

  return buttons;
}
