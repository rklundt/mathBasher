// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import {
  BgSpriteKeys,
  BUNNY_POSE_COUNT,
  BUNNY_SHEET,
  BunnyGardenSceneryKeys,
  BunnySpriteKeys,
  GAME_BG_MAP,
  GARDEN_SHEETS,
  SPRITE_MANIFEST,
  spritePath,
} from '@/core/spriteKeys';
import {
  AUDIO_MANIFEST,
  GAME_MIDGROUND_MAP,
  GAME_MUSIC_MAP,
  pickRandomBunnyHideSfx,
  pickRandomBunnyHopSfx,
  pickRandomBunnyMoleSfx,
  pickRandomBunnyPopSfx,
} from '@/core/audioKeys';
import { config } from '@/core/config';

/**
 * Sprint 2.8 — Bunny Garden's art is drawn by `scripts/sprites/{bunny,
 * carrot,garden}.mjs`; the geometry the game uses lives in `spriteKeys.ts`
 * and `config.bunnyGarden`. Guards the two against drifting apart, checks
 * every game-scoped file is on disk, and that nothing new loads at boot
 * except the menu backdrop.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = resolve(ROOT, 'public');
const onDisk = (url: string): string => resolve(PUBLIC, url.replace(/^\//, ''));
const script = (name: string): string => readFileSync(resolve(ROOT, 'scripts/sprites', name), 'utf8');
const exported = (src: string, name: string): number =>
  Number(new RegExp(`export const ${name} = (\\d+);`).exec(src)![1]);

describe('Bunny Garden assets', () => {
  it('bunny sheets: every colorway, every pose, at the declared frame size', async () => {
    const src = script('bunny.mjs');
    expect(exported(src, 'FRAME')).toBe(BUNNY_SHEET.frame);
    expect(src).toContain("export const POSES = ['idle', 'hop', 'pull', 'happy', 'oops', 'cheer'];");
    expect(Object.keys(BUNNY_SHEET.poses)).toEqual(['idle', 'hop', 'pull', 'happy', 'oops', 'cheer']);
    for (const key of Object.values(BunnySpriteKeys)) {
      const meta = await sharp(onDisk(spritePath('hero', key))).metadata();
      expect([meta.width, meta.height], key).toEqual([BUNNY_SHEET.frame * BUNNY_POSE_COUNT, BUNNY_SHEET.frame]);
    }
  });

  it('carrot, mole, hole and basket sheets match the generator', async () => {
    const src = script('carrot.mjs');
    const { carrots, mole, hole, basket } = GARDEN_SHEETS;
    expect(exported(src, 'CARROT_FRAME')).toBe(carrots.frame);
    expect(exported(src, 'CARROT_KINDS')).toBe(carrots.kinds);
    expect(exported(src, 'CARROT_FRAMES')).toBe(carrots.frames);
    expect(exported(src, 'MOLE_FRAMES')).toBe(mole.frames);
    expect(exported(src, 'HOLE_W')).toBe(hole.frameWidth);
    expect(exported(src, 'HOLE_H')).toBe(hole.frameHeight);
    expect(exported(src, 'BASKET_W')).toBe(basket.frameWidth);
    expect(exported(src, 'BASKET_H')).toBe(basket.frameHeight);
    const size = async (key: string): Promise<number[]> => {
      const m = await sharp(onDisk(spritePath('hero', key))).metadata();
      return [m.width ?? 0, m.height ?? 0];
    };
    expect(await size(carrots.key)).toEqual([carrots.frame * carrots.frames, carrots.frame * carrots.kinds]);
    expect(await size(mole.key)).toEqual([mole.frame * mole.frames, mole.frame]);
    expect(await size(hole.key)).toEqual([hole.frameWidth * 2, hole.frameHeight]);
    expect(await size(basket.key)).toEqual([basket.frameWidth * 2, basket.frameHeight]);
  });

  it('the garden (game) and its darkened copy (menus) are 1280×720; the holes sit inside the patch', async () => {
    const src = script('garden.mjs');
    expect(src).toContain('export const MENU_BRIGHTNESS = 0.45;');
    const top = exported(src, 'PATCH_TOP');
    const bottom = exported(src, 'PATCH_BOTTOM');
    const { holeY, cropLineY } = config.bunnyGarden;
    const halfHole = GARDEN_SHEETS.hole.frameHeight / 2;
    expect(holeY - halfHole).toBeGreaterThanOrEqual(top);
    expect(holeY + halfHole).toBeLessThanOrEqual(bottom);
    expect(cropLineY).toBeGreaterThan(holeY);
    expect(GAME_BG_MAP['bunny-garden']).toBe(BgSpriteKeys.BunnyGarden);
    for (const key of [BunnyGardenSceneryKeys.Patch, BgSpriteKeys.BunnyGarden]) {
      const bg = await sharp(onDisk(spritePath('bg', key))).metadata();
      expect([bg.width, bg.height], key).toEqual([1280, 720]);
    }
  });

  it('every game:bunny-garden sprite exists and nothing else of its art loads at boot', () => {
    const sprites = SPRITE_MANIFEST.filter((e) => e.scope === 'game:bunny-garden');
    expect(sprites.map((e) => e.key).sort()).toEqual(
      [
        ...Object.values(BunnySpriteKeys),
        GARDEN_SHEETS.carrots.key,
        GARDEN_SHEETS.mole.key,
        GARDEN_SHEETS.hole.key,
        GARDEN_SHEETS.basket.key,
        BunnyGardenSceneryKeys.Patch,
      ].sort(),
    );
    for (const e of sprites) expect(existsSync(onDisk(e.url)), e.url).toBe(true);
  });

  it('placeholder music and sounds are boot-loaded (until the owner sounds arrive)', () => {
    expect(GAME_MIDGROUND_MAP['bunny-garden']).toEqual([]);
    const scopeOf = (k: string) => AUDIO_MANIFEST.find((e) => e.key === k)?.scope;
    expect(scopeOf(GAME_MUSIC_MAP['bunny-garden'])).toBe('eager');
    for (const pick of [pickRandomBunnyHopSfx, pickRandomBunnyPopSfx, pickRandomBunnyMoleSfx, pickRandomBunnyHideSfx]) {
      expect(scopeOf(pick()), pick.name).toBe('eager');
    }
  });

  it('5 holes leave lanes wide enough to tap on a phone, and room for the widest sign', () => {
    const { left, right } = config.bunnyGarden.lanes;
    const laneWidth = (right - left) / config.bunnyGarden.speed.fast.holeCount;
    expect(laneWidth).toBeGreaterThanOrEqual(170);
    expect(GARDEN_SHEETS.hole.frameWidth * config.bunnyGarden.hole.scale).toBeLessThanOrEqual(laneWidth);
  });

  it('taps never count on the Q1 hint or the basket', () => {
    const { tapWindow, tapHint, basket, lanes } = config.bunnyGarden;
    expect(tapWindow.top).toBeGreaterThan(tapHint.y + tapHint.heightPx / 2);
    expect(tapWindow.left).toBeGreaterThanOrEqual(lanes.left);
    expect(basket.x + (GARDEN_SHEETS.basket.frameWidth * basket.scale) / 2).toBeLessThanOrEqual(tapWindow.left);
  });
});
