// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { defaultRng } from '@/math/rng';

/**
 * Sprint 2.13 — Pair Pals' rules, pure and seeded so they're tested
 * (`pairPalsMath.test.ts`): the deal, a tap's outcome, the board layout and
 * keyboard focus. `PairPalsScene` animates what these decide.
 */

/** Fisher–Yates, on a copy. */
function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * `count` different pictures out of `total`, keeping near look-alikes apart
 * (`twinGroups`): at most one per group while there are enough others, and a
 * second one from a group only when the board needs more pictures than that.
 */
export function pickPictures(
  count: number,
  total: number,
  twinGroups: readonly (readonly number[])[],
  rng: () => number = defaultRng,
): number[] {
  if (count > total) throw new Error(`${String(count)} pairs from ${String(total)} pictures`);
  const groupOf = new Map<number, number>();
  twinGroups.forEach((group, g) => group.forEach((p) => groupOf.set(p, g)));
  const chosen: number[] = [];
  const spare: number[] = [];
  const usedGroups = new Set<number>();
  for (const p of shuffled(
    Array.from({ length: total }, (_, i) => i),
    rng,
  )) {
    if (chosen.length === count) break;
    const g = groupOf.get(p);
    if (g === undefined || !usedGroups.has(g)) {
      chosen.push(p);
      if (g !== undefined) usedGroups.add(g);
    } else {
      spare.push(p);
    }
  }
  while (chosen.length < count) chosen.push(spare.shift()!);
  return chosen;
}

/**
 * How many matching pairs touch (side by side, above / below, or corner to
 * corner) on a board laid out `cols` across.
 */
export function touchingPairs(cards: readonly number[], cols: number): number {
  let n = 0;
  for (let i = 0; i < cards.length; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    // Each neighbour once: right, and the three below.
    for (const [dr, dc] of [
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ]) {
      const rr = r + dr;
      const cc = c + dc;
      if (cc < 0 || cc >= cols) continue;
      const j = rr * cols + cc;
      if (j < cards.length && cards[j] === cards[i]) n++;
    }
  }
  return n;
}

/** Shuffles tried before settling for the one with the fewest touching pairs (a valid board takes about 30–45 on average; giving up is about 1 in 100,000 on Easy). */
const MAX_SHUFFLES = 500;

/**
 * The board: each picked picture twice, shuffled into `cols × rows` places
 * (left to right, top to bottom), with no matching pair touching (owner,
 * 2026-10-26: a plain shuffle left about 1.6 touching pairs a game). It
 * reshuffles until none touch, so every such board is equally likely.
 */
export function deal(
  cols: number,
  rows: number,
  total: number,
  twinGroups: readonly (readonly number[])[],
  rng: () => number = defaultRng,
): number[] {
  const cells = cols * rows;
  if (cells % 2 !== 0) throw new Error(`${String(cols)} × ${String(rows)} has an odd number of cards`);
  const pictures = pickPictures(cells / 2, total, twinGroups, rng);
  const cards = [...pictures, ...pictures];
  let best = shuffled(cards, rng);
  let bestTouching = touchingPairs(best, cols);
  for (let i = 1; i < MAX_SHUFFLES && bestTouching > 0; i++) {
    const next = shuffled(cards, rng);
    const touching = touchingPairs(next, cols);
    if (touching < bestTouching) {
      best = next;
      bestTouching = touching;
    }
  }
  return best;
}

export type CardState = 'down' | 'up' | 'matched';

export interface Board {
  /** The picture on each card. */
  readonly pictures: readonly number[];
  readonly states: CardState[];
  /** The first card of the turn in progress, or null. */
  first: number | null;
  /** A missed pair still showing (so it can be remembered), or null. */
  held: [number, number] | null;
  turns: number;
  pairsFound: number;
}

export function newBoard(pictures: readonly number[]): Board {
  return { pictures, states: pictures.map(() => 'down'), first: null, held: null, turns: 0, pairsFound: 0 };
}

export function totalPairs(board: Board): number {
  return board.pictures.length / 2;
}

/**
 * What a tap did:
 *  - `ignored`: a face-up or matched card (it costs nothing);
 *  - `release`: one of a showing miss was tapped, so the pair turns back now;
 *  - `first`: the turn's first card turns over (a showing miss turns back first, `releasing`);
 *  - `match` / `miss`: the turn's second card; a turn is counted.
 */
export type TapOutcome =
  | { kind: 'ignored' }
  | { kind: 'release'; cards: [number, number] }
  | { kind: 'first'; card: number; releasing: [number, number] | null }
  | { kind: 'match'; cards: [number, number]; won: boolean }
  | { kind: 'miss'; cards: [number, number] };

/** Apply a tap on card `i` to the board (mutates it) and say what happened. */
export function tapCard(board: Board, i: number): TapOutcome {
  if (i < 0 || i >= board.pictures.length) return { kind: 'ignored' };
  let releasing: [number, number] | null = null;
  if (board.held !== null) {
    const held = board.held;
    if (board.states[i] === 'matched') return { kind: 'ignored' };
    releaseMiss(board);
    if (held.includes(i)) return { kind: 'release', cards: held };
    releasing = held;
  }
  if (board.states[i] !== 'down') return { kind: 'ignored' };
  board.states[i] = 'up';
  if (board.first === null) {
    board.first = i;
    return { kind: 'first', card: i, releasing };
  }
  const a = board.first;
  board.first = null;
  board.turns += 1;
  if (board.pictures[a] === board.pictures[i]) {
    board.states[a] = 'matched';
    board.states[i] = 'matched';
    board.pairsFound += 1;
    return { kind: 'match', cards: [a, i], won: board.pairsFound === totalPairs(board) };
  }
  board.held = [a, i];
  return { kind: 'miss', cards: [a, i] };
}

/** The miss's hold is over (or skipped): its two cards turn back. Returns them, or null if none was showing. */
export function releaseMiss(board: Board): [number, number] | null {
  const held = board.held;
  if (held === null) return null;
  for (const c of held) board.states[c] = 'down';
  board.held = null;
  return held;
}

export interface BoardArea {
  top: number;
  bottom: number;
  centerX: number;
  maxWidth: number;
  maxCardPx: number;
  gapPx: number;
}

export interface BoardLayout {
  cardPx: number;
  /** Card centres, left to right, top to bottom. */
  positions: { x: number; y: number }[];
}

/** The biggest square cards (up to `maxCardPx`) that fit the area, centred in it. */
export function boardLayout(cols: number, rows: number, area: BoardArea): BoardLayout {
  const { gapPx: gap } = area;
  const height = area.bottom - area.top;
  const cardPx = Math.floor(
    Math.min(area.maxCardPx, (height - gap * (rows - 1)) / rows, (area.maxWidth - gap * (cols - 1)) / cols),
  );
  const boardW = cols * cardPx + (cols - 1) * gap;
  const boardH = rows * cardPx + (rows - 1) * gap;
  const x0 = area.centerX - boardW / 2 + cardPx / 2;
  const y0 = area.top + (height - boardH) / 2 + cardPx / 2;
  const positions: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) positions.push({ x: x0 + c * (cardPx + gap), y: y0 + r * (cardPx + gap) });
  }
  return { cardPx, positions };
}

export type Direction = 'left' | 'right' | 'up' | 'down';

/** The arrow keys' focus over the cards; it stops at the edges. */
export function moveFocus(index: number, dir: Direction, cols: number, rows: number): number {
  const r = Math.floor(index / cols);
  const c = index % cols;
  switch (dir) {
    case 'left':
      return c > 0 ? index - 1 : index;
    case 'right':
      return c < cols - 1 ? index + 1 : index;
    case 'up':
      return r > 0 ? index - cols : index;
    case 'down':
      return r < rows - 1 ? index + cols : index;
  }
}
