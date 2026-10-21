// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import { config } from '@/core/config';
import { generators } from '@/math/registry';
import { Settings } from '@/services/Settings';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';

/** The challenge the chip last showed in this visit (it bounces when that changes). */
let lastShown: string | null = null;

/**
 * Sprint 2.9 — "Challenge: Add to 10 🔄" at the top of Game Select and
 * Difficulty: a big amber-ringed pill that opens the challenge picker. It
 * bounces once when it shows a challenge that just changed.
 */
export function createChallengeChip(scene: Phaser.Scene, x: number, y: number, onClick: () => void): PlaceholderButton {
  const { w, h } = config.layout.challengeFlow.chip;
  const id = Settings.round.mathId;
  const label = id === null ? 'Pick a challenge 🔄' : `Challenge: ${generators[id].label} 🔄`;
  const chip = new PlaceholderButton({ scene, x, y, width: w, height: h, label, selected: true, onClick });
  if (lastShown !== null && id !== null && id !== lastShown) {
    scene.tweens.add({ targets: chip, scale: { from: 1.15, to: 1 }, duration: 250, ease: 'Back.Out' });
  }
  lastShown = id;
  return chip;
}
