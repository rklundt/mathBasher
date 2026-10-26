// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import { BALANCE_SHEETS, BalanceSceneryKeys, BgSpriteKeys, GAME_BG_MAP, SPRITE_MANIFEST } from '@/core/spriteKeys';
import {
  AUDIO_MANIFEST,
  GAME_MIDGROUND_MAP,
  GAME_MUSIC_MAP,
  audioGainFor,
  pickBalanceClankSfx,
} from '@/core/audioKeys';
import { config } from '@/core/config';

/**
 * Sprint 2.12 — Balance Scale's art is drawn by `scripts/sprites/balance.mjs`;
 * the geometry the scene uses lives in `spriteKeys.ts` (`BALANCE_SHEETS`) and
 * `config.balanceScale`. Guards the two against drifting apart, checks every
 * file is on disk, and that nothing new loads at boot.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = resolve(ROOT, 'public');
const onDisk = (url: string): string => resolve(PUBLIC, url.replace(/^\//, ''));
const script = readFileSync(resolve(ROOT, 'scripts/sprites/balance.mjs'), 'utf8');
/** `export const NAME = { a: 1, b: 2 }` → its numbers, from the script's source. */
function exportedObject(name: string): Record<string, number> {
  const m = new RegExp(`export const ${name} = \\{([^}]*)\\}`).exec(script);
  if (!m) throw new Error(`balance.mjs has no ${name}`);
  return Object.fromEntries(
    m[1]
      .split(',')
      .map((kv) => kv.split(':').map((s) => s.trim()))
      .filter(([k, v]) => k && v && !Number.isNaN(Number(v)))
      .map(([k, v]) => [k, Number(v)]),
  );
}

describe('Balance Scale assets (sprint 2.12)', () => {
  const entries = SPRITE_MANIFEST.filter((e) => e.key.startsWith('balance-') && e.key !== BgSpriteKeys.BalanceScale);

  it('every piece is on disk, game-scoped, and the backdrop is the darkened fair', () => {
    expect(GAME_BG_MAP['balance-scale']).toBe(BgSpriteKeys.BalanceScale);
    expect(entries.length).toBe(Object.keys(BalanceSceneryKeys).length + Object.keys(BALANCE_SHEETS).length);
    for (const e of entries) {
      expect(e.scope, e.key).toBe('game:balance-scale');
      expect(existsSync(onDisk(e.url)), e.url).toBe(true);
    }
  });

  it('sheet frames match the drawing script and the files', async () => {
    const pairs: Array<[keyof typeof BALANCE_SHEETS, string]> = [
      ['pillar', 'PILLAR'],
      ['beam', 'BEAM'],
      ['pan', 'PAN'],
      ['weights', 'WEIGHT'],
      ['crowd', 'CROWD'],
      ['duck', 'DUCK'],
    ];
    for (const [sheet, exp] of pairs) {
      const s = BALANCE_SHEETS[sheet];
      const src = exportedObject(exp);
      expect(s.frameWidth, sheet).toBe(src.w);
      expect(s.frameHeight, sheet).toBe(src.h);
      const entry = entries.find((e) => e.key === s.key);
      const meta = await sharp(onDisk(entry?.url ?? '')).metadata();
      expect((meta.width ?? 0) % s.frameWidth, sheet).toBe(0);
      expect((meta.height ?? 0) % s.frameHeight, sheet).toBe(0);
    }
    expect(BALANCE_SHEETS.crowd.animals.length).toBe(exportedObject('CROWD').animals);
  });

  it('the path the scene draws stones on is the one painted on the fair', () => {
    const p = exportedObject('PATH');
    const c = config.balanceScale.path;
    for (const k of ['x', 'amplitude', 'turns', 'bottomY', 'topY', 'stones'] as const) expect(c[k], k).toBe(p[k]);
  });

  it("plays the owner's music, game-scoped, and no ambience", () => {
    expect(GAME_MUSIC_MAP['balance-scale']).toBe('loop-10');
    expect(GAME_MIDGROUND_MAP['balance-scale']).toEqual([]);
    const music = AUDIO_MANIFEST.find((e) => e.key === 'loop-10');
    expect(music?.scope).toBe('game:balance-scale');
    expect(existsSync(onDisk(music?.url ?? ''))).toBe(true);
  });

  it("the owner's mismatch clank: three, game-scoped, quieter than other sounds, never twice running", () => {
    const clanks = AUDIO_MANIFEST.filter((e) => e.key.startsWith('balance-clank-'));
    expect(clanks).toHaveLength(3);
    for (const e of clanks) {
      expect(e.scope, e.key).toBe('game:balance-scale');
      expect(existsSync(onDisk(e.url)), e.url).toBe(true);
      expect(audioGainFor(e.key)).toBeLessThan(1);
    }
    let prev = pickBalanceClankSfx();
    for (let i = 0; i < 30; i++) {
      const next = pickBalanceClankSfx();
      expect(next).not.toBe(prev);
      prev = next;
    }
  });

  it('the tray has room for five weights', () => {
    const T = config.balanceScale.tray;
    const most = Math.max(...Object.values(config.balanceScale.speed).map((s) => s.weights));
    const step = (T.right - T.left) / (most - 1);
    expect(step).toBeGreaterThanOrEqual(BALANCE_SHEETS.weights.frameWidth * T.scale + 20);
  });
});
