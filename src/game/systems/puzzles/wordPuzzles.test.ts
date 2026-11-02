// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, type PuzzleLevel } from '@/core/config';
import { mulberry32 } from '@/test-utils/mulberry32';
import { generateThemed, generateThemedRound, type ThemedPuzzle } from '@/game/systems/puzzles/themedPuzzles';
import { addsOneLetter, oddOnesOut, snapsToWord } from '@/game/systems/puzzles/wordPuzzles';
import {
  ABC_WORDS,
  COMPOUNDS,
  EASY_KINDS,
  FIRST_LETTERS,
  GROW_CHAINS,
  HARD_KINDS,
  HARD_KIND_PAIRS,
  PICTURE_WORDS,
  RHYMES,
  WAND_RELATIONS,
} from '@/game/systems/puzzles/wordData';
import { WordList, type LetterGardenData } from '@/game/systems/puzzles/letterGarden';

const P = config.puzzles;
const LEVELS: PuzzleLevel[] = ['easy', 'medium', 'hard'];
type WordId = 'word-train' | 'odd-word-out' | 'word-wand' | 'missing-letter' | 'word-snap';
const IDS: WordId[] = ['word-train', 'odd-word-out', 'word-wand', 'missing-letter', 'word-snap'];
const data = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../public/assets/words/letter-garden-1.json'), 'utf8'),
) as LetterGardenData;
const dictionary = new WordList(data);

function each(id: WordId, fn: (p: ThemedPuzzle, level: PuzzleLevel, tag: string) => void): void {
  for (const level of LEVELS)
    for (let seed = 1; seed <= 300; seed++) {
      fn(generateThemed(id, level, mulberry32(seed * 37 + 11)), level, `${id} ${level} seed ${String(seed)}`);
    }
}

const texts = (p: ThemedPuzzle): string[] => p.choices.map((c) => c.text);
const right = (p: ThemedPuzzle): string => p.choices[p.answer].text;
const wrongs = (p: ThemedPuzzle): string[] => texts(p).filter((_, i) => i !== p.answer);

describe('the word lists (sprint 2.16)', () => {
  it('picture words are all different; rhyme families end alike and are long enough', () => {
    expect(new Set(PICTURE_WORDS).size).toBe(PICTURE_WORDS.length);
    for (const [end, words] of Object.entries(RHYMES)) {
      expect(words.length, end).toBeGreaterThanOrEqual(4);
      for (const w of words) expect(w.endsWith(end), `${w} -${end}`).toBe(true);
    }
    for (const [l, words] of Object.entries(FIRST_LETTERS)) {
      expect(words.length, l).toBeGreaterThanOrEqual(P.wordTrain.cars.hard + 1);
      for (const w of words) expect(w.startsWith(l), w).toBe(true);
    }
    for (const [l, words] of Object.entries(ABC_WORDS)) for (const w of words) expect(w.startsWith(l), w).toBe(true);
  });

  it('each growing chain adds one letter at a time', () => {
    for (const chain of GROW_CHAINS) {
      expect(chain.length).toBe(5);
      for (let k = 1; k < chain.length; k++) expect(addsOneLetter(chain[k - 1], chain[k]), chain.join(' ')).toBe(true);
    }
  });

  it('kinds a puzzle sets against each other share no word', () => {
    const easy = Object.values(EASY_KINDS);
    for (let i = 0; i < easy.length; i++)
      for (let j = i + 1; j < easy.length; j++) {
        expect(
          easy[i].words.filter((w) => easy[j].words.includes(w)),
          `${easy[i].name} / ${easy[j].name}`,
        ).toEqual([]);
      }
    for (const [a, b] of HARD_KIND_PAIRS) {
      expect(
        HARD_KINDS[a].words.filter((w) => HARD_KINDS[b].words.includes(w)),
        `${a}/${b}`,
      ).toEqual([]);
    }
  });

  it('a wand magic never turns one word two ways, and every word is in the big list', () => {
    for (const r of WAND_RELATIONS) {
      const from = r.pairs.map(([a]) => a);
      expect(new Set(from).size, r.id).toBe(from.length);
    }
    const words = [
      ...PICTURE_WORDS,
      ...Object.values(EASY_KINDS).flatMap((k) => k.words),
      ...Object.values(HARD_KINDS).flatMap((k) => k.words),
      ...WAND_RELATIONS.flatMap((r) => r.pairs.flat()),
      ...COMPOUNDS.flat(),
    ].filter((w) => w.length >= 3 && w.length <= 8 && !['teddy', 'yoyo'].includes(w));
    const missing = [...new Set(words)].filter((w) => !dictionary.has(w));
    // A few kid words aren't in the list; the puzzles still use them (they're only drawn, not checked).
    expect(missing.length, missing.join(' ')).toBeLessThan(25);
  });

  it('every compound is two words joined, all different', () => {
    const wholes = COMPOUNDS.map(([a, b]) => a + b);
    expect(new Set(wholes).size).toBe(wholes.length);
  });
});

describe('the Words puzzles (sprint 2.16)', () => {
  it('every puzzle: the right number of choices, all different, one answer, a note', () => {
    for (const id of IDS)
      each(id, (p, level, tag) => {
        const want =
          id === 'odd-word-out'
            ? P.oddWordOut.items[level]
            : id === 'missing-letter'
              ? P.missingLetter.cards[level]
              : P.choices[level];
        expect(p.choices.length, tag).toBe(want);
        expect(new Set(texts(p)).size, tag).toBe(want);
        expect(p.answer, tag).toBeGreaterThanOrEqual(0);
        expect(p.why.length, tag).toBeGreaterThan(0);
      });
  });

  it('Word Train: the answer continues the train, and no wrong card does', () => {
    each('word-train', (p, _level, tag) => {
      if (p.stage.kind !== 'train') throw new Error(tag);
      const cars = p.stage.cars.filter((c) => c !== null).map((c) => c.text);
      const last = cars[cars.length - 1];
      const end = /end in -(\w+)/.exec(p.why)?.[1];
      const start = /start with (\w)/.exec(p.why)?.[1]?.toLowerCase();
      if (end) {
        for (const w of [...cars, right(p)]) expect(w.endsWith(end), tag).toBe(true);
        for (const w of wrongs(p)) expect(w.endsWith(end), `${tag} ${w}`).toBe(false);
      } else if (start) {
        for (const w of [...cars, right(p)]) expect(w.startsWith(start), tag).toBe(true);
        for (const w of wrongs(p)) expect(w.startsWith(start), `${tag} ${w}`).toBe(false);
      } else if (p.why.startsWith('Each word adds')) {
        expect(addsOneLetter(last, right(p)), tag).toBe(true);
        for (const w of wrongs(p)) expect(addsOneLetter(last, w), `${tag} ${w}`).toBe(false);
      } else if (/ABC order|Skip a letter|backwards/.test(p.why)) {
        const codes = [...cars, right(p)].map((c) => c.charCodeAt(0));
        const step = codes[1] - codes[0];
        codes.forEach((c, k) => expect(c, tag).toBe(codes[0] + k * step));
      } else if (/first letters/.test(p.why)) {
        const firsts = [...cars, right(p)].map((c) => c.charCodeAt(0));
        const step = firsts[1] - firsts[0];
        expect(step, tag).toBeGreaterThan(0);
        for (const w of wrongs(p)) {
          const want = firsts[firsts.length - 1];
          expect(w.charCodeAt(0), `${tag} ${w}`).not.toBe(want);
        }
      } else {
        // Takes turns: a, b, a, b → a.
        expect(right(p), tag).toBe(cars[cars.length - 2]);
      }
    });
  });

  it('Odd Word Out: the odd word breaks the rule the others keep', () => {
    const kinds = [...Object.values(EASY_KINDS), ...Object.values(HARD_KINDS)];
    each('odd-word-out', (p, _level, tag) => {
      const odd = right(p);
      const others = wrongs(p);
      const kind = kinds.find((k) => p.why === `The others are all ${k.name}!`);
      if (kind) {
        for (const w of others) expect(kind.words, tag).toContain(w);
        expect(kind.words, tag).not.toContain(odd);
        return;
      }
      const end = /end in -(\w+)/.exec(p.why)?.[1];
      const start = /start with (\w)/.exec(p.why)?.[1]?.toLowerCase();
      const len = /have (\d) letters/.exec(p.why)?.[1];
      if (end) {
        for (const w of others) expect(w.endsWith(end), tag).toBe(true);
        expect(odd.endsWith(end), tag).toBe(false);
      } else if (start) {
        for (const w of others) expect(w.startsWith(start), tag).toBe(true);
        expect(odd.startsWith(start), tag).toBe(false);
      } else if (len) {
        for (const w of others) expect(w.length, tag).toBe(Number(len));
        expect(odd.length, tag).not.toBe(Number(len));
      } else {
        throw new Error(`${tag}: unknown note ${p.why}`);
      }
    });
  });

  it('Odd Word Out: only one word stands out, by any rule a child might spot', () => {
    // The owner's shelf: fork is the only one not starting with B, bee the only 3-letter word.
    expect(oddOnesOut(['ball', 'fork', 'bell', 'bee'])).toEqual(new Set(['fork', 'bee']));
    each('odd-word-out', (p, _level, tag) => {
      expect(oddOnesOut(texts(p)), tag).toEqual(new Set([right(p)]));
    });
  });

  it('Word Wand: the answer is the magic done to the next word; no wrong card is', () => {
    each('word-wand', (p, level, tag) => {
      if (p.stage.kind !== 'pair') throw new Error(tag);
      const { from, to, next } = p.stage;
      const rels = WAND_RELATIONS.filter(
        (r) => r.level === level && r.pairs.some(([a, b]) => a === from.text && b === to.text),
      );
      expect(rels.length, tag).toBeGreaterThan(0);
      const ok = rels.some((r) => r.pairs.some(([a, b]) => a === next.text && b === right(p)));
      expect(ok, tag).toBe(true);
      for (const w of wrongs(p)) {
        const alsoRight = rels.some((r) => r.pairs.some(([a, b]) => a === next.text && b === w));
        expect(alsoRight, `${tag} ${w}`).toBe(false);
      }
    });
  });

  it('Missing Letter: the answer fills the gaps (two on Hard) to spell the word; no wrong card spells a real word', () => {
    const fill = (letters: readonly (string | null)[], card: string): string => {
      const put = card.replace(/ /g, '').toLowerCase().split('');
      return letters.map((l) => l ?? put.shift() ?? '?').join('');
    };
    const seen = new Set<string>();
    for (const level of LEVELS)
      for (let seed = 1; seed <= 300; seed++) {
        const p = generateThemed('missing-letter', level, mulberry32(seed * 37 + 11), dictionary);
        const tag = `missing-letter ${level} seed ${String(seed)}`;
        if (p.stage.kind !== 'missing') throw new Error(tag);
        const { letters, picture, word } = p.stage;
        seen.add(word);
        const [lo, hi] = P.missingLetter.letters[level];
        expect(letters.length, tag).toBeGreaterThanOrEqual(lo);
        expect(letters.length, tag).toBeLessThanOrEqual(hi);
        const gaps = P.missingLetter.gaps[level];
        expect(letters.filter((l) => l === null).length, tag).toBe(gaps);
        expect(p.choices.length, tag).toBe(P.missingLetter.cards[level]);
        // One letter per card; the right cards, in gap order, fill the gaps.
        for (const t of texts(p)) expect(t, tag).toMatch(/^[A-Z]$/);
        const answers = p.answers ?? [p.answer];
        expect(answers.length, tag).toBe(gaps);
        expect(new Set(answers.map((a) => texts(p)[a])).size, tag).toBe(gaps);
        expect(fill(letters, answers.map((a) => texts(p)[a]).join('')), tag).toBe(word);
        // Easy and Medium always show the word's picture; Hard never does.
        if (P.missingLetter.pictures[level]) {
          expect(picture, tag).not.toBeNull();
          expect(PICTURE_WORDS[picture!], tag).toBe(word);
        } else {
          expect(picture, tag).toBeNull();
          expect(dictionary.has(word), tag).toBe(true);
        }
        // No wrong letter spells a real word in any gap (the other gaps right).
        const gapAt = letters.flatMap((l, k) => (l === null ? [k] : []));
        texts(p).forEach((t, i) => {
          if (answers.includes(i)) return;
          for (const g of gapAt) {
            const spelled = word.slice(0, g) + t.toLowerCase() + word.slice(g + 1);
            expect(dictionary.has(spelled), `${tag}: ${spelled} is a word`).toBe(false);
          }
        });
      }
    // Far more words than the 50 pictures.
    expect(seen.size).toBeGreaterThan(150);
  });

  it('Missing Letter without the word list sticks to picture words', () => {
    each('missing-letter', (p, level, tag) => {
      if (p.stage.kind !== 'missing') throw new Error(tag);
      expect(PICTURE_WORDS, tag).toContain(p.stage.word);
      expect(p.stage.picture === null, tag).toBe(!P.missingLetter.pictures[level]);
    });
  });

  it('a Missing Letter round never has the same word twice', () => {
    for (const level of LEVELS)
      for (let seed = 1; seed <= 40; seed++) {
        const round = generateThemedRound('missing-letter', level, P.perRound, mulberry32(seed), dictionary);
        const words = round.map((p) => (p.stage.kind === 'missing' ? p.stage.word : ''));
        expect(new Set(words).size, `${level} ${String(seed)}`).toBe(P.perRound);
      }
  });

  it('Word Snap: the halves make the word; on Hard no wrong card makes a real word', () => {
    each('word-snap', (p, level, tag) => {
      if (p.stage.kind !== 'snap') throw new Error(tag);
      const { left, right: r, whole } = p.stage;
      const ans = right(p);
      const made = (left ?? ans) + (r ?? ans);
      expect(
        COMPOUNDS.some(([a, b]) => a + b === made),
        tag,
      ).toBe(true);
      if (whole !== null) expect(whole, tag).toBe(made);
      if (level === 'hard') {
        expect(whole, tag).toBeNull();
        for (const w of wrongs(p)) {
          expect(snapsToWord(left ?? '', w), `${tag} ${w}`).toBe(false);
          expect(dictionary.has((left ?? '') + w), `${tag}: ${String(left)}${w} is a word`).toBe(false);
        }
      }
    });
  });

  it('a round is 8 different puzzles', () => {
    for (const id of IDS)
      for (const level of LEVELS) {
        const round = generateThemedRound(id, level, P.perRound, mulberry32(7));
        expect(round.length).toBe(P.perRound);
        const keys = round.map((p) => JSON.stringify(p.stage) + right(p));
        expect(new Set(keys).size, `${id} ${level}`).toBe(P.perRound);
      }
  });
});
