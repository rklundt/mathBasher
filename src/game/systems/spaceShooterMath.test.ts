// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/test-utils/mulberry32';
import { config } from '@/core/config';
import {
  bounceOffWalls,
  collide,
  extendChoices,
  parseFractionDisplay,
  inRect,
  leanFor,
  pickShipFrames,
  pickTappedShip,
  shipAnswers,
  shipLabelLayout,
  spawnPoints,
  stepShips,
  type ShipBody,
} from '@/game/systems/spaceShooterMath';

const cfg = config.spaceShooter;
const bounds = cfg.window;
const r = cfg.ship.displayPx * cfg.ship.radiusFrac;

const ship = (x: number, y: number, heading = 0, turn = 0): ShipBody => ({ x, y, heading, turn, r });

describe('window geometry', () => {
  it('keeps every ship fully inside the cockpit window', () => {
    const half = cfg.ship.displayPx / 2;
    const tw = cfg.tapWindow;
    expect(bounds.left - half).toBeGreaterThanOrEqual(tw.left);
    expect(bounds.right + half).toBeLessThanOrEqual(tw.right);
    expect(bounds.top - half).toBeGreaterThanOrEqual(tw.top);
    expect(bounds.bottom + half).toBeLessThanOrEqual(tw.bottom);
  });

  it('has room for the most ships (Hard)', () => {
    const area = (bounds.right - bounds.left + 2 * r) * (bounds.bottom - bounds.top + 2 * r);
    expect(area).toBeGreaterThan(cfg.speed.fast.shipCount * Math.PI * r * r * 3);
  });
});

describe('flight', () => {
  it('bounces off a wall: back inside, heading turned around', () => {
    const s = ship(bounds.left - 10, 300, Math.PI); // flying left, past the left wall
    expect(bounceOffWalls(s, bounds)).toBe(true);
    expect(s.x).toBe(bounds.left);
    expect(Math.cos(s.heading)).toBeGreaterThan(0);
  });

  it('two ships flying head-on bounce apart and no longer overlap', () => {
    const a = ship(500, 300, 0);
    const b = ship(500 + r, 300, Math.PI);
    expect(collide(a, b)).toBe(true);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(2 * r, 5);
    expect(Math.cos(a.heading)).toBeLessThan(0);
    expect(Math.cos(b.heading)).toBeGreaterThan(0);
  });

  it('ships flying apart are separated but keep their headings', () => {
    const a = ship(500, 300, Math.PI);
    const b = ship(500 + r, 300, 0);
    collide(a, b);
    expect(a.heading).toBe(Math.PI);
    expect(b.heading).toBe(0);
  });

  it('over a long flight: always inside the window, never stacked, paths curve', () => {
    const rng = mulberry32(26);
    const pts = spawnPoints(cfg.speed.fast.shipCount, bounds, r * cfg.ship.spawnGapFrac, rng);
    const ships = pts.map((p) => ship(p.x, p.y, rng() * Math.PI * 2));
    const tuning = { speed: cfg.speed.fast.flyPxPerSec, maxTurn: cfg.ship.maxTurnRadPerSec, turnJitter: cfg.ship.turnJitterPerSec };
    const headings = new Set<number>();
    for (let step = 0; step < 60 * 60; step++) {
      stepShips(ships, 1 / 60, bounds, tuning, rng);
      for (const s of ships) {
        expect(inRect(s, bounds)).toBe(true);
        headings.add(Math.round(s.heading * 10));
      }
      for (let i = 0; i < ships.length; i++) {
        for (let j = i + 1; j < ships.length; j++) {
          const d = Math.hypot(ships[i]!.x - ships[j]!.x, ships[i]!.y - ships[j]!.y);
          // Pressed against a wall a pair can't always fully separate in one step.
          expect(d).toBeGreaterThan(2 * r * 0.6);
        }
      }
    }
    expect(headings.size).toBeGreaterThan(40);
  });
});

describe('spawning', () => {
  it('places every ship inside the window, well apart', () => {
    const rng = mulberry32(3);
    for (let n = 0; n < 50; n++) {
      const pts = spawnPoints(5, bounds, r * cfg.ship.spawnGapFrac, rng);
      expect(pts).toHaveLength(5);
      for (const p of pts) expect(inRect(p, bounds)).toBe(true);
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          expect(Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y)).toBeGreaterThan(2 * r);
        }
      }
    }
  });

  it('still returns the right count when the gap is impossible', () => {
    const pts = spawnPoints(5, bounds, 10_000, mulberry32(1));
    expect(pts).toHaveLength(5);
    for (const p of pts) expect(inRect(p, bounds)).toBe(true);
  });
});

describe('taps', () => {
  const ships = [
    { x: 500, y: 300 },
    { x: 650, y: 300 },
  ];
  it('picks the nearest ship within reach', () => {
    expect(pickTappedShip({ x: 620, y: 310 }, ships, r, cfg.ship.tapSlop, cfg.tapWindow)).toBe(1);
    expect(pickTappedShip({ x: 900, y: 500 }, ships, r, cfg.ship.tapSlop, cfg.tapWindow)).toBe(-1);
  });
  it('ignores taps on the cockpit around the window', () => {
    expect(pickTappedShip({ x: 100, y: 300 }, [{ x: 110, y: 300 }], r, cfg.ship.tapSlop, cfg.tapWindow)).toBe(-1);
  });
});

describe('answer labels', () => {
  const base = { textHeight: 46, portholeDiameter: 100, maxWidth: cfg.label.maxWidthPx, pillPad: 12, pillHeightPad: 10 };
  it('a short answer sits in the porthole, full size, no pill', () => {
    expect(shipLabelLayout({ ...base, textWidth: 40 })).toEqual({ scale: 1, pill: null });
  });
  it('a mixed number shrinks to fit and gets a pill wider than the porthole', () => {
    const out = shipLabelLayout({ ...base, textWidth: 160 });
    expect(out.scale).toBeCloseTo(cfg.label.maxWidthPx / 160);
    expect(out.pill).not.toBeNull();
    expect(out.pill!.width).toBeGreaterThanOrEqual(cfg.label.maxWidthPx);
    expect(out.pill!.width).toBeGreaterThanOrEqual(base.portholeDiameter);
  });
  it('a label just wider than the porthole gets a pill without shrinking', () => {
    const out = shipLabelLayout({ ...base, textWidth: 95 });
    expect(out.scale).toBe(1);
    expect(out.pill).not.toBeNull();
  });
});

describe('lean', () => {
  it('leans into turns, clamped', () => {
    expect(leanFor(0, 1.4, 8)).toBe(0);
    expect(leanFor(1.4, 1.4, 8)).toBe(8);
    expect(leanFor(-5, 1.4, 8)).toBe(-8);
  });
});

describe('waves', () => {
  it('each wave has the right answer once, no duplicates, with display labels', () => {
    const rng = mulberry32(9);
    for (let n = 0; n < 200; n++) {
      const out = shipAnswers({ choices: [3, 5, 7, 9], correctAnswer: 7, choiceDisplays: ['3', '5', '7', '9'], count: 3, rng });
      expect(out).toHaveLength(3);
      expect(out.filter((a) => a.answer === 7)).toHaveLength(1);
      expect(new Set(out.map((a) => a.answer)).size).toBe(3);
    }
    // More ships than choices: capped at the choices.
    expect(shipAnswers({ choices: [1, 2, 3, 4], correctAnswer: 2, count: 5, rng })).toHaveLength(4);
  });

  it('every ship in a wave looks different', () => {
    const rng = mulberry32(4);
    for (let n = 0; n < 100; n++) {
      const frames = pickShipFrames(5, 20, rng);
      expect(new Set(frames).size).toBe(5);
      for (const f of frames) expect(f).toBeLessThan(20);
    }
  });
});

describe('five ships on Hard', () => {
  it('parses fraction labels', () => {
    expect(parseFractionDisplay('3/4')).toEqual({ num: 3, den: 4 });
    expect(parseFractionDisplay('1 1/2')).toEqual({ num: 3, den: 2 });
    expect(parseFractionDisplay('2')).toEqual({ num: 2, den: 1 });
    expect(parseFractionDisplay('x')).toBeNull();
  });

  it('adds a nearby whole number, never negative, never a duplicate', () => {
    const rng = mulberry32(8);
    const out = extendChoices({ choices: [0, 1, 2, 3], correctAnswer: 0 }, 5, rng);
    expect(out.choices).toHaveLength(5);
    expect(new Set(out.choices).size).toBe(5);
    expect(Math.min(...out.choices)).toBeGreaterThanOrEqual(0);
    expect(out.choices.slice(0, 4)).toEqual([0, 1, 2, 3]);
  });

  it('adds a plausible fraction with a matching label', () => {
    const rng = mulberry32(2);
    const q = { choices: [0.75, 0.8, 0.6, 0.375], correctAnswer: 0.75, correctDisplay: '3/4', choiceDisplays: ['3/4', '4/5', '3/5', '3/8'] };
    const out = extendChoices(q, 5, rng);
    expect(out.choices).toHaveLength(5);
    expect(out.choiceDisplays).toHaveLength(5);
    expect(new Set(out.choices.map((c) => c.toFixed(6))).size).toBe(5);
    const extra = parseFractionDisplay(out.choiceDisplays![4]!)!;
    expect(extra.num / extra.den).toBeCloseTo(out.choices[4]!, 9);
  });

  it('leaves 4 choices alone when only 4 ships fly', () => {
    expect(extendChoices({ choices: [1, 2, 3, 4], correctAnswer: 2 }, 4, mulberry32(1)).choices).toEqual([1, 2, 3, 4]);
  });
});
