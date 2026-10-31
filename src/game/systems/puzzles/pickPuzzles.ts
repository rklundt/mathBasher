// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config, type PuzzleLevel } from '@/core/config';
import type { PickPuzzleId } from '@/core/gameIds';
import { defaultRng } from '@/math/rng';
import {
  COLOUR_COUNT,
  SHAPE_COUNT,
  SPIN_COUNT,
  buildChoices,
  lookOf,
  pickDistinct,
  randInt,
  shapeIndex,
  shapeToken,
  shuffled,
  spinCells,
  spinToken,
  type ShapeToken,
  type Token,
} from '@/game/systems/puzzles/tokens';

/**
 * Sprint 2.14 — the five "pick one" puzzles, generated: Pattern Train
 * (sequences), Missing Piece (matrices), Odd One Out (classification), Magic
 * Wand (analogies) and Spin Match (rotation). Pure and seeded
 * (`pickPuzzles.test.ts`): the right answer is always among the choices and
 * no two choices look the same.
 */

/** What sits above the tray. Odd One Out has no tray: its choices stand on the shelf. */
export type PickStage =
  | { readonly kind: 'train'; readonly cars: readonly Token[] }
  | { readonly kind: 'window'; readonly cells: readonly (Token | null)[]; readonly cols: number }
  | { readonly kind: 'shelf' }
  | { readonly kind: 'wand'; readonly from: Token; readonly to: Token; readonly next: Token }
  | { readonly kind: 'spin'; readonly target: Token };

export interface PickPuzzle {
  readonly stage: PickStage;
  readonly prompt: string;
  readonly choices: readonly Token[];
  /** Index of the right choice. */
  readonly answer: number;
  /** Said after the right answer ("The others are all stars!"). */
  readonly why: string;
}

const P = config.puzzles;
const shapeName = (i: number): string => P.shapeLabels[P.shapes[i]];
const colourName = (i: number): string => P.colourLabels[P.colours[i]];
const TURNABLE = P.turnable.map((s) => shapeIndex(s));
const CORNERED = P.cornered.map((s) => shapeIndex(s));
const ROUND = P.round.map((s) => shapeIndex(s));

const choicesFor = (level: PuzzleLevel): number => P.choices[level];
const NEAR_SHAPES = P.symbolHunt.nearShapes as Readonly<Record<string, readonly string[]>>;
/** Shapes that look alike at a glance (either way round). */
export const lookAlikeShapes = (a: number, b: number): boolean =>
  NEAR_SHAPES[P.shapes[a]].includes(P.shapes[b]) || NEAR_SHAPES[P.shapes[b]].includes(P.shapes[a]);
const randomShapeToken = (rng: () => number): ShapeToken =>
  shapeToken(randInt(SHAPE_COUNT, rng), randInt(COLOUR_COUNT, rng));
const pick = <T>(items: readonly T[], rng: () => number): T => items[randInt(items.length, rng)];

/**
 * Owner (2026-10-26): a wrong choice that looks like the answer except for
 * something the puzzle never changes (a bigger copy when sizes don't change,
 * a turned one when nothing turns, two of it when counts don't change) is a
 * trick, not a puzzle. A wrong choice with the answer's shape and colour may
 * differ only in what the shown tokens themselves vary.
 */
const SUBTLE: readonly (keyof ShapeToken)[] = ['size', 'turn', 'flip', 'count', 'hat'];
function fair(answer: ShapeToken, shown: readonly ShapeToken[], tweaks: readonly Token[]): Token[] {
  const varies = (k: keyof ShapeToken): boolean => new Set(shown.map((t) => t[k])).size > 1;
  return tweaks.filter((t) => {
    if (t.kind !== 'shape' || t.shape !== answer.shape || t.colour !== answer.colour) return true;
    return SUBTLE.every((k) => t[k] === answer[k] || varies(k));
  });
}

// ---------------------------------------------------------------- Pattern Train

function patternTrain(level: PuzzleLevel, rng: () => number): PickPuzzle {
  const shown = P.patternTrain.cars[level];
  let seq: (i: number) => ShapeToken;
  let why = 'The pattern goes round and round!';
  const shapes = pickDistinct(SHAPE_COUNT, 4, rng);
  const colours = pickDistinct(COLOUR_COUNT, 4, rng);
  /** Elements that differ by colour, by shape, or both. */
  const elements = (n: number): ShapeToken[] => {
    const mode = randInt(3, rng);
    return Array.from({ length: n }, (_, i) =>
      mode === 0
        ? shapeToken(shapes[0], colours[i])
        : mode === 1
          ? shapeToken(shapes[i], colours[0])
          : shapeToken(shapes[i], colours[i]),
    );
  };
  const repeat = (unit: readonly number[], els: readonly ShapeToken[]) => (i: number) => els[unit[i % unit.length]];

  if (level === 'easy') {
    const unit = pick(
      [
        [0, 1],
        [0, 0, 1],
        [0, 1, 1],
        [0, 1, 2],
      ],
      rng,
    );
    seq = repeat(unit, elements(3));
  } else if (level === 'medium') {
    const kind = randInt(3, rng);
    if (kind === 0) {
      seq = repeat(
        pick(
          [
            [0, 1, 2, 3],
            [0, 0, 1, 1],
            [0, 1, 0, 2],
          ],
          rng,
        ),
        elements(4),
      );
    } else if (kind === 1) {
      // Big and small take turns (only two sizes, far apart).
      const t = shapeToken(shapes[0], colours[0]);
      const sizes = pick(
        [
          { order: [1, 0], says: 'Big, small, and again!' },
          { order: [1, 1, 0], says: 'Big, big, small, and again!' },
          { order: [0, 0, 1], says: 'Small, small, big, and again!' },
        ],
        rng,
      );
      seq = (i) => ({ ...t, size: sizes.order[i % sizes.order.length] });
      why = sizes.says;
    } else {
      // How many: 1, 2, 3, 1, 2, 3…
      const t = shapeToken(shapes[0], colours[0]);
      seq = (i) => ({ ...t, count: (i % 3) + 1 });
      why = 'One, two, three, and again!';
    }
  } else {
    const kind = randInt(2, rng);
    if (kind === 0) {
      // Shapes take turns every 2, colours every 3.
      seq = (i) => shapeToken(shapes[i % 2], colours[i % 3]);
      why = 'Shapes take turns, and so do colours!';
    } else {
      // A quarter turn each car, colours taking turns.
      const s = pick(TURNABLE, rng);
      seq = (i) => shapeToken(s, colours[i % 2], { turn: i % 4 });
      why = 'It turns a little more each car!';
    }
  }
  const cars = Array.from({ length: shown }, (_, i) => seq(i));
  const answer = seq(shown);
  const tweaks: Token[] = [
    ...cars,
    { ...answer, colour: (answer.colour + 1 + randInt(COLOUR_COUNT - 1, rng)) % COLOUR_COUNT },
    { ...answer, shape: (answer.shape + 1 + randInt(SHAPE_COUNT - 1, rng)) % SHAPE_COUNT },
    { ...answer, size: 1 - answer.size },
    { ...answer, turn: (answer.turn + 2) % 4 },
  ];
  const { choices, answer: index } = buildChoices(
    answer,
    shuffled(fair(answer, cars, tweaks), rng),
    choicesFor(level),
    () => randomShapeToken(rng),
    rng,
  );
  return { stage: { kind: 'train', cars }, prompt: 'What comes next?', choices, answer: index, why };
}

// ---------------------------------------------------------------- Missing Piece

function missingPiece(level: PuzzleLevel, rng: () => number): PickPuzzle {
  const M = P.missingPiece;
  const [lo, hi] = M.cols[level];
  const cols = lo + randInt(hi - lo + 1, rng);
  let shapes = pickDistinct(SHAPE_COUNT, Math.max(cols, M.rows), rng);
  const colours = pickDistinct(COLOUR_COUNT, Math.max(cols, M.rows), rng);
  let cell: (r: number, c: number) => ShapeToken;
  let why: string;
  if (level === 'easy') {
    cell = (r, c) => shapeToken(shapes[r], colours[c]);
    why = 'Each row has its shape, each column its colour!';
  } else if (level === 'medium') {
    const kind = randInt(4, rng);
    if (kind === 0) {
      // The same shapes in every row, moved along one each row.
      cell = (r, c) => shapeToken(shapes[(r + c) % cols], colours[r]);
      why = 'Every row has each shape once, moved along one!';
    } else if (kind === 1) {
      shapes = pickDistinct(TURNABLE.length, M.rows, rng).map((i) => TURNABLE[i]);
      cell = (r, c) => shapeToken(shapes[r], colours[r], { turn: c % 4 });
      why = 'Each one turns a little more!';
    } else if (kind === 2) {
      cell = (r, c) => shapeToken(shapes[c], colours[0], { count: r + 1 });
      why = 'Each column has its shape, each row its number!';
    } else {
      cell = (r, c) => shapeToken(shapes[0], colours[r], { size: c % 2 === 0 ? 1 : 0 });
      why = 'Each row has its colour: big, small, big, small!';
    }
  } else {
    // Two rules at once.
    const kind = randInt(3, rng);
    if (kind === 0) {
      cell = (r, c) => shapeToken(shapes[(r + c) % cols], colours[c]);
      why = 'The shapes move along one each row, and each column has its colour!';
    } else if (kind === 1) {
      shapes = pickDistinct(TURNABLE.length, M.rows, rng).map((i) => TURNABLE[i]);
      cell = (r, c) => shapeToken(shapes[r], colours[r], { turn: (r + c) % 4 });
      why = 'Each one turns a little more, and each row starts one turn further!';
    } else {
      // Two shapes that are easy to tell apart, even small (no hexagon next to a pentagon).
      const first = shapes[0];
      const others = Array.from({ length: SHAPE_COUNT }, (_, i) => i).filter(
        (s) => s !== first && !lookAlikeShapes(first, s),
      );
      shapes = [first, pick(others, rng)];
      cell = (r, c) => shapeToken(shapes[c % 2], colours[r], { count: r + 1 });
      why = 'Two shapes take turns, and each row has one more!';
    }
  }
  const total = M.rows * cols;
  const missing = level === 'easy' ? total - 1 : randInt(total, rng);
  const all = Array.from({ length: total }, (_, i) => cell(Math.floor(i / cols), i % cols));
  const answer = all[missing];
  const cells = all.map((t, i) => (i === missing ? null : t));
  const used = (k: 'shape' | 'colour'): number[] => [...new Set(all.map((t) => t[k]))];
  const next = (items: number[], v: number): number => items[(items.indexOf(v) + 1) % items.length];
  const tweaks: Token[] = [
    ...all.filter((_, i) => i !== missing),
    { ...answer, colour: next(used('colour'), answer.colour) },
    { ...answer, shape: next(used('shape'), answer.shape) },
    { ...answer, count: (answer.count % 3) + 1 },
    { ...answer, size: 1 - answer.size },
    { ...answer, turn: (answer.turn + 1) % 4 },
  ];
  const { choices, answer: index } = buildChoices(
    answer,
    shuffled(fair(answer, all, tweaks), rng),
    choicesFor(level),
    () => randomShapeToken(rng),
    rng,
  );
  return {
    stage: { kind: 'window', cells, cols },
    prompt: 'Which piece fits the window?',
    choices,
    answer: index,
    why,
  };
}

// ---------------------------------------------------------------- Odd One Out

function oddOneOut(level: PuzzleLevel, rng: () => number): PickPuzzle {
  const n = P.oddOneOut.items[level];
  const colours = pickDistinct(COLOUR_COUNT, n, rng);
  let same: Token[];
  let odd: Token;
  let why: string;
  const rules =
    level === 'easy'
      ? ['shape', 'colour']
      : level === 'medium'
        ? ['size', 'corners', 'count', 'shape']
        : ['kinds', 'flip', 'turn', 'corners'];
  const rule = pick(rules, rng);
  switch (rule) {
    case 'shape': {
      const [s, other] = pickDistinct(SHAPE_COUNT, 2, rng);
      same = colours.slice(1).map((c) => shapeToken(s, c));
      odd = shapeToken(other, colours[0]);
      why = `The others are all ${shapeName(s)}!`;
      break;
    }
    case 'colour': {
      const shapes = pickDistinct(SHAPE_COUNT, n, rng);
      const [c, other] = pickDistinct(COLOUR_COUNT, 2, rng);
      same = shapes.slice(1).map((s) => shapeToken(s, c));
      odd = shapeToken(shapes[0], other);
      why = `The others are all ${colourName(c)}!`;
      break;
    }
    case 'size': {
      const s = randInt(SHAPE_COUNT, rng);
      const big = rng() < 0.5;
      same = colours.slice(1).map((c) => shapeToken(s, c, { size: big ? 0 : 1 }));
      odd = shapeToken(s, colours[0], { size: big ? 1 : 0 });
      why = big ? 'The others are all small!' : 'The others are all big!';
      break;
    }
    case 'corners': {
      // Always one round shape among cornered ones: there are too few
      // plainly round shapes to fill a shelf the other way round.
      const others = shuffled(CORNERED, rng).slice(0, n - 1);
      same = others.map((s, i) => shapeToken(s, colours[i + 1]));
      odd = shapeToken(pick(ROUND, rng), colours[0]);
      why = 'The others all have corners!';
      break;
    }
    case 'count': {
      const s = randInt(SHAPE_COUNT, rng);
      const k = 1 + randInt(3, rng);
      const oddK = ((k - 1 + 1 + randInt(2, rng)) % 3) + 1;
      same = colours.slice(1).map((c) => shapeToken(s, c, { count: k }));
      odd = shapeToken(s, colours[0], { count: oddK });
      why = k === 1 ? 'The others are all on their own!' : `The others all come in ${k === 2 ? 'twos' : 'threes'}!`;
      break;
    }
    case 'kinds': {
      const animalsOdd = rng() < 0.5;
      const [many, few] = animalsOdd ? (['desserts', 'animals'] as const) : (['animals', 'desserts'] as const);
      same = pickDistinct(config.pairPals.picturesPerTheme, n - 1, rng).map(
        (frame) => ({ kind: 'picture', sheet: many, frame }) as const,
      );
      odd = { kind: 'picture', sheet: few, frame: randInt(config.pairPals.picturesPerTheme, rng) };
      why = `The others are all ${many === 'animals' ? 'animals' : 'yummy treats'}!`;
      break;
    }
    case 'flip': {
      const s = randInt(SPIN_COUNT, rng);
      const c = randInt(P.spinColours, rng);
      // The others: the shape turned different ways; the odd one: flipped.
      const looks = new Set<string>();
      same = [];
      for (const t of shuffled([0, 1, 2, 3], rng)) {
        const tok = spinToken(s, c, t, false);
        if (!looks.has(lookOf(tok))) {
          looks.add(lookOf(tok));
          same.push(tok);
        }
      }
      while (same.length < n - 1) same.push(spinToken(s, c, randInt(4, rng), false));
      same = same.slice(0, n - 1);
      odd = spinToken(s, c, randInt(4, rng), true);
      why = 'The others are just turned. This one is flipped!';
      break;
    }
    default: {
      // turn: all upright but one.
      const s = pick(TURNABLE, rng);
      same = colours.slice(1).map((c) => shapeToken(s, c));
      odd = shapeToken(s, colours[0], { turn: 1 + randInt(3, rng) });
      why = 'This one is turned!';
    }
  }
  const items = shuffled([...same, odd], rng);
  return {
    stage: { kind: 'shelf' },
    prompt: 'Tap the one that doesn’t belong!',
    choices: items,
    answer: items.indexOf(odd),
    why,
  };
}

// ---------------------------------------------------------------- Magic Wand

type Change = 'bigger' | 'smaller' | 'colour' | 'shape' | 'turn' | 'count' | 'hat';
const CHANGE_WORDS: Record<Change, string> = {
  bigger: 'Bigger!',
  smaller: 'Smaller!',
  colour: 'A new colour!',
  shape: 'A new shape!',
  turn: 'A quarter turn!',
  count: 'More of them!',
  hat: 'A hat!',
};

function magicWand(level: PuzzleLevel, rng: () => number): PickPuzzle {
  const pool: Change[][] =
    level === 'easy'
      ? [['bigger'], ['smaller'], ['colour']]
      : level === 'medium'
        ? [['shape'], ['turn'], ['count'], ['colour']]
        : // Owner (2026-10-28): Hard says "two changes at once", so every
          // one has two (a hat alone, or a flip alone, was only one).
          [
            ['hat', 'colour'],
            ['flip' as Change, 'colour'],
            ['bigger', 'colour'],
            ['turn', 'colour'],
            ['count', 'colour'],
            ['smaller', 'hat'],
            ['shape', 'hat'],
          ];
  const changes = pick(pool, rng);
  if ((changes as string[]).includes('flip')) return magicFlip(level, rng, changes.includes('colour'));

  const turnRule = changes.includes('turn');
  const shapePool = turnRule ? TURNABLE : Array.from({ length: SHAPE_COUNT }, (_, i) => i);
  const [sa, sc] = shuffled(shapePool, rng).slice(0, 2);
  const [ca, cc, cTo] = pickDistinct(COLOUR_COUNT, 3, rng);
  const sTo = (() => {
    let s = randInt(SHAPE_COUNT, rng);
    while (s === sa || s === sc) s = randInt(SHAPE_COUNT, rng);
    return s;
  })();
  const n = 2 + randInt(2, rng);
  const hat = randInt(P.hats.length, rng);
  const start = changes.includes('bigger') ? 0 : 1;
  // The colour change keeps the same "from" colour on both, so the rule is plain.
  const from = shapeToken(sa, ca, { size: start });
  const next = shapeToken(changes.includes('shape') ? sa : sc, changes.includes('colour') ? ca : cc, { size: start });
  const apply = (t: ShapeToken, only?: Change): ShapeToken => {
    let out = t;
    for (const ch of changes) {
      if (only && ch !== only) continue;
      if (ch === 'bigger') out = { ...out, size: 1 };
      if (ch === 'smaller') out = { ...out, size: 0 };
      if (ch === 'colour') out = { ...out, colour: cTo };
      if (ch === 'shape') out = { ...out, shape: sTo };
      if (ch === 'turn') out = { ...out, turn: 1 };
      if (ch === 'count') out = { ...out, count: n };
      if (ch === 'hat') out = { ...out, hat };
    }
    return out;
  };
  const to = apply(from);
  const answer = apply(next);
  const tweaks: Token[] = [
    ...changes.map((ch) => apply(next, ch)),
    next,
    to,
    { ...answer, colour: (answer.colour + 1) % COLOUR_COUNT },
    { ...answer, size: 1 - answer.size },
    { ...answer, turn: (answer.turn + 2) % 4 },
    { ...answer, count: answer.count === 1 ? 2 : 1 },
    { ...answer, hat: answer.hat === null ? hat : (answer.hat + 1) % P.hats.length },
  ];
  // The near misses first, then the rest; both kept fair (a small copy of
  // the answer is a trick when the wand never changes size).
  const shown = [from, to, next, answer];
  const { choices, answer: index } = buildChoices(
    answer,
    shuffled(fair(answer, shown, tweaks.slice(0, changes.length + 2)), rng).concat(
      shuffled(fair(answer, shown, tweaks.slice(changes.length + 2)), rng),
    ),
    choicesFor(level),
    () => {
      let t = randomShapeToken(rng);
      while (t.shape === answer.shape && t.colour === answer.colour) t = randomShapeToken(rng);
      return t;
    },
    rng,
  );
  return {
    stage: { kind: 'wand', from, to, next },
    prompt: 'Make the same magic change!',
    choices,
    answer: index,
    why: changes.map((c) => CHANGE_WORDS[c]).join(' '),
  };
}

/** Hard: the wand flips (mirrors) a lopsided shape. */
/**
 * A mirror flip (a spin shape, so the flip shows). With `recolour` the
 * colour changes too, to the same new colour on both, and the next shape
 * starts in the same colour as the first, so the rule reads plainly.
 */
function magicFlip(level: PuzzleLevel, rng: () => number, recolour = false): PickPuzzle {
  const [sa, sc] = pickDistinct(SPIN_COUNT, 2, rng);
  const [ca, cOther, cTo] = pickDistinct(P.spinColours, 3, rng);
  const cc = recolour ? ca : cOther;
  const cEnd = recolour ? cTo : cc;
  const from = spinToken(sa, ca, 0, false);
  const to = spinToken(sa, recolour ? cTo : ca, 0, true);
  const next = spinToken(sc, cc, 0, false);
  const answer = spinToken(sc, cEnd, 0, true);
  const tweaks: Token[] = [
    // One change but not the other first: the near misses.
    ...(recolour ? [spinToken(sc, cEnd, 0, false), spinToken(sc, cc, 0, true)] : []),
    next,
    spinToken(sc, cEnd, 1, false),
    spinToken(sc, cEnd, 2, false),
    spinToken(sc, cEnd, 3, false),
    to,
    spinToken(sc, cEnd, 2, true),
  ];
  const { choices, answer: index } = buildChoices(
    answer,
    shuffled(tweaks, rng),
    choicesFor(level),
    () => spinToken(randInt(SPIN_COUNT, rng), cEnd, randInt(4, rng), rng() < 0.5),
    rng,
  );
  return {
    stage: { kind: 'wand', from, to, next },
    prompt: 'Make the same magic change!',
    choices,
    answer: index,
    why: recolour ? 'Flipped like a mirror, and a new colour!' : 'Flipped, like a mirror!',
  };
}

// ---------------------------------------------------------------- Spin Match

/**
 * Spin shapes that look different at every quarter turn. A shape that looks
 * the same turned halfway round has only two mirror images, so Hard (every
 * wrong choice a mirror image) would fill up with other shapes.
 */
const FOUR_TURN_SPINS = Array.from({ length: SPIN_COUNT }, (_, s) => s).filter(
  (s) => new Set([0, 1, 2, 3].map((t) => spinCells(s, t, false))).size === 4,
);

function spinMatch(level: PuzzleLevel, rng: () => number): PickPuzzle {
  const s = level === 'hard' ? pick(FOUR_TURN_SPINS, rng) : randInt(SPIN_COUNT, rng);
  const c = randInt(P.spinColours, rng);
  const flip = rng() < 0.5;
  const target = spinToken(s, c, randInt(4, rng), flip);
  // The answer: the same shape, turned so it looks different.
  const turns = shuffled([1, 2, 3], rng).map((d) => spinToken(s, c, (target.turn + d) % 4, flip));
  const answer = turns.find((t) => lookOf(t) !== lookOf(target)) ?? turns[0];
  const mirrors = shuffled([0, 1, 2, 3], rng).map((t) => spinToken(s, c, t, !flip));
  const others = pickDistinct(SPIN_COUNT, SPIN_COUNT, rng)
    .filter((o) => o !== s)
    .map((o) => spinToken(o, c, randInt(4, rng), rng() < 0.5));
  const candidates: Token[] =
    level === 'easy' ? others : level === 'medium' ? [mirrors[0], ...others] : [...mirrors, ...others];
  const { choices, answer: index } = buildChoices(
    answer,
    candidates,
    choicesFor(level),
    () => spinToken(randInt(SPIN_COUNT, rng), c, randInt(4, rng), rng() < 0.5),
    rng,
  );
  return {
    stage: { kind: 'spin', target },
    prompt: 'Which one is the same shape, just spun?',
    choices,
    answer: index,
    why: 'Same shape, just turned!',
  };
}

// ---------------------------------------------------------------- a round

const GENERATORS: Record<PickPuzzleId, (level: PuzzleLevel, rng: () => number) => PickPuzzle> = {
  'pattern-train': patternTrain,
  'missing-piece': missingPiece,
  'odd-one-out': oddOneOut,
  'magic-wand': magicWand,
  'spin-match': spinMatch,
};

export function generatePick(id: PickPuzzleId, level: PuzzleLevel, rng: () => number = defaultRng): PickPuzzle {
  return GENERATORS[id](level, rng);
}

/** What makes two puzzles the same (so a round doesn't repeat one). */
function puzzleKey(p: PickPuzzle): string {
  return JSON.stringify(p.stage) + p.choices.map(lookOf).sort().join('|');
}

/** A round's puzzles, all different. */
export function generatePickRound(
  id: PickPuzzleId,
  level: PuzzleLevel,
  count: number = P.perRound,
  rng: () => number = defaultRng,
): PickPuzzle[] {
  const out: PickPuzzle[] = [];
  const seen = new Set<string>();
  for (let guard = 0; out.length < count && guard < count * 40; guard++) {
    const p = generatePick(id, level, rng);
    const key = puzzleKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  while (out.length < count) out.push(generatePick(id, level, rng));
  return out;
}
