// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/test-utils/mulberry32';
import { config } from '@/core/config';
import {
  bounceOffWalls,
  collide,
  inBounds,
  rectBounds,
  windowXBounds,
  type FlightBounds,
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
const bounds: FlightBounds = {
  top: cfg.window.top,
  bottom: cfg.window.bottom,
  xAt: (y) => windowXBounds(y, cfg.windowEdge, cfg.edgeHalfWidthPx, cfg.edgeReachPx),
};
const r = cfg.ship.displayPx * cfg.ship.radiusFrac;

const ship = (x: number, y: number, heading = 0, turn = 0): ShipBody => ({ x, y, heading, turn, r });

describe('window geometry', () => {
  it('a ship and its widest answer label stay inside the window at every height, corners included', () => {
    const half = cfg.ship.displayPx / 2;
    for (let y = bounds.top; y <= bounds.bottom; y += 4) {
      const { left, right } = bounds.xAt(y);
      expect(right).toBeGreaterThan(left);
      // Every measured window row across the ship's height clears the ship + label.
      for (const [ry, el, er] of cfg.windowEdge) {
        if (Math.abs(ry - y) > cfg.edgeReachPx) continue;
        expect(left - cfg.edgeHalfWidthPx, `y=${y} row=${ry}`).toBeGreaterThanOrEqual(el);
        expect(right + cfg.edgeHalfWidthPx, `y=${y} row=${ry}`).toBeLessThanOrEqual(er);
      }
    }
    // Widest label: the max label width plus its pill padding.
    expect(cfg.edgeHalfWidthPx).toBeGreaterThanOrEqual(cfg.label.maxWidthPx / 2 + cfg.label.pillPadPx);
    expect(cfg.edgeHalfWidthPx).toBeGreaterThanOrEqual(half);
    expect(bounds.top - half).toBeGreaterThanOrEqual(cfg.tapWindow.top);
    expect(bounds.bottom + half).toBeLessThanOrEqual(cfg.tapWindow.bottom);
  });

  it('the bounds narrow towards the tapered bottom of the window', () => {
    const mid = bounds.xAt(320);
    const low = bounds.xAt(bounds.bottom);
    expect(low.right - low.left).toBeLessThan(mid.right - mid.left);
  });

  it('has room for the most ships (Hard)', () => {
    const { left, right } = bounds.xAt(bounds.bottom);
    const area = (right - left + 2 * r) * (bounds.bottom - bounds.top + 2 * r);
    expect(area).toBeGreaterThan(cfg.speed.fast.shipCount * Math.PI * r * r * 3);
  });
});

describe('flight', () => {
  it('bounces off a wall: back inside, heading turned around', () => {
    const box = rectBounds({ left: 318, right: 968, top: 176, bottom: 540 });
    const s = ship(318 - 10, 300, Math.PI); // flying left, past the left wall
    expect(bounceOffWalls(s, box)).toBe(true);
    expect(s.x).toBe(318);
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

  it('ships exactly on top of each other are pushed apart', () => {
    const a = ship(500, 300, 0);
    const b = ship(500, 300, Math.PI / 2);
    expect(collide(a, b)).toBe(true);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(2 * r, 5);
  });

  it('a ship flying straight into one crossing its path heads away, not off at random', () => {
    // A flies right into B; B crosses downward. A's velocity along the line is all swapped away.
    const a = ship(500, 300, 0);
    const b = ship(500 + r * 1.5, 300, Math.PI / 2);
    collide(a, b);
    expect(Math.cos(a.heading)).toBeLessThan(0);
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
        expect(inBounds(s, bounds)).toBe(true);
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
      for (const p of pts) expect(inBounds(p, bounds)).toBe(true);
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
    for (const p of pts) expect(inBounds(p, bounds)).toBe(true);
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
