// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import {
  BALANCE_SHEETS,
  GAME_BG_MAP,
  PAIR_PALS_PICTURE_KEYS,
  PUZZLE_BACKDROP_KEYS,
  PUZZLE_ICON_SHEET,
  PUZZLE_SHEETS,
  SPRITE_MANIFEST,
} from '@/core/spriteKeys';
import { AUDIO_MANIFEST, COPY_CAT_VOICES, GAME_MUSIC_MAP, PAIR_PALS_MUSIC } from '@/core/audioKeys';
import { isGameScope } from '@/core/assetScope';
import { ROUND_PUZZLE_IDS } from '@/core/gameIds';
import { config } from '@/core/config';

/**
 * Sprint 2.14 — the puzzle pack's art comes from `scripts/sprites/puzzles.mjs`;
 * the shapes, colours, hats and spin shapes the generators use live in
 * `config.puzzles`, the frame sizes in `spriteKeys.ts`. Guards them against
 * drifting apart, checks every file is on disk, and that each puzzle loads
 * everything it draws and plays (some of it shared with other games).
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = resolve(ROOT, 'public');
const onDisk = (url: string): string => resolve(PUBLIC, url.replace(/^\//, ''));
const script = readFileSync(resolve(ROOT, 'scripts/sprites/puzzles.mjs'), 'utf8');
const P = config.puzzles;

/** `export const NAME = [ … ];` from the script, as data (comments dropped). */
function scriptArray(name: string): unknown {
  const start = script.indexOf(`export const ${name} = [`);
  if (start < 0) throw new Error(`puzzles.mjs has no ${name}`);
  const end = script.indexOf('];', start);
  const body = script
    .slice(start + `export const ${name} = `.length, end + 1)
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'/g, '"')
    .replace(/,\s*\]/g, ']');
  return JSON.parse(body);
}
const scriptNumber = (name: string): number => {
  const m = new RegExp(`export const ${name} = (\\d+);`).exec(script);
  if (!m) throw new Error(`puzzles.mjs has no ${name}`);
  return Number(m[1]);
};
const entry = (key: string) => SPRITE_MANIFEST.find((e) => e.key === key);
const loadsFor = (key: string, id: string): boolean => {
  const e = entry(key) ?? AUDIO_MANIFEST.find((a) => a.key === key);
  if (!e) return false;
  return (
    e.scope === 'eager' ||
    e.scope === 'always' ||
    isGameScope(e.scope, id as never) ||
    (e.alsoFor?.includes(id as never) ?? false)
  );
};

describe('puzzle pack assets (sprint 2.14)', () => {
  it('the script and the config agree on shapes, colours, hats and spin shapes', () => {
    expect(scriptArray('SHAPES')).toEqual([...P.shapes]);
    const colours = /export const COLOURS = \{([^}]*)\}/.exec(script)?.[1] ?? '';
    expect([...colours.matchAll(/(\w+):/g)].map((m) => m[1])).toEqual([...P.colours]);
    expect(scriptArray('HATS')).toEqual([...P.hats]);
    expect(scriptArray('SPIN_CELLS')).toEqual(P.spinCells);
    expect((scriptArray('SPIN_COLOURS') as unknown[]).length).toBe(P.spinColours);
    expect(scriptArray('PUZZLES')).toEqual([...ROUND_PUZZLE_IDS]);
  });

  it('every sheet is on disk at the size its frames say', async () => {
    const size = async (key: string) => sharp(onDisk(entry(key)!.url)).metadata();
    const t = await size(PUZZLE_SHEETS.tokens.key);
    expect([t.width, t.height]).toEqual([
      P.shapes.length * scriptNumber('TOKEN'),
      P.colours.length * scriptNumber('TOKEN'),
    ]);
    expect(PUZZLE_SHEETS.tokens.frameWidth).toBe(scriptNumber('TOKEN'));
    const s = await size(PUZZLE_SHEETS.spin.key);
    expect([s.width, s.height]).toEqual([P.spinCells.length * 128, P.spinColours * 128]);
    const h = await size(PUZZLE_SHEETS.hats.key);
    expect([h.width, h.height]).toEqual([P.hats.length * scriptNumber('HAT'), scriptNumber('HAT')]);
    const tr = await size(PUZZLE_SHEETS.train.key);
    expect([tr.width, tr.height]).toEqual([5 * PUZZLE_SHEETS.train.frameWidth, PUZZLE_SHEETS.train.frameHeight]);
    const icons = await size(PUZZLE_ICON_SHEET.key);
    expect([icons.width, icons.height]).toEqual([8 * scriptNumber('ICON'), scriptNumber('ICON')]);
    expect(existsSync(onDisk(entry(PUZZLE_SHEETS.wand.key)!.url))).toBe(true);
  });

  it('the tile pictures are in the order the script draws them, and load at boot', () => {
    const order = ['pair-pals', ...ROUND_PUZZLE_IDS];
    expect(
      Object.entries(PUZZLE_ICON_SHEET.frames)
        .sort((a, b) => a[1] - b[1])
        .map(([k]) => k),
    ).toEqual(order);
    expect(entry(PUZZLE_ICON_SHEET.key)?.scope).toBe('eager');
  });

  it('every puzzle loads what it draws and plays', () => {
    for (const id of ROUND_PUZZLE_IDS) {
      for (const key of PUZZLE_BACKDROP_KEYS[id]) {
        expect(entry(key)?.scope, key).toBe(`game:${id}`);
        expect(existsSync(onDisk(entry(key)!.url)), key).toBe(true);
      }
      expect(existsSync(onDisk(entry(GAME_BG_MAP[id])!.url)), id).toBe(true);
      // The dancers, and Pair Pals' match / miss / flip sounds.
      expect(loadsFor(BALANCE_SHEETS.crowd.key, id), `${id} crowd`).toBe(true);
      for (const k of ['pairpals-match-1', 'pairpals-miss-1', 'tile-flip-1', 'bonus-cheer-1']) {
        expect(loadsFor(k, id), `${id} ${k}`).toBe(true);
      }
      // Its music is one of the on-demand theme tracks.
      expect(Object.values(PAIR_PALS_MUSIC), id).toContain(GAME_MUSIC_MAP[id]);
    }
    for (const id of ['pattern-train', 'missing-piece', 'odd-one-out', 'magic-wand', 'symbol-hunt']) {
      expect(loadsFor(PUZZLE_SHEETS.tokens.key, id), id).toBe(true);
    }
    expect(loadsFor(PUZZLE_SHEETS.train.key, 'pattern-train')).toBe(true);
    expect(loadsFor(PUZZLE_SHEETS.hats.key, 'magic-wand')).toBe(true);
    expect(loadsFor(PUZZLE_SHEETS.wand.key, 'magic-wand')).toBe(true);
    for (const id of ['spin-match', 'odd-one-out', 'magic-wand'])
      expect(loadsFor(PUZZLE_SHEETS.spin.key, id), id).toBe(true);
    expect(loadsFor(PAIR_PALS_PICTURE_KEYS.animals, 'odd-one-out')).toBe(true);
    expect(loadsFor(PAIR_PALS_PICTURE_KEYS.desserts, 'odd-one-out')).toBe(true);
    expect(loadsFor(PAIR_PALS_PICTURE_KEYS.animals, 'copy-cat')).toBe(true);
    for (const v of COPY_CAT_VOICES) expect(loadsFor(v, 'copy-cat'), v).toBe(true);
    expect(COPY_CAT_VOICES.length).toBeGreaterThanOrEqual(P.copyCat.pads.hard);
  });
});
