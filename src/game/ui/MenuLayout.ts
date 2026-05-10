// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { computeStackSlots, type ButtonKind } from '@/game/ui/menuLayoutGeometry';

export type { ButtonKind };
export { computeStackSlots };

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
 *
 * INTENTIONAL VISUAL CHANGE FROM PRE-REFACTOR: the `kind: 'secondary'`
 * branch picks `secondaryW` (200px) — narrower than primary (280px) —
 * AND uses the smaller height. Pre-refactor, several scenes' "secondary"
 * actions (MenuScene.Settings, PauseOverlay.Settings, GameOverScene
 * Change-Difficulty + Main-Menu) were rendered at PRIMARY width (280)
 * with only the height differing. The refactor now makes secondary
 * actions visibly narrower, so primary actions read as more important.
 * If a caller wants a secondary action at primary width (consistent
 * column rather than tapered stack), pass `kind: 'primary'` explicitly.
 * Y-positions on stacked menus may drift up to ~15px from pre-refactor
 * values because total stack height is now slightly smaller.
 */
export function stackButtons(
  scene: Phaser.Scene,
  opts: StackOpts,
): PlaceholderButton[] {
  const { width: sceneW } = scene.scale;
  const cx = opts.centerX ?? sceneW / 2;
  const gap = opts.gap ?? 12;
  const items = opts.items;
  const slots = computeStackSlots(cx, opts.centerY, gap, items);

  return items.map(
    (item, i) =>
      new PlaceholderButton({
        scene,
        x: slots[i].x,
        y: slots[i].y,
        width: slots[i].width,
        height: slots[i].height,
        label: item.label,
        ...(item.subtitle !== undefined && { subtitle: item.subtitle }),
        ...(item.onClick !== undefined && { onClick: item.onClick }),
        ...(item.disabled !== undefined && { disabled: item.disabled }),
      }),
  );
}
