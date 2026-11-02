// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config, type PuzzleLevel } from '@/core/config';
import type { WordPuzzleId } from '@/core/gameIds';
import { pickDistinct, randInt, shuffled, textToken, type TextToken } from '@/game/systems/puzzles/tokens';
import { makeChoices, type PuzzleWords, type ThemedPuzzle } from '@/game/systems/puzzles/themedTypes';
import {
  ABC_WORDS,
  ALSO_REAL,
  COMPOUNDS,
  EASY_KINDS,
  FIRST_LETTERS,
  GROW_CHAINS,
  HARD_KINDS,
  HARD_KIND_PAIRS,
  KID_VOCAB,
  PICTURE_WORDS,
  RHYMES,
  WAND_RELATIONS,
  picOf,
  type WandRelation,
  type WordKind,
} from '@/game/systems/puzzles/wordData';

/**
 * Sprint 2.16 — the Words "pick one" puzzles (owner, 2026-11-01): Word
 * Train, Odd Word Out, Word Wand, Missing Letter and Word Snap. Each
 * generator makes one puzzle with exactly one right card (tests check), so
 * a kid who reads carefully can always tell which. Words come from
 * `wordData.ts`; a word with a picture carries it.
 */

const P = config.puzzles;
const word = (w: string): TextToken => textToken(w, picOf(w));
const pick = <T>(items: readonly T[], rng: () => number): T => items[randInt(items.length, rng)];
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const letter = (l: string): TextToken => textToken(l.toUpperCase());

export function generateWordPuzzle(
  id: Exclude<WordPuzzleId, 'letter-garden'>,
  level: PuzzleLevel,
  rng: () => number,
  words?: PuzzleWords,
): ThemedPuzzle {
  switch (id) {
    case 'word-train':
      return wordTrain(level, rng);
    case 'odd-word-out':
      return oddWordOut(level, rng);
    case 'word-wand':
      return wordWand(level, rng);
    case 'missing-letter':
      return missingLetter(level, rng, words);
    case 'word-snap':
      return wordSnap(level, rng);
  }
}

// ---------------------------------------------------------------- Word Train

type TrainKind = 'letters' | 'lettersSkip' | 'lettersBack' | 'rhyme' | 'abab' | 'grow' | 'first' | 'abc' | 'abcSkip';
const TRAIN_KINDS: Record<PuzzleLevel, readonly TrainKind[]> = {
  easy: ['letters', 'rhyme', 'abab'],
  medium: ['lettersSkip', 'grow', 'first'],
  hard: ['lettersBack', 'abc', 'abcSkip', 'grow'],
};

/** True if `longer` is `shorter` with one letter added somewhere. */
export function addsOneLetter(shorter: string, longer: string): boolean {
  if (longer.length !== shorter.length + 1) return false;
  for (let i = 0; i < longer.length; i++) {
    if (longer.slice(0, i) + longer.slice(i + 1) === shorter) return true;
  }
  return false;
}

function wordTrain(level: PuzzleLevel, rng: () => number): ThemedPuzzle {
  const n = P.wordTrain.cars[level];
  const count = P.choices[level];
  const kind = pick(TRAIN_KINDS[level], rng);
  const train = (shown: TextToken[], answer: TextToken, wrong: TextToken[], prompt: string, why: string) => {
    const c = makeChoices(answer, wrong, count, rng);
    return { prompt, stage: { kind: 'train' as const, cars: [...shown, null] }, ...c, why };
  };

  if (kind === 'letters' || kind === 'lettersSkip' || kind === 'lettersBack') {
    const step = kind === 'letters' ? 1 : kind === 'lettersSkip' ? 2 : -1;
    const span = Math.abs(step) * n;
    const start = step > 0 ? randInt(26 - span, rng) : span + randInt(26 - span, rng);
    const at = (k: number) => ALPHABET[start + k * step];
    const shown = Array.from({ length: n }, (_, k) => letter(at(k)));
    const ans = at(n);
    const near = [-2, -1, 1, 2, 3, -3, 4, -4, 5]
      .map((d) => ALPHABET.indexOf(ans) + d)
      .filter((i) => i >= 0 && i < 26)
      .map((i) => ALPHABET[i]);
    const why =
      kind === 'letters'
        ? 'The letters go in ABC order!'
        : kind === 'lettersSkip'
          ? 'Skip a letter each time!'
          : 'The ABCs, going backwards!';
    return train(
      shown,
      letter(ans),
      shuffled(near, rng).map((l) => letter(l)),
      'Which letter comes next?',
      why,
    );
  }

  if (kind === 'rhyme') {
    const families = Object.entries(RHYMES).filter(([, ws]) => ws.length >= n + 1);
    const [end, words] = pick(families, rng);
    const picked = pickDistinct(words.length, n + 1, rng).map((i) => words[i]);
    const others = Object.entries(RHYMES)
      .filter(([e]) => e !== end)
      .flatMap(([, ws]) => ws);
    return train(
      picked.slice(0, n).map(word),
      word(picked[n]),
      shuffled(others, rng).map(word),
      'Which word comes next?',
      `They all end in -${end}!`,
    );
  }

  if (kind === 'abab') {
    const pool = shuffled(
      PICTURE_WORDS.filter((w) => w.length <= 4),
      rng,
    );
    const [a, b] = pool;
    const shown = Array.from({ length: n }, (_, k) => word(k % 2 === 0 ? a : b));
    const ans = n % 2 === 0 ? a : b;
    const other = n % 2 === 0 ? b : a;
    return train(
      shown,
      word(ans),
      [word(other), ...pool.slice(2).map(word)],
      'Which word comes next?',
      `${a}, ${b}, ${a}, ${b}… it takes turns!`,
    );
  }

  if (kind === 'grow') {
    const chain = pick(GROW_CHAINS, rng);
    const shown = chain.slice(0, n);
    const ans = chain[n];
    const prev = chain[n - 1];
    // Tempting: same-length words that don't hold the last one, and words of the wrong length.
    const pool = GROW_CHAINS.flatMap((c) => c).filter((w) => w !== ans && !addsOneLetter(prev, w));
    const sameLength = shuffled(
      pool.filter((w) => w.length === ans.length),
      rng,
    );
    const wrong = [...sameLength.slice(0, 2), prev, ...shuffled(pool, rng)];
    return train(
      shown.map(word),
      word(ans),
      wrong.map(word),
      'Which word comes next?',
      'Each word adds one more letter!',
    );
  }

  if (kind === 'first') {
    const letters = Object.keys(FIRST_LETTERS);
    const l = pick(letters, rng);
    const words = FIRST_LETTERS[l];
    const picked = pickDistinct(words.length, n + 1, rng).map((i) => words[i]);
    const others = letters.filter((x) => x !== l).flatMap((x) => FIRST_LETTERS[x]);
    return train(
      picked.slice(0, n).map(word),
      word(picked[n]),
      shuffled(others, rng).map(word),
      'Which word comes next?',
      `They all start with ${l.toUpperCase()}!`,
    );
  }

  // 'abc' / 'abcSkip': the first letters go in ABC order (skipping one).
  const step = kind === 'abc' ? 1 : 2;
  const letters = Object.keys(ABC_WORDS);
  const start = randInt(letters.length - step * n, rng);
  const at = (k: number) => letters[start + k * step];
  const shown = Array.from({ length: n }, (_, k) => word(pick(ABC_WORDS[at(k)], rng)));
  const ansLetter = at(n);
  const ans = pick(ABC_WORDS[ansLetter], rng);
  const ansIndex = letters.indexOf(ansLetter);
  const nearLetters = [1, -1, 2, -2, 3]
    .map((d) => letters[ansIndex + d])
    .filter((x): x is string => x !== undefined && x !== ansLetter && !shownStarts(shown, x));
  const farLetters = shuffled(
    letters.filter((x) => x !== ansLetter && !nearLetters.includes(x) && !shownStarts(shown, x)),
    rng,
  );
  const wrong = [...nearLetters, ...farLetters].map((x) => word(pick(ABC_WORDS[x], rng)));
  return train(
    shown,
    word(ans),
    wrong,
    'Which word comes next?',
    step === 1 ? 'The first letters go A, B, C…!' : 'The first letters skip one: A, C, E…!',
  );
}

const shownStarts = (shown: readonly TextToken[], l: string): boolean => shown.some((t) => t.text.startsWith(l));

// ---------------------------------------------------------------- Odd Word Out

type OddKind = 'kinds' | 'rhyme' | 'first' | 'hardKinds' | 'length';
const ODD_KINDS: Record<PuzzleLevel, readonly OddKind[]> = {
  easy: ['kinds'],
  medium: ['rhyme', 'first', 'kinds'],
  hard: ['hardKinds', 'length'],
};

/** Tries before giving up on a shelf where only one word stands out (in practice a few). */
const ODD_TRIES = 200;

function oddWordOut(level: PuzzleLevel, rng: () => number): ThemedPuzzle {
  // Owner (2026-11-01): "ball, fork, bell, bee": fork was the odd one (not B), but bee
  // was the only 3-letter word, so both were right. Draw again until only one stands out.
  let shelf = oddShelf(level, rng);
  for (let t = 1; t < ODD_TRIES && !onlyOdd(shelf); t++) shelf = oddShelf(level, rng);
  const { same, odd, why } = shelf;
  const items = shuffled([...same, odd], rng).map(word);
  return {
    prompt: 'Which word doesn’t belong?',
    stage: { kind: 'shelf' },
    choices: items,
    answer: items.findIndex((t) => t.text === odd),
    why,
  };
}

interface OddShelf {
  readonly same: readonly string[];
  readonly odd: string;
  readonly why: string;
}

/** The longest rhyme ending a word has (`RHYMES`), or its last two letters. */
const rhymeOf = (w: string): string =>
  Object.keys(RHYMES)
    .filter((e) => w.endsWith(e))
    .sort((a, b) => b.length - a.length)[0] ?? w.slice(-2);

/** What a child might sort the words by: the first letter, the length, the ending, the rhyme. */
const ODD_LOOKS: readonly ((w: string) => string | number)[] = [
  (w) => w[0],
  (w) => w.length,
  (w) => w.slice(-2),
  rhymeOf,
];
const ALL_KINDS: readonly WordKind[] = [...Object.values(EASY_KINDS), ...Object.values(HARD_KINDS)];

/**
 * The words that some rule a child might spot singles out: all the others
 * start with the same letter, have the same length or ending, or are the same
 * kind of thing (`EASY_KINDS`, `HARD_KINDS`), and it doesn't.
 */
export function oddOnesOut(words: readonly string[]): Set<string> {
  const out = new Set<string>();
  const alone = (marks: readonly unknown[]): void => {
    marks.forEach((m, i) => {
      const rest = marks.filter((_, j) => j !== i);
      if (rest.every((r) => r === rest[0]) && m !== rest[0]) out.add(words[i]);
    });
  };
  for (const look of ODD_LOOKS) alone(words.map(look));
  for (const k of ALL_KINDS) {
    const inKind = words.map((w) => k.words.includes(w));
    // Only "the others are all <kind>", not "it's the only <kind>" (most words are the only one of something).
    if (inKind.filter(Boolean).length === words.length - 1) out.add(words[inKind.indexOf(false)]);
  }
  return out;
}

/** Only the odd word stands out, by its own rule and every other. */
const onlyOdd = ({ same, odd }: OddShelf): boolean => {
  const out = oddOnesOut([...same, odd]);
  return out.size === 1 && out.has(odd);
};

function oddShelf(level: PuzzleLevel, rng: () => number): OddShelf {
  const n = P.oddWordOut.items[level];
  const kind = pick(ODD_KINDS[level], rng);
  let same: string[];
  let odd: string;
  let why: string;
  if (kind === 'kinds' || kind === 'hardKinds') {
    let a: WordKind;
    let b: WordKind;
    if (kind === 'kinds') {
      const [ka, kb] = pickDistinct(Object.keys(EASY_KINDS).length, 2, rng).map((i) => Object.keys(EASY_KINDS)[i]);
      a = EASY_KINDS[ka];
      b = EASY_KINDS[kb];
    } else {
      const [ka, kb] = pick(HARD_KIND_PAIRS, rng);
      a = HARD_KINDS[ka];
      b = HARD_KINDS[kb];
    }
    same = pickDistinct(a.words.length, n - 1, rng).map((i) => a.words[i]);
    odd = pick(
      b.words.filter((w) => !a.words.includes(w)),
      rng,
    );
    why = `The others are all ${a.name}!`;
  } else if (kind === 'rhyme') {
    const families = Object.entries(RHYMES).filter(([, ws]) => ws.length >= n - 1);
    const [end, words] = pick(families, rng);
    same = pickDistinct(words.length, n - 1, rng).map((i) => words[i]);
    const others = Object.entries(RHYMES)
      .filter(([e]) => e !== end && !e.endsWith(end) && !end.endsWith(e))
      .flatMap(([, ws]) => ws);
    odd = pick(others, rng);
    why = `The others all end in -${end}!`;
  } else if (kind === 'first') {
    const letters = Object.keys(FIRST_LETTERS);
    const l = pick(letters, rng);
    same = pickDistinct(FIRST_LETTERS[l].length, n - 1, rng).map((i) => FIRST_LETTERS[l][i]);
    odd = pick(
      letters.filter((x) => x !== l).flatMap((x) => FIRST_LETTERS[x]),
      rng,
    );
    why = `The others all start with ${l.toUpperCase()}!`;
  } else {
    // 'length': all the same number of letters but one.
    const all = [...new Set(Object.values(EASY_KINDS).flatMap((k) => k.words))];
    const len = pick([3, 4, 5], rng);
    const fits = all.filter((w) => w.length === len);
    same = pickDistinct(fits.length, n - 1, rng).map((i) => fits[i]);
    odd = pick(
      all.filter((w) => w.length !== len && Math.abs(w.length - len) <= 2),
      rng,
    );
    why = `The others all have ${String(len)} letters!`;
  }
  return { same, odd, why };
}

// ---------------------------------------------------------------- Word Wand

function wordWand(level: PuzzleLevel, rng: () => number): ThemedPuzzle {
  const relations = WAND_RELATIONS.filter((r) => r.level === level);
  const rel: WandRelation = pick(relations, rng);
  const [i, j] = pickDistinct(rel.pairs.length, 2, rng);
  const [a, b] = rel.pairs[i];
  const [c, ans] = rel.pairs[j];
  // Tempting wrong answers: what C becomes by other magic, then this magic's other answers, then C itself.
  const otherMagic = WAND_RELATIONS.filter((r) => r !== rel)
    .flatMap((r) => r.pairs)
    .filter(([x, y]) => x === c && y !== ans)
    .map(([, y]) => y);
  const sameMagic = rel.pairs.map(([, y]) => y).filter((y) => y !== ans);
  const wrong = [...shuffled(otherMagic, rng), b, ...shuffled(sameMagic, rng), c].filter(
    (w) => !rel.pairs.some(([x, y]) => x === c && y === w),
  );
  const { choices, answer } = makeChoices(word(ans), wrong.map(word), P.choices[level], rng);
  return {
    prompt: 'Do the same magic!',
    stage: { kind: 'pair', from: word(a), to: word(b), next: word(c) },
    choices,
    answer,
    why: rel.why(c, ans),
  };
}

// ---------------------------------------------------------------- Missing Letter

const VOWELS = 'aeiou';

/** Tempting wrong letters for one gap: the other vowels for a vowel; look- and sound-alikes for a consonant. */
function lookAlikes(l: string): string[] {
  const pool = VOWELS.includes(l) ? VOWELS : (CLOSE_LETTERS[l] ?? '') + 'bdgmnprst';
  return [...new Set(pool.split('').filter((x) => x !== l))];
}

/**
 * Owner (2026-11-01): more words (picture words, then `KID_VOCAB` checked
 * against the big word list), and on Hard two letters missing, picked one
 * at a time from more letter cards ("2 separate letters (2 choices)… another
 * option or two to make it more challenging"). With the word list, no wrong
 * letter spells a real word in any gap (the other gaps filled right); a word
 * without a picture is only used then. The gaps' letters always differ.
 */
function missingLetter(level: PuzzleLevel, rng: () => number, words?: PuzzleWords): ThemedPuzzle {
  const M = P.missingLetter;
  const [lo, hi] = M.letters[level];
  const gapCount = M.gaps[level];
  const fits = (w: string): boolean => w.length >= lo && w.length <= hi;
  const pictured = PICTURE_WORDS.filter(fits);
  // A level shows a picture every time (picture words only) or never (any kid word).
  const withPicture = M.pictures[level];
  const plain = words && !withPicture ? KID_VOCAB.filter((w) => fits(w) && picOf(w) === null && words.isWord(w)) : [];
  const pool = [...new Set([...pictured, ...plain])];
  const count = M.cards[level];
  for (let guard = 0; ; guard++) {
    const w = pick(pool, rng);
    const gaps = pickDistinct(w.length, gapCount, rng).sort((x, y) => x - y);
    const right = gaps.map((g) => w[g]);
    if (new Set(right).size < right.length && guard < 200) continue;
    // A wrong letter may not spell a real word in any gap.
    const spellsWord = (l: string): boolean =>
      gaps.some((g) => {
        const spelled = w.slice(0, g) + l + w.slice(g + 1);
        return spelled !== w && (words?.isWord(spelled) ?? false);
      });
    const tempting = shuffled(
      [...new Set(right.flatMap((l) => lookAlikes(l)))].filter((l) => !right.includes(l)),
      rng,
    );
    const others = shuffled(
      ALPHABET.split('').filter((l) => !right.includes(l) && !tempting.includes(l)),
      rng,
    );
    const wrong = [...tempting, ...others].filter((l) => !spellsWord(l)).slice(0, count - gapCount);
    if (wrong.length < count - gapCount && guard < 200) continue;
    const cards = shuffled([...right, ...wrong], rng).map((l) => letter(l));
    const answers = right.map((l) => cards.findIndex((c) => c.text === l.toUpperCase()));
    return {
      prompt: gapCount > 1 ? 'Which letters are missing?' : 'Which letter is missing?',
      stage: {
        kind: 'missing',
        word: w,
        picture: withPicture ? picOf(w) : null,
        letters: w.split('').map((l, k) => (gaps.includes(k) ? null : l)),
      },
      choices: cards,
      answer: answers[0],
      ...(gapCount > 1 && { answers }),
      why: `${w.toUpperCase()}!`,
    };
  }
}

/** Letters easy to mix up with each one (a consonant's tempting wrong answers). */
const CLOSE_LETTERS: Readonly<Record<string, string>> = {
  b: 'dpv',
  c: 'kse',
  d: 'btp',
  f: 'vth',
  g: 'jqk',
  h: 'nkf',
  k: 'cgh',
  l: 'tri',
  m: 'nwr',
  n: 'mhu',
  p: 'bqd',
  r: 'nlw',
  s: 'czx',
  t: 'dlf',
  w: 'vmy',
  y: 'vwj',
  z: 'sx',
};

// ---------------------------------------------------------------- Word Snap

const SNAP_WORDS = new Set([...COMPOUNDS.map(([a, b]) => a + b), ...ALSO_REAL]);

/** Would `a` + `b` make a real word (so it can't be a wrong choice)? */
export function snapsToWord(a: string, b: string): boolean {
  return SNAP_WORDS.has(a + b);
}

function wordSnap(level: PuzzleLevel, rng: () => number): ThemedPuzzle {
  const [left, right] = pick(COMPOUNDS, rng);
  const whole = left + right;
  const firstHalves = [...new Set(COMPOUNDS.map(([a]) => a))];
  const secondHalves = [...new Set(COMPOUNDS.map(([, b]) => b))];
  const count = P.choices[level];
  if (level === 'medium') {
    // ? + flower = sunflower: pick the first half.
    const wrong = shuffled(firstHalves, rng).filter((a) => a !== left);
    const { choices, answer } = makeChoices(word(left), wrong.map(word), count, rng);
    return {
      prompt: 'Which word goes first?',
      stage: { kind: 'snap', left: null, right, whole },
      choices,
      answer,
      why: `${left} + ${right} = ${whole}!`,
    };
  }
  // Easy: sun + ? = sunflower. Hard: sun + ? with no whole word, so only one choice may snap on.
  const wrong = shuffled(secondHalves, rng).filter((b) => b !== right && (level === 'easy' || !snapsToWord(left, b)));
  const { choices, answer } = makeChoices(word(right), wrong.map(word), count, rng);
  return {
    prompt: level === 'easy' ? 'Which word snaps on?' : 'Which word makes a real word?',
    stage: { kind: 'snap', left, right: null, whole: level === 'easy' ? whole : null },
    choices,
    answer,
    why: `${left} + ${right} = ${whole}!`,
  };
}
