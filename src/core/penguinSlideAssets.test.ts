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
  GAME_BG_MAP,
  PENGUIN_POSE_COUNT,
  PENGUIN_SHEET,
  PenguinSlideSceneryKeys,
  PenguinSpriteKeys,
  SLIDE_FISH_SHEET,
  SNOWBALL_SHEET,
  SPRITE_MANIFEST,
  spritePath,
} from '@/core/spriteKeys';
import {
  AUDIO_MANIFEST,
  GAME_MIDGROUND_MAP,
  GAME_MUSIC_MAP,
  pickRandomPenguinBonkSfx,
  pickRandomPenguinGulpSfx,
  pickRandomPenguinHopSfx,
  pickRandomPenguinSwishSfx,
} from '@/core/audioKeys';
import { config } from '@/core/config';

/**
 * Sprint 2.7 — Penguin Slide's art is drawn by `scripts/sprites/{penguin,
 * fish,snowhill}.mjs`; the geometry the game uses lives in `spriteKeys.ts`
 * and `config.penguinSlide`. Guards the two against drifting apart, checks
 * every game-scoped file is on disk, and that nothing new loads at boot.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = resolve(ROOT, 'public');
const onDisk = (url: string): string => resolve(PUBLIC, url.replace(/^\//, ''));
const script = (name: string): string => readFileSync(resolve(ROOT, 'scripts/sprites', name), 'utf8');
const exported = (src: string, name: string): number =>
  Number(new RegExp(`export const ${name} = (\\d+);`).exec(src)![1]);

describe('Penguin Slide assets', () => {
  it('penguin sheets: every colorway, every pose, at the declared frame size', async () => {
    const src = script('penguin.mjs');
    expect(exported(src, 'FRAME')).toBe(PENGUIN_SHEET.frame);
    expect(src).toContain("export const POSES = ['slide', 'leanLeft', 'leanRight', 'gulp', 'bonk', 'cheer'];");
    expect(Object.keys(PENGUIN_SHEET.poses)).toEqual(['slide', 'leanLeft', 'leanRight', 'gulp', 'bonk', 'cheer']);
    for (const key of Object.values(PenguinSpriteKeys)) {
      const meta = await sharp(onDisk(spritePath('hero', key))).metadata();
      expect([meta.width, meta.height], key).toEqual([PENGUIN_SHEET.frame * PENGUIN_POSE_COUNT, PENGUIN_SHEET.frame]);
    }
  });

  it('fish + snowball sheets match the generator', async () => {
    const src = script('fish.mjs');
    expect(exported(src, 'FRAME')).toBe(SLIDE_FISH_SHEET.frame);
    expect(exported(src, 'WIGGLE_FRAMES')).toBe(SLIDE_FISH_SHEET.wiggleFrames);
    const fish = await sharp(onDisk(spritePath('hero', SLIDE_FISH_SHEET.key))).metadata();
    expect([fish.width, fish.height]).toEqual([
      SLIDE_FISH_SHEET.frame * SLIDE_FISH_SHEET.wiggleFrames,
      SLIDE_FISH_SHEET.frame * SLIDE_FISH_SHEET.colours,
    ]);
    const snow = await sharp(onDisk(spritePath('hero', SNOWBALL_SHEET.key))).metadata();
    expect([snow.width, snow.height]).toEqual([SNOWBALL_SHEET.frame * SNOWBALL_SHEET.frames, SNOWBALL_SHEET.frame]);
  });

  it('the hill (game) and its darkened copy (menus) are 1280×720 and the horizon matches config', async () => {
    const src = script('snowhill.mjs');
    expect(exported(src, 'HORIZON_Y')).toBe(config.penguinSlide.horizonY);
    expect(src).toContain('export const MENU_BRIGHTNESS = 0.42;');
    expect(GAME_BG_MAP['penguin-slide']).toBe(BgSpriteKeys.PenguinSlide);
    for (const key of [PenguinSlideSceneryKeys.Hill, BgSpriteKeys.PenguinSlide]) {
      const bg = await sharp(onDisk(spritePath('bg', key))).metadata();
      expect([bg.width, bg.height], key).toEqual([1280, 720]);
    }
  });

  it('every game:penguin-slide sprite exists and nothing else of its art loads at boot', () => {
    const sprites = SPRITE_MANIFEST.filter((e) => e.scope === 'game:penguin-slide');
    expect(sprites.map((e) => e.key).sort()).toEqual(
      [
        ...Object.values(PenguinSpriteKeys),
        SLIDE_FISH_SHEET.key,
        SNOWBALL_SHEET.key,
        PenguinSlideSceneryKeys.Hill,
      ].sort(),
    );
    for (const e of sprites) expect(existsSync(onDisk(e.url)), e.url).toBe(true);
  });

  it('plays its own music, slides and hops (game-scoped, no ambience yet) and the files exist', () => {
    expect(GAME_MUSIC_MAP['penguin-slide']).toBe('loop-8');
    expect(GAME_MIDGROUND_MAP['penguin-slide']).toEqual([]);
    const audio = AUDIO_MANIFEST.filter((e) => e.scope === 'game:penguin-slide');
    expect(audio.map((e) => e.key).sort()).toEqual(
      ['loop-8', 'penguin-hop-1', 'penguin-hop-2', 'penguin-hop-3', 'snow-slide-1', 'snow-slide-2'].sort(),
    );
    const scopeOf = (k: string) => AUDIO_MANIFEST.find((e) => e.key === k)?.scope;
    for (let i = 0; i < 20; i++) {
      expect(scopeOf(pickRandomPenguinSwishSfx())).toBe('game:penguin-slide');
      expect(scopeOf(pickRandomPenguinHopSfx())).toBe('game:penguin-slide');
    }
    for (const e of audio) expect(existsSync(onDisk(e.url)), e.url).toBe(true);
  });

  it('placeholder gulp and bonk are existing boot-loaded effects (until the owner sounds arrive)', () => {
    for (const key of [pickRandomPenguinGulpSfx(), pickRandomPenguinBonkSfx()]) {
      expect(AUDIO_MANIFEST.find((e) => e.key === key)?.scope, key).toBe('eager');
    }
  });

  it('5 lanes leave room for the widest answer badge', () => {
    const { left, right } = config.penguinSlide.lanes;
    const laneWidth = (right - left) / config.penguinSlide.speed.fast.fishCount;
    expect(config.penguinSlide.badge.maxWidthPx).toBeLessThan(laneWidth);
  });
});
