// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import { config } from '@/core/config';
import type { TrailChip } from '@/core/chooserSteps';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { text, textStyle } from '@/game/ui/typography';

/**
 * Sprint 2.15 — the "where you are" trail under the title: one chip per step
 * ("Math › mathBasher › Alien Shoot"), each tappable to go back to it.
 * Returns the chips (for the Tab order) and everything drawn.
 */
export function createTrail(
  scene: Phaser.Scene,
  chips: readonly TrailChip[],
  onPick: (chip: TrailChip) => void,
): { buttons: PlaceholderButton[]; objects: Phaser.GameObjects.GameObject[] } {
  const T = config.layout.chooser.trail;
  if (chips.length === 0) return { buttons: [], objects: [] };

  // Measure each label, then lay the row out centred with "›" between.
  const probe = scene.add.text(0, 0, '', textStyle('pickLabel'));
  const widths = chips.map((c) => probe.setText(c.label).width + 2 * T.padX);
  const sep = probe.setText('›').width;
  probe.destroy();
  const total = widths.reduce((sum, w) => sum + w, 0) + (chips.length - 1) * (sep + 2 * T.gapPx);

  const buttons: PlaceholderButton[] = [];
  const objects: Phaser.GameObjects.GameObject[] = [];
  let x = scene.scale.width / 2 - total / 2;
  chips.forEach((chip, i) => {
    const w = widths[i];
    const button = new PlaceholderButton({
      scene,
      x: x + w / 2,
      y: T.y,
      width: w,
      height: T.h,
      label: chip.label,
      labelKind: 'pickLabel',
      radius: T.h / 2,
      onClick: () => onPick(chip),
    });
    buttons.push(button);
    objects.push(button);
    x += w;
    if (i < chips.length - 1) {
      x += T.gapPx;
      objects.push(text(scene, x + sep / 2, T.y, '›', 'pickLabel').setOrigin(0.5));
      x += sep + T.gapPx;
    }
  });
  return { buttons, objects };
}
