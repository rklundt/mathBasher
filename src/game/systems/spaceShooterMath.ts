// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { pickSubsetWithCorrect } from '@/game/systems/roundRules';
import { buildFractionDistractors, decimalValue, formatFraction, mixedToImproper } from '@/math/fractionMath';

/**
 * Pure helpers for Space Shooter (sprint 2.6) — no Phaser, so the ships'
 * flight, bounces, spawning, taps and answer-label sizing are unit-tested
 * (`spaceShooterMath.test.ts`).
 */

export interface Rect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** One ship's flight state. Velocity is always `speed` along `heading`. */
export interface ShipBody {
  x: number;
  y: number;
  /** Direction of travel, radians (0 = right, π/2 = down). */
  heading: number;
  /** Current turn rate (rad/s) — wanders, so paths curve and change. */
  turn: number;
  readonly r: number;
}

export interface FlightTuning {
  readonly speed: number;
  readonly maxTurn: number;
  readonly turnJitter: number;
}

/**
 * Advance every ship by `dtSec`: wander the turn rate, turn, move, bounce
 * off the window edges, then push apart and bounce any ships that touch.
 * Afterwards every ship is inside `bounds` (centres) and no two overlap
 * by more than a hair.
 */
export function stepShips(ships: ShipBody[], dtSec: number, bounds: Rect, t: FlightTuning, rng: () => number): void {
  for (const s of ships) {
    s.turn += (rng() * 2 - 1) * t.turnJitter * dtSec;
    s.turn = Math.max(-t.maxTurn, Math.min(t.maxTurn, s.turn));
    s.heading += s.turn * dtSec;
    s.x += Math.cos(s.heading) * t.speed * dtSec;
    s.y += Math.sin(s.heading) * t.speed * dtSec;
    bounceOffWalls(s, bounds);
  }
  for (let i = 0; i < ships.length; i++) {
    for (let j = i + 1; j < ships.length; j++) collide(ships[i]!, ships[j]!);
  }
  // A collision push can nudge a ship past a wall; settle it back in.
  for (const s of ships) bounceOffWalls(s, bounds);
}

/** Reflect off any wall the centre has crossed; returns true if it bounced. */
export function bounceOffWalls(s: ShipBody, b: Rect): boolean {
  let vx = Math.cos(s.heading);
  let vy = Math.sin(s.heading);
  let hit = false;
  if (s.x < b.left) {
    s.x = b.left;
    vx = Math.abs(vx);
    hit = true;
  } else if (s.x > b.right) {
    s.x = b.right;
    vx = -Math.abs(vx);
    hit = true;
  }
  if (s.y < b.top) {
    s.y = b.top;
    vy = Math.abs(vy);
    hit = true;
  } else if (s.y > b.bottom) {
    s.y = b.bottom;
    vy = -Math.abs(vy);
    hit = true;
  }
  if (hit) {
    s.heading = Math.atan2(vy, vx);
    // Turning back into the wall would just scrape along it.
    s.turn = -s.turn;
  }
  return hit;
}

/**
 * Two touching ships: push them apart equally along the line between them
 * and swap their headings' components along that line (an equal-mass
 * bounce). Returns true if they touched.
 */
export function collide(a: ShipBody, b: ShipBody): boolean {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dist = Math.hypot(dx, dy);
  const minDist = a.r + b.r;
  if (dist >= minDist) return false;
  if (dist < 1e-6) {
    // Exactly on top of each other: pick any direction.
    dx = 1;
    dy = 0;
    dist = 1;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  const push = (minDist - dist) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const avx = Math.cos(a.heading);
  const avy = Math.sin(a.heading);
  const bvx = Math.cos(b.heading);
  const bvy = Math.sin(b.heading);
  const an = avx * nx + avy * ny;
  const bn = bvx * nx + bvy * ny;
  // Only bounce if they're moving towards each other.
  if (an - bn > 0) {
    a.heading = Math.atan2(avy + (bn - an) * ny, avx + (bn - an) * nx);
    b.heading = Math.atan2(bvy + (an - bn) * ny, bvx + (an - bn) * nx);
  }
  return true;
}

/**
 * `count` spawn points inside `bounds`, at least `minGap` apart (centre to
 * centre). Random tries first; if the window is too crowded for that, an
 * evenly spread fallback that still keeps the count.
 */
export function spawnPoints(
  count: number,
  bounds: Rect,
  minGap: number,
  rng: () => number,
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let tries = 0; pts.length < count && tries < 400; tries++) {
    const p = {
      x: bounds.left + rng() * (bounds.right - bounds.left),
      y: bounds.top + rng() * (bounds.bottom - bounds.top),
    };
    if (pts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= minGap)) pts.push(p);
  }
  if (pts.length === count) return pts;
  // Fallback: a loose grid across the window, shuffled.
  const cols = Math.ceil(Math.sqrt(count * 1.8));
  const rows = Math.ceil(count / cols);
  const grid: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      grid.push({
        x: bounds.left + ((c + 0.5) / cols) * (bounds.right - bounds.left),
        y: bounds.top + ((r + 0.5) / rows) * (bounds.bottom - bounds.top),
      });
    }
  }
  for (let i = grid.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [grid[i], grid[j]] = [grid[j]!, grid[i]!];
  }
  return grid.slice(0, count);
}

/** Is a point inside a rectangle? */
export function inRect(p: { x: number; y: number }, r: Rect): boolean {
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}

/**
 * The ship a tap lands on: the nearest one within `radius × slop` of the
 * tap, and only for taps inside the window (the cockpit around it swallows
 * taps). Returns the index, or -1.
 */
export function pickTappedShip(
  tap: { x: number; y: number },
  ships: ReadonlyArray<{ x: number; y: number }>,
  radius: number,
  slop: number,
  tapWindow: Rect,
): number {
  if (!inRect(tap, tapWindow)) return -1;
  let best = -1;
  let bestDist = radius * slop;
  ships.forEach((s, i) => {
    const d = Math.hypot(s.x - tap.x, s.y - tap.y);
    if (d <= bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

/**
 * How to show an answer on a ship. Wide labels (mixed numbers like
 * "1 11/12") shrink to fit `maxWidth`; anything wider than the round
 * porthole also gets a dark "display" pill behind it, so the number never
 * sits straight on a bright hull. Widths are at scale 1.
 */
export function shipLabelLayout(input: {
  textWidth: number;
  textHeight: number;
  portholeDiameter: number;
  maxWidth: number;
  pillPad: number;
  pillHeightPad: number;
}): { scale: number; pill: { width: number; height: number } | null } {
  const scale = Math.min(1, input.maxWidth / Math.max(1, input.textWidth));
  const w = input.textWidth * scale;
  const h = input.textHeight * scale;
  if (w + input.pillPad <= input.portholeDiameter) return { scale, pill: null };
  return {
    scale,
    pill: { width: Math.max(input.portholeDiameter, w + input.pillPad * 2), height: h + input.pillHeightPad },
  };
}

/** Lean a ship into its turn: degrees, clamped to ±maxDeg. */
export function leanFor(turn: number, maxTurn: number, maxDeg: number): number {
  if (maxTurn <= 0) return 0;
  return Math.max(-maxDeg, Math.min(maxDeg, (turn / maxTurn) * maxDeg));
}

/**
 * The answers for one wave of ships: `count` values including the right
 * one (no duplicates), in random order, each with its display label.
 */
export function shipAnswers(input: {
  choices: readonly number[];
  correctAnswer: number;
  choiceDisplays?: readonly string[];
  count: number;
  rng: () => number;
}): Array<{ answer: number; display: string }> {
  const { choices, correctAnswer, choiceDisplays, rng } = input;
  const count = Math.max(1, Math.min(input.count, choices.length));
  return pickSubsetWithCorrect(choices, correctAnswer, count, rng).map((answer) => ({
    answer,
    display: choiceDisplays?.[choices.indexOf(answer)] ?? String(answer),
  }));
}

/** `count` different ship looks out of `total`, in random order. */
export function pickShipFrames(count: number, total: number, rng: () => number): number[] {
  const all = Array.from({ length: total }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return all.slice(0, Math.min(count, total));
}

/** Parse a fraction display ("3/4", "1 1/2", "2") into an improper fraction. */
export function parseFractionDisplay(display: string): { num: number; den: number } | null {
  const mixed = /^(\d+) (\d+)\/(\d+)$/.exec(display);
  if (mixed) return mixedToImproper(Number(mixed[1]), Number(mixed[2]), Number(mixed[3]));
  const frac = /^(\d+)\/(\d+)$/.exec(display);
  if (frac) return { num: Number(frac[1]), den: Number(frac[2]) };
  const whole = /^(\d+)$/.exec(display);
  if (whole) return { num: Number(whole[1]), den: 1 };
  return null;
}

/**
 * Questions come with 4 answer choices; Hard flies 5 ships. Top the choices
 * up to `count` with plausible extra wrong answers: for whole numbers, the
 * nearest unused numbers around the answer (never negative); for fractions,
 * more of the usual kid mistakes (numerator / denominator off by one,
 * doubled denominator). Already-long enough choices come back unchanged.
 */
export function extendChoices(
  q: { choices: readonly number[]; correctAnswer: number; correctDisplay?: string; choiceDisplays?: readonly string[] },
  count: number,
  rng: () => number,
): { choices: number[]; choiceDisplays?: string[] } {
  const choices = [...q.choices];
  const displays = q.choiceDisplays ? [...q.choiceDisplays] : undefined;
  if (choices.length >= count) return { choices, choiceDisplays: displays };
  const taken = (v: number): boolean => choices.some((c) => Math.abs(c - v) < 1e-9);

  if (displays && q.correctDisplay) {
    const correct = parseFractionDisplay(q.correctDisplay);
    if (correct) {
      for (const d of buildFractionDistractors(rng, correct.num, correct.den, count + 4)) {
        if (choices.length >= count) break;
        const v = decimalValue(d.num, d.den);
        if (taken(v)) continue;
        choices.push(v);
        displays.push(formatFraction(d.num, d.den));
      }
    }
    return { choices, choiceDisplays: displays };
  }

  // Whole numbers: try answer ± 1, ± 2, … in a random order at each distance.
  for (let k = 1; choices.length < count && k < 50; k++) {
    const pair = rng() < 0.5 ? [q.correctAnswer - k, q.correctAnswer + k] : [q.correctAnswer + k, q.correctAnswer - k];
    for (const v of pair) {
      if (choices.length >= count) break;
      if (v >= 0 && Number.isInteger(v) && !taken(v)) choices.push(v);
    }
  }
  return { choices };
}
