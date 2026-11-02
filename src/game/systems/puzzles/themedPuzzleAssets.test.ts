// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import {
  GAME_BG_MAP,
  PUZZLE_ICON_SHEET_2,
  PUZZLE_PICS_SHEET,
  PUZZLE_SHEETS,
  PUZZLE_THEME_ART,
  SPRITE_MANIFEST,
  THEME_COUNTERS_SHEET,
  THEME_FLYERS_SHEET,
  THEME_MACHINES_SHEET,
} from '@/core/spriteKeys';
import { AUDIO_MANIFEST, PUZZLE_THEME_SOUNDS } from '@/core/audioKeys';
import { isGameScope } from '@/core/assetScope';
import { ROUND_PUZZLE_IDS, THEMED_PUZZLE_IDS } from '@/core/gameIds';
import { PUZZLE_GROUPS } from '@/core/gameGroups';
import { PUZZLES } from '@/core/puzzles';
import { PUZZLE_THEMES } from '@/core/puzzleThemes';
import { PICTURE_WORDS } from '@/game/systems/puzzles/wordData';

/**
 * Sprint 2.16 — the Words and Numbers puzzles' art comes from
 * `scripts/sprites/themes.mjs`. Guards the script, the sheets and the game
 * against drifting apart, and checks every puzzle loads both looks.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const onDisk = (url: string): string => resolve(ROOT, 'public', url.replace(/^\//, ''));
const script = readFileSync(resolve(ROOT, 'scripts/sprites/themes.mjs'), 'utf8');
const entry = (key: string) => SPRITE_MANIFEST.find((e) => e.key === key);

function scriptList(name: string): string[] {
  const start = script.indexOf(`export const ${name} = [`);
  if (start < 0) throw new Error(`themes.mjs has no ${name}`);
  const body = script.slice(script.indexOf('[', start), script.indexOf('];', start) + 1);
  return [...body.matchAll(/'([\w-]+)'/g)].map((m) => m[1]);
}

const loadsFor = (key: string, id: string): boolean => {
  const e = entry(key);
  if (!e) return false;
  return e.scope === 'eager' || isGameScope(e.scope, id as never) || (e.alsoFor?.includes(id as never) ?? false);
};

describe('Words and Numbers art (sprint 2.16)', () => {
  it('the script draws the pictures in the game’s word order, and the tile pictures in the sheet’s', () => {
    expect(scriptList('PICS')).toEqual([...PICTURE_WORDS]);
    expect(scriptList('ICON_ORDER')).toEqual([...THEMED_PUZZLE_IDS]);
    expect(
      Object.entries(PUZZLE_ICON_SHEET_2.frames)
        .sort((a, b) => a[1] - b[1])
        .map(([k]) => k),
    ).toEqual([...THEMED_PUZZLE_IDS]);
    expect(entry(PUZZLE_ICON_SHEET_2.key)?.scope).toBe('eager');
  });

  it('every sheet is on disk at the size its frames say', async () => {
    const size = async (key: string) => sharp(onDisk(entry(key)!.url)).metadata();
    const pics = await size(PUZZLE_PICS_SHEET.key);
    expect([pics.width, pics.height]).toEqual([
      PUZZLE_PICS_SHEET.cols * PUZZLE_PICS_SHEET.frame,
      Math.ceil(PICTURE_WORDS.length / PUZZLE_PICS_SHEET.cols) * PUZZLE_PICS_SHEET.frame,
    ]);
    for (const art of Object.values(PUZZLE_THEME_ART)) {
      // Two dancers to a row (each row whole poses), every frame filled, and under phones' 4096 px limit.
      const d = await size(art.dancers.key);
      const cols = d.width / art.dancers.frameWidth;
      expect(cols % art.dancers.poses, art.dancers.key).toBe(0);
      expect(cols * (d.height / art.dancers.frameHeight), art.dancers.key).toBe(
        art.dancers.characters * art.dancers.poses,
      );
      expect(Math.max(d.width, d.height), art.dancers.key).toBeLessThanOrEqual(4096);
      const t = await size(art.train.key);
      expect([t.width, t.height], art.train.key).toEqual([
        (art.train.cars + 1) * art.train.frameWidth,
        art.train.frameHeight,
      ]);
      for (const bg of art.backdrops) expect(existsSync(onDisk(entry(bg)!.url)), bg).toBe(true);
    }
    const m = await size(THEME_MACHINES_SHEET.key);
    expect([m.width, m.height]).toEqual([3 * THEME_MACHINES_SHEET.frame, THEME_MACHINES_SHEET.frame]);
    const c = await size(THEME_COUNTERS_SHEET.key);
    expect([c.width, c.height]).toEqual([16 * THEME_COUNTERS_SHEET.frame, THEME_COUNTERS_SHEET.frame]);
    const fl = await size(THEME_FLYERS_SHEET.key);
    expect([fl.width, fl.height]).toEqual([8 * THEME_FLYERS_SHEET.frame, THEME_FLYERS_SHEET.frame]);
    // Each look draws from its own frames, never the other's.
    const { critters, cosmos } = PUZZLE_THEME_ART;
    expect(critters.counters.filter((f) => cosmos.counters.includes(f))).toEqual([]);
    expect(critters.flyers.map((f) => f.frame).filter((f) => cosmos.flyers.some((g) => g.frame === f))).toEqual([]);
    const icons = await size(PUZZLE_ICON_SHEET_2.key);
    expect([icons.width, icons.height]).toEqual([THEMED_PUZZLE_IDS.length * 96, 96]);
  });

  it('every Words and Numbers puzzle loads both looks, the pictures, its setup backdrop and its sounds', () => {
    for (const id of THEMED_PUZZLE_IDS) {
      expect(loadsFor(PUZZLE_PICS_SHEET.key, id), `${id} pics`).toBe(true);
      for (const look of PUZZLE_THEMES) {
        const art = PUZZLE_THEME_ART[look.id];
        expect(loadsFor(art.dancers.key, id), `${id} ${look.id} dancers`).toBe(true);
        for (const bg of art.backdrops) expect(loadsFor(bg, id), `${id} ${bg}`).toBe(true);
        expect(PUZZLE_THEME_SOUNDS[look.id].music.length).toBeGreaterThan(0);
      }
      expect(existsSync(onDisk(entry(GAME_BG_MAP[id])!.url)), id).toBe(true);
    }
    expect(loadsFor(PUZZLE_SHEETS.train.key, 'word-train')).toBe(true);
    expect(loadsFor(PUZZLE_SHEETS.train.key, 'number-train')).toBe(true);
    expect(loadsFor(PUZZLE_SHEETS.wand.key, 'word-wand')).toBe(true);
    expect(loadsFor(THEME_MACHINES_SHEET.key, 'number-machine')).toBe(true);
    expect(loadsFor(THEME_COUNTERS_SHEET.key, 'quick-count')).toBe(true);
    expect(loadsFor(THEME_FLYERS_SHEET.key, 'letter-garden')).toBe(true);
  });

  it("each look plays its own tracks, each on disk and loaded only when it's played", () => {
    const { critters, cosmos } = PUZZLE_THEME_SOUNDS;
    expect(new Set(critters.music).size).toBe(5);
    expect(new Set(cosmos.music).size).toBe(6);
    expect(critters.music.filter((k) => cosmos.music.includes(k))).toEqual([]);
    for (const key of [...critters.music, ...cosmos.music]) {
      const e = AUDIO_MANIFEST.find((x) => x.key === key);
      expect(e, key).toBeDefined();
      expect(e!.kind, key).toBe('music');
      expect(e!.onDemand, key).toBe(true);
      expect(e!.scope, key).not.toBe('eager');
      expect(existsSync(onDisk(e!.url)), e!.url).toBe(true);
    }
  });
});

describe('the puzzles’ groups (sprint 2.16)', () => {
  it('every puzzle is in exactly one group, in the subject’s order', () => {
    const all = ['pair-pals', ...ROUND_PUZZLE_IDS];
    for (const id of all) expect(PUZZLE_GROUPS.filter((g) => g.games.includes(id as never)).length, id).toBe(1);
    expect(PUZZLE_GROUPS.flatMap((g) => g.games)).toEqual(PUZZLES.map((p) => p.id));
    expect(PUZZLE_GROUPS.map((g) => g.label)).toEqual(['Visual', 'Words', 'Numbers']);
  });
});
