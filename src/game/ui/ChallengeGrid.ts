// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import { config, type MathId } from '@/core/config';
import { generators, getImplementedIds } from '@/math/registry';
import { Settings } from '@/services/Settings';
import { pointsMultiplierLabel } from '@/services/challengePoints';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { computeGridSlots } from '@/game/ui/menuLayoutGeometry';
import { TEXT_AMBER } from '@/game/ui/typography';

export interface ChallengeGrid {
  /** In order (whole numbers, then Mixed and fractions), for KeyboardNavigator. */
  buttons: PlaceholderButton[];
  /** Index of the current challenge (focus starts there), or -1. */
  currentIndex: number;
}

/**
 * Sprint 2.9 — the Math subject's challenge buttons, shared by the
 * challenge picker and the pause card: 4 + 4 + 3, each with its name and
 * "1.5x Points!" inside, the current one ringed. The order is
 * `config.scoring.mathDifficulty` (whole numbers, then Mixed and fractions).
 * A challenge without a generator yet shows "Coming soon" and can't be picked.
 */
export function buildChallengeGrid(
  scene: Phaser.Scene,
  opts: { centerX: number; firstRowY: number; onPick: (id: MathId) => void },
): ChallengeGrid {
  const ids = Object.keys(config.scoring.mathDifficulty) as MathId[];
  const implemented = new Set(getImplementedIds());
  const current = Settings.round.mathId;
  const slots = computeGridSlots(opts.centerX, opts.firstRowY, ids.length, config.layout.challengeFlow.grid);
  const buttons = ids.map((id, i) => {
    const ready = implemented.has(id);
    return new PlaceholderButton({
      scene,
      x: slots[i].x,
      y: slots[i].y,
      width: slots[i].width,
      height: slots[i].height,
      label: generators[id].label,
      subtitle: ready ? pointsMultiplierLabel(id) : 'Coming soon',
      ...(ready && { subtitleColor: TEXT_AMBER }),
      selected: id === current,
      disabled: !ready,
      ...(ready && { onClick: () => opts.onPick(id) }),
    });
  });
  return { buttons, currentIndex: current === null ? -1 : ids.indexOf(current) };
}
