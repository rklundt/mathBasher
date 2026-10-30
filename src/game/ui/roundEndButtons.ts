// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import { config } from '@/core/config';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { openSettings } from '@/game/ui/topBar';

export interface RoundEndButtonsOpts {
  cx: number;
  /** Play Again's centre; the row of three sits under it. */
  playAgainY: number;
  /** The game's Change button ("Change Math or Speed", "Change Difficulty", "Change Cards or Difficulty"). */
  changeLabel: string;
  onPlayAgain: () => void;
  onChangeGame: () => void;
  onChange: () => void;
  /** Drawn above the game (the puzzle end panels). */
  depth?: number;
}

/**
 * Sprint 2.15 — the end of every round (Game Over, the puzzle end panel,
 * Pair Pals' win panel): a big yellow **Play Again**, then **Change Game**
 * (the games list), the game's own Change button (its setup) and
 * **Settings** (over this screen). No main menu. Returns them in Tab order.
 */
export function createRoundEndButtons(scene: Phaser.Scene, o: RoundEndButtonsOpts): PlaceholderButton[] {
  const R = config.layout.chooser.roundEnd;
  const playAgain = new PlaceholderButton({
    scene,
    x: o.cx,
    y: o.playAgainY,
    width: R.playAgainW,
    height: R.playAgainH,
    label: '↻  Play Again',
    labelKind: 'h3',
    variant: 'primary',
    onClick: o.onPlayAgain,
  });
  const items = [
    { label: 'Change Game', onClick: o.onChangeGame },
    { label: o.changeLabel, onClick: o.onChange },
    { label: 'Settings', onClick: () => openSettings(scene) },
  ];
  const rowW = R.widths.reduce((sum, w) => sum + w, 0) + R.gapX * (R.widths.length - 1);
  const y = o.playAgainY + R.playAgainH / 2 + R.rowGapY + R.rowH / 2;
  let x = o.cx - rowW / 2;
  const row = items.map((item, i) => {
    const w = R.widths[i];
    const button = new PlaceholderButton({
      scene,
      x: x + w / 2,
      y,
      width: w,
      height: R.rowH,
      label: item.label,
      onClick: item.onClick,
    });
    x += w + R.gapX;
    return button;
  });
  const all = [playAgain, ...row];
  if (o.depth !== undefined) for (const b of all) b.setDepth(o.depth);
  return all;
}
