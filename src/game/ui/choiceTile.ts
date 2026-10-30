// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import { config } from '@/core/config';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { textStyle, type TextKind } from '@/game/ui/typography';
import { PRIMARY_FILL } from '@/game/ui/uiPalette';

/** One line of text on a tile, under its name. */
export interface TileLine {
  text: string;
  kind: TextKind;
}

export interface ChoiceTileOpts {
  scene: Phaser.Scene;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Pictures in a row at the top (sheet frames), drawn `picturePx` square. */
  pictures?: ReadonlyArray<{ key: string; frame: number }>;
  picturePx?: number;
  name: string;
  nameKind: TextKind;
  /** Lines under the name, wrapped to the tile. */
  lines?: readonly TileLine[];
  /** A pill on the top edge ("Last Played"). */
  badge?: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

/**
 * Sprint 2.15 — a tile on the Game Chooser: pictures on top, then the name
 * and its lines, the whole stack centred in the tile, as in the wireframes.
 * A `PlaceholderButton` underneath, so focus, the selected ring, taps and
 * keys work as on every other button.
 */
export function createChoiceTile(o: ChoiceTileOpts): PlaceholderButton {
  const { scene } = o;
  const C = config.layout.chooser;
  const tile = new PlaceholderButton({
    scene,
    x: o.x,
    y: o.y,
    width: o.width,
    height: o.height,
    label: '',
    selected: o.selected ?? false,
    disabled: o.disabled ?? false,
    ...(o.onClick !== undefined && { onClick: o.onClick }),
  });

  const parts: Phaser.GameObjects.Components.Transform[] = [];
  const heights: number[] = [];
  const wrap = o.width - 2 * C.tilePadPx;

  const pics = (o.pictures ?? []).filter((p) => scene.textures.exists(p.key));
  if (pics.length > 0) {
    const size = o.picturePx ?? C.picturePx.game;
    const gap = 8;
    const rowW = pics.length * size + (pics.length - 1) * gap;
    const row = scene.add.container(0, 0);
    pics.forEach((p, i) => {
      const img = scene.add.image(-rowW / 2 + size / 2 + i * (size + gap), 0, p.key, p.frame);
      img.setDisplaySize(size, size);
      if (o.disabled === true) img.setAlpha(0.6);
      row.add(img);
    });
    tile.add(row);
    parts.push(row);
    heights.push(size);
  }

  const name = scene.add.text(0, 0, o.name, { ...textStyle(o.nameKind), align: 'center' }).setOrigin(0.5);
  // A name never wraps ("mathBasher" is one word); a long one shrinks to fit.
  if (name.width > wrap) name.setScale(wrap / name.width);
  tile.add(name);
  parts.push(name);
  heights.push(name.displayHeight);

  for (const line of o.lines ?? []) {
    const t = scene.add.text(0, 0, line.text, {
      ...textStyle(line.kind),
      align: 'center',
      wordWrap: { width: wrap, useAdvancedWrap: true },
    });
    t.setOrigin(0.5).setLineSpacing(-2);
    tile.add(t);
    parts.push(t);
    heights.push(t.height);
  }

  // Centre the stack in the tile.
  const total = heights.reduce((sum, h) => sum + h, 0) + C.tileGapPx * (heights.length - 1);
  let y = -total / 2;
  parts.forEach((part, i) => {
    part.setY(y + heights[i] / 2);
    y += heights[i] + C.tileGapPx;
  });

  if (o.badge !== undefined) {
    const label = scene.add.text(0, 0, o.badge, textStyle('tilePill')).setOrigin(0.5);
    const pill = scene.add.rectangle(0, 0, label.width + 28, label.height + 4, PRIMARY_FILL);
    const top = -o.height / 2;
    pill.setY(top);
    label.setY(top);
    tile.add([pill, label]);
  }
  return tile;
}
