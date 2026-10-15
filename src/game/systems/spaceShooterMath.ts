// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { pickSubsetWithCorrect } from '@/game/systems/roundRules';

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

/**
 * Where ship centres may fly: a top / bottom, and left / right edges that
 * can change with height (the cockpit window is rounded and tapers).
 */
export interface FlightBounds {
  readonly top: number;
  readonly bottom: number;
  xAt(y: number): { left: number; right: number };
}

/** Plain rectangular bounds (tests, and any straight-edged window). */
export function rectBounds(r: Rect): FlightBounds {
  return { top: r.top, bottom: r.bottom, xAt: () => ({ left: r.left, right: r.right }) };
}

/**
 * Left / right limits for a ship centre at height `y`, from the window's
 * measured edge (rows of [y, leftEdge, rightEdge]): the tightest edge
 * within `reachY` above or below — a ship and its answer label are tall —
 * pulled in by `halfWidth` (half the widest ship-plus-label).
 */
export function windowXBounds(
  y: number,
  edge: ReadonlyArray<readonly [number, number, number]>,
  halfWidth: number,
  reachY: number,
): { left: number; right: number } {
  let left = -Infinity;
  let right = Infinity;
  for (const [ry, l, r] of edge) {
    if (Math.abs(ry - y) > reachY) continue;
    left = Math.max(left, l);
    right = Math.min(right, r);
  }
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    // No measured row nearby: fall back to the narrowest row overall.
    left = Math.max(...edge.map((e) => e[1]));
    right = Math.min(...edge.map((e) => e[2]));
  }
  return { left: left + halfWidth, right: right - halfWidth };
}

/** Is a point inside the flight bounds? */
export function inBounds(p: { x: number; y: number }, b: FlightBounds, slack = 1e-6): boolean {
  if (p.y < b.top - slack || p.y > b.bottom + slack) return false;
  const { left, right } = b.xAt(p.y);
  return p.x >= left - slack && p.x <= right + slack;
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
export function stepShips(ships: ShipBody[], dtSec: number, bounds: FlightBounds, t: FlightTuning, rng: () => number): void {
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
export function bounceOffWalls(s: ShipBody, b: FlightBounds): boolean {
  let vx = Math.cos(s.heading);
  let vy = Math.sin(s.heading);
  let hit = false;
  if (s.y < b.top) {
    s.y = b.top;
    vy = Math.abs(vy);
    hit = true;
  } else if (s.y > b.bottom) {
    s.y = b.bottom;
    vy = -Math.abs(vy);
    hit = true;
  }
  // Left / right edges at the (clamped) height — the window tapers.
  const { left, right } = b.xAt(s.y);
  if (s.x < left) {
    s.x = left;
    vx = Math.abs(vx);
    hit = true;
  } else if (s.x > right) {
    s.x = right;
    vx = -Math.abs(vx);
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
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = a.r + b.r;
  if (dist >= minDist) return false;
  // Exactly on top of each other: push apart along any direction.
  const nx = dist < 1e-6 ? 1 : dx / dist;
  const ny = dist < 1e-6 ? 0 : dy / dist;
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
    a.heading = bouncedHeading(avx + (bn - an) * nx, avy + (bn - an) * ny, -nx, -ny);
    b.heading = bouncedHeading(bvx + (an - bn) * nx, bvy + (an - bn) * ny, nx, ny);
  }
  return true;
}

/**
 * Heading of a bounced velocity. If the swap left (almost) nothing — one
 * ship flying straight into the other, the other flying across — head away
 * along the push direction instead of an arbitrary angle.
 */
function bouncedHeading(vx: number, vy: number, awayX: number, awayY: number): number {
  return Math.hypot(vx, vy) < 1e-6 ? Math.atan2(awayY, awayX) : Math.atan2(vy, vx);
}

/**
 * `count` spawn points inside `bounds`, at least `minGap` apart (centre to
 * centre). Random tries first; if the window is too crowded for that, an
 * evenly spread fallback that still keeps the count.
 */
export function spawnPoints(
  count: number,
  bounds: FlightBounds,
  minGap: number,
  rng: () => number,
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let tries = 0; pts.length < count && tries < 400; tries++) {
    const y = bounds.top + rng() * (bounds.bottom - bounds.top);
    const { left, right } = bounds.xAt(y);
    const p = { x: left + rng() * (right - left), y };
    if (pts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= minGap)) pts.push(p);
  }
  if (pts.length === count) return pts;
  // Fallback: a loose grid across the window, shuffled.
  const cols = Math.ceil(Math.sqrt(count * 1.8));
  const rows = Math.ceil(count / cols);
  const grid: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < rows; r++) {
    const y = bounds.top + ((r + 0.5) / rows) * (bounds.bottom - bounds.top);
    const { left, right } = bounds.xAt(y);
    for (let c = 0; c < cols; c++) grid.push({ x: left + ((c + 0.5) / cols) * (right - left), y });
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
