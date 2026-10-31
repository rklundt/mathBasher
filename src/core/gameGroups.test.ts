// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import { GAME_GROUPS, gameGroupById, gameGroupOf } from '@/core/gameGroups';
import { MATH_GAME_IDS } from '@/core/gameIds';
import { GAME_ICON_SHEET, SPRITE_MANIFEST } from '@/core/spriteKeys';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('game groups (sprint 2.13.1)', () => {
  it('every math game is in exactly one group', () => {
    for (const id of MATH_GAME_IDS) {
      const homes = GAME_GROUPS.filter((g) => g.games.includes(id));
      expect(homes.length, id).toBe(1);
    }
    const listed = GAME_GROUPS.flatMap((g) => g.games);
    expect([...listed].sort()).toEqual([...MATH_GAME_IDS].sort());
  });

  it('Math Basher holds the space and arcade games, Math Fun the cute ones', () => {
    expect(GAME_GROUPS.map((g) => g.label)).toEqual(['mathBasher', 'Math Fun']);
    expect(gameGroupOf('alien-shoot').id).toBe('math-basher');
    expect(gameGroupOf('number-climb').id).toBe('math-basher');
    expect(gameGroupOf('frog-splash').id).toBe('math-fun');
    expect(gameGroupOf('balance-scale').id).toBe('math-fun');
    expect(gameGroupById('math-fun').games).toContain('bunny-garden');
  });

  it('group ids are unique and no group is empty', () => {
    expect(new Set(GAME_GROUPS.map((g) => g.id)).size).toBe(GAME_GROUPS.length);
    for (const g of GAME_GROUPS) expect(g.games.length, g.id).toBeGreaterThan(0);
  });
});

describe('Game Select tile pictures (sprint 2.13.1)', () => {
  it('one frame per math game, in the drawing script order', () => {
    const script = readFileSync(resolve(ROOT, 'scripts/sprites/game-icons.mjs'), 'utf8');
    const order = /export const ORDER = \[([^\]]*)\]/.exec(script)?.[1].match(/'[^']+'/g);
    expect(order?.map((s) => s.slice(1, -1))).toEqual(
      Object.entries(GAME_ICON_SHEET.frames)
        .sort(([, a], [, b]) => a - b)
        .map(([id]) => id),
    );
    expect(Object.keys(GAME_ICON_SHEET.frames).sort()).toEqual([...MATH_GAME_IDS].sort());
    expect(/export const FRAME = (\d+)/.exec(script)?.[1]).toBe(String(GAME_ICON_SHEET.frame));
  });

  it('the sheet is boot-loaded and its size matches the frames', async () => {
    const entry = SPRITE_MANIFEST.find((e) => e.key === GAME_ICON_SHEET.key);
    expect(entry?.scope).toBe('eager');
    expect(entry?.frameWidth).toBe(GAME_ICON_SHEET.frame);
    const meta = await sharp(resolve(ROOT, 'public', (entry?.url ?? '').replace(/^\//, ''))).metadata();
    expect(meta.width).toBe(GAME_ICON_SHEET.frame * MATH_GAME_IDS.length);
    expect(meta.height).toBe(GAME_ICON_SHEET.frame);
  });
});
