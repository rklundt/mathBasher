// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mulberry32 } from '@/test-utils/mulberry32';
import { config } from '@/core/config';
import {
  cameraScrollY,
  hopPoint,
  isPadOnScreen,
  padXs,
  pickPadLooks,
  pickTappedPad,
  riverLayout,
  rowAnswers,
  rowDirection,
} from '@/game/systems/frogSplashMath';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = config.frogSplash;
const layout = riverLayout({
  rows: 12,
  rowSpacingPx: cfg.rowSpacingPx,
  shoreGapPx: cfg.shoreGapPx,
  bankHeightPx: cfg.bankHeightPx,
});

describe('riverLayout', () => {
  it('has one row per question, evenly spaced, between the shorelines', () => {
    expect(layout.rowY).toHaveLength(12);
    for (let i = 1; i < 12; i++) expect(layout.rowY[i - 1]! - layout.rowY[i]!).toBe(cfg.rowSpacingPx);
    expect(layout.nearShoreY - layout.rowY[0]!).toBe(cfg.shoreGapPx);
    expect(layout.rowY[11]! - layout.farShoreY).toBe(cfg.shoreGapPx);
  });

  it('starts the frog on the near bank and finishes it on the far bank', () => {
    expect(layout.startY).toBeGreaterThan(layout.nearShoreY);
    expect(layout.startY).toBeLessThan(layout.worldHeight);
    expect(layout.finishY).toBeLessThan(layout.farShoreY);
    expect(layout.finishY).toBeGreaterThan(0);
  });
});

describe('rows + pads', () => {
  it('alternates drift direction row by row', () => {
    expect([0, 1, 2, 3].map(rowDirection)).toEqual([1, -1, 1, -1]);
  });

  it('spaces pads evenly and wraps them across the extended span', () => {
    const xs = padXs(4, 1280, 200, 0);
    expect(xs).toEqual([-100, 270, 640, 1010]);
    // Drifting a full span brings every pad back to the same place.
    expect(padXs(4, 1280, 200, 1480)).toEqual(xs);
    // Any drift keeps pads inside [-extra/2, width + extra/2).
    for (const off of [-5000, -333, 77, 999, 12345]) {
      for (const x of padXs(3, 1280, 200, off)) {
        expect(x).toBeGreaterThanOrEqual(-100);
        expect(x).toBeLessThan(1380);
      }
    }
  });

  it('keeps pads at least a pad apart, so they never overlap', () => {
    const minGap = (1280 + cfg.pad.wrapExtraPx) / 4;
    expect(minGap).toBeGreaterThan(cfg.pad.displayPx);
  });

  it('assigns the right answer to exactly one pad in every row', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const count of [2, 3, 4]) {
        const row = rowAnswers({ choices: [3, 7, 5, 9], correctAnswer: 7, count, rng: mulberry32(seed) });
        expect(row).toHaveLength(count);
        expect(row.filter((p) => p.answer === 7)).toHaveLength(1);
        expect(new Set(row.map((p) => p.answer)).size).toBe(count);
      }
    }
  });

  it('labels fraction pads with their display strings', () => {
    const row = rowAnswers({
      choices: [0.5, 0.25, 0.75, 1],
      correctAnswer: 0.25,
      choiceDisplays: ['1/2', '1/4', '3/4', '1'],
      count: 4,
      rng: mulberry32(4),
    });
    for (const p of row) expect(p.display).toBe(['1/2', '1/4', '3/4', '1'][[0.5, 0.25, 0.75, 1].indexOf(p.answer)]);
  });
});

describe('taps', () => {
  const r = 66;
  it('picks the nearest on-screen pad within the slop radius', () => {
    const pads = [
      { x: 300, y: 500 },
      { x: 420, y: 500 },
    ];
    expect(pickTappedPad({ x: 400, y: 500 }, pads, r, 1.15, 1280)).toBe(1);
    expect(pickTappedPad({ x: 900, y: 500 }, pads, r, 1.15, 1280)).toBe(-1);
  });

  it('ignores pads that have drifted off screen', () => {
    const pads = [{ x: -80, y: 500 }];
    expect(isPadOnScreen(-80, r, 1280)).toBe(false);
    expect(pickTappedPad({ x: -20, y: 500 }, pads, r, 1.15, 1280)).toBe(-1);
  });
});

describe('camera + hop', () => {
  it('keeps the frog at the configured screen height, clamped to the world', () => {
    expect(cameraScrollY(layout.startY, 720, 0.7, layout.worldHeight)).toBe(layout.worldHeight - 720);
    expect(cameraScrollY(layout.finishY, 720, 0.7, layout.worldHeight)).toBe(0);
    const mid = layout.rowY[5]!;
    expect(cameraScrollY(mid, 720, 0.7, layout.worldHeight)).toBeCloseTo(mid - 504);
  });

  it('arcs the hop and lands exactly on the target', () => {
    const from = { x: 100, y: 600 };
    const to = { x: 300, y: 450 };
    expect(hopPoint(from, to, 0, 70)).toMatchObject({ x: 100, y: 600, lift: 0 });
    expect(hopPoint(from, to, 1, 70).x).toBeCloseTo(300);
    expect(hopPoint(from, to, 1, 70).y).toBeCloseTo(450);
    const top = hopPoint(from, to, 0.5, 70);
    expect(top.lift).toBeCloseTo(1);
    expect(top.y).toBeCloseTo(525 - 70);
  });
});

describe('Frog Splash config', () => {
  it('mirrors Space Escape: 2 / 3 / 4 pads, less time and faster drift as it gets harder', () => {
    const { slow, medium, fast } = cfg.speed;
    expect([slow.padCount, medium.padCount, fast.padCount]).toEqual([2, 3, 4]);
    expect(medium.countdownSec).toBeLessThan(slow.countdownSec);
    expect(fast.countdownSec).toBeLessThan(medium.countdownSec);
    expect(medium.driftPxPerSec).toBeGreaterThan(slow.driftPxPerSec);
    expect(fast.driftPxPerSec).toBeGreaterThan(medium.driftPxPerSec);
  });

  it('bank height matches the river art generator', () => {
    const pond = readFileSync(resolve(__dirname, '../../../scripts/sprites/pond.mjs'), 'utf8');
    expect(Number(pond.match(/export const BANK_H = (\d+);/)?.[1])).toBe(cfg.bankHeightPx);
  });
});

describe('pickPadLooks', () => {
  it('never puts the same look next to itself, across the wrap too', () => {
    const rng = mulberry32(7);
    for (let trial = 0; trial < 300; trial++) {
      for (const count of [2, 3, 4]) {
        const looks = pickPadLooks(count, 8, rng);
        expect(looks).toHaveLength(count);
        for (let i = 0; i < count; i++) {
          expect(looks[i]).toBeGreaterThanOrEqual(0);
          expect(looks[i]).toBeLessThan(8);
          expect(looks[i]).not.toBe(looks[(i + 1) % count]);
        }
      }
    }
  });

  it('uses every look over many rows', () => {
    const rng = mulberry32(11);
    const seen = new Set<number>();
    for (let n = 0; n < 200; n++) for (const l of pickPadLooks(4, 8, rng)) seen.add(l);
    expect(seen.size).toBe(8);
  });

  it('keeps pads apart even at the biggest size', () => {
    const biggest = config.frogSplash.pad.displayPx * (1 + config.frogSplash.pad.sizeJitter);
    expect((1280 + config.frogSplash.pad.wrapExtraPx) / 4).toBeGreaterThan(biggest);
  });
});
