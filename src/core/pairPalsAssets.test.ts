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
  PAIR_PALS_BACKDROP_KEYS,
  PAIR_PALS_PICTURE_KEYS,
  PAIR_PALS_SHEETS,
  SPRITE_MANIFEST,
} from '@/core/spriteKeys';
import {
  AUDIO_MANIFEST,
  GAME_MIDGROUND_MAP,
  GAME_MUSIC_MAP,
  pickPairPalsMatchSfx,
  pickPairPalsMissSfx,
  pickTileFlipSfx,
} from '@/core/audioKeys';
import { isGameScope } from '@/core/assetScope';
import { MATH_GAME_IDS, isMathGameId, type MathGameId } from '@/core/gameIds';
import { config } from '@/core/config';

/**
 * Sprint 2.13 — Pair Pals' art comes from `scripts/sprites/pairpals.mjs`;
 * the frame sizes the scene uses live in `spriteKeys.ts`
 * (`PAIR_PALS_SHEETS`) and `config.pairPals`. Guards the two against
 * drifting apart, checks every file is on disk and game-scoped, and that
 * every sound the game plays loads with it (some are borrowed).
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = resolve(ROOT, 'public');
const onDisk = (url: string): string => resolve(PUBLIC, url.replace(/^\//, ''));
const script = readFileSync(resolve(ROOT, 'scripts/sprites/pairpals.mjs'), 'utf8');
const scriptNumber = (name: string): number => {
  const m = new RegExp(`export const ${name} = (\\d+);`).exec(script);
  if (!m) throw new Error(`pairpals.mjs has no ${name}`);
  return Number(m[1]);
};

describe('Pair Pals assets (sprint 2.13)', () => {
  const keys = [
    ...Object.values(PAIR_PALS_PICTURE_KEYS),
    PAIR_PALS_SHEETS.cards.key,
    ...Object.values(PAIR_PALS_BACKDROP_KEYS),
  ];
  const entries = SPRITE_MANIFEST.filter((e) => keys.includes(e.key));

  it('every piece is on disk and game-scoped; the setup backdrop is the darkened one', () => {
    expect(GAME_BG_MAP['pair-pals']).toBe(BgSpriteKeys.PairPals);
    expect(entries.length).toBe(keys.length);
    for (const e of entries) {
      expect(e.scope, e.key).toBe('game:pair-pals');
      expect(existsSync(onDisk(e.url)), e.url).toBe(true);
    }
  });

  it('frames match the drawing script, the themes and the files', async () => {
    expect(PAIR_PALS_SHEETS.picture.frame).toBe(scriptNumber('PICTURE'));
    expect(PAIR_PALS_SHEETS.cards.frame).toBe(scriptNumber('CARD'));
    expect(config.pairPals.picturesPerTheme).toBe(scriptNumber('PICTURES_PER_THEME'));
    const themes = /export const THEMES = \[([^\]]*)\]/.exec(script)?.[1].replace(/['\s]/g, '').split(',');
    expect(themes).toEqual([...config.pairPals.themes]);
    expect(PAIR_PALS_SHEETS.cards.faceFrame).toBe(config.pairPals.themes.length);

    const cols = scriptNumber('PICTURE_COLS');
    for (const theme of config.pairPals.themes) {
      const e = entries.find((x) => x.key === PAIR_PALS_PICTURE_KEYS[theme])!;
      expect(e.frameWidth).toBe(PAIR_PALS_SHEETS.picture.frame);
      const meta = await sharp(onDisk(e.url)).metadata();
      expect(meta.width, theme).toBe(cols * PAIR_PALS_SHEETS.picture.frame);
      expect(meta.height, theme).toBe(
        Math.ceil(config.pairPals.picturesPerTheme / cols) * PAIR_PALS_SHEETS.picture.frame,
      );
    }
    const cards = entries.find((x) => x.key === PAIR_PALS_SHEETS.cards.key)!;
    const meta = await sharp(onDisk(cards.url)).metadata();
    expect(meta.width).toBe((PAIR_PALS_SHEETS.cards.faceFrame + 1) * PAIR_PALS_SHEETS.cards.frame);
  });

  it('every sound it plays loads with it (its own flips, and the borrowed results and music)', () => {
    const played = new Set<string>([GAME_MUSIC_MAP['pair-pals'], ...GAME_MIDGROUND_MAP['pair-pals']]);
    for (let i = 0; i < 40; i++) {
      played.add(pickTileFlipSfx());
      played.add(pickPairPalsMatchSfx());
      played.add(pickPairPalsMissSfx());
    }
    for (const key of played) {
      const e = AUDIO_MANIFEST.find((x) => x.key === key);
      expect(e, key).toBeDefined();
      const loaded = isGameScope(e!.scope, 'pair-pals') || e!.scope === 'eager' || e!.alsoFor?.includes('pair-pals');
      expect(loaded, key).toBe(true);
    }
    // The four flips are its own and stay out of boot.
    for (const n of [1, 2, 3, 4]) {
      expect(AUDIO_MANIFEST.find((x) => x.key === `tile-flip-${String(n)}`)?.scope).toBe('game:pair-pals');
    }
  });

  it('the math games are every game but the puzzles', () => {
    const all: MathGameId[] = [
      'alien-shoot',
      'asteroid-field',
      'number-climb',
      'math-a-lotl',
      'frog-splash',
      'space-shooter',
      'penguin-slide',
      'bunny-garden',
      'balance-scale',
    ];
    expect([...MATH_GAME_IDS].sort()).toEqual([...all].sort());
    expect(isMathGameId('pair-pals')).toBe(false);
    expect(all.every(isMathGameId)).toBe(true);
    // Every game has a backdrop row (the map is keyed by every game id).
    expect(Object.keys(GAME_BG_MAP).sort()).toEqual([...all, 'pair-pals'].sort());
  });
});
