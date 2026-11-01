#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Letter Garden's word list and letter boards (sprint 2.16).
 *
 * Words: SCOWL's everyday English and American words, sizes 10–35 (about
 * 40,000; from the `wordlist-english` dev package, credited in
 * `public/assets/CREDITS.md`), lower-case a–z only, 3 to 8 letters, minus
 * the blocklist (`blocklist.rot13.txt`: rude, hurtful, scary and grown-up
 * words). "Common" words are SCOWL sizes 10–20: the ones a kid most likely
 * knows; the game reveals one of those when the sand runs out.
 *
 * Boards: made here, not in the browser, so the blocklist never ships and
 * every board is checked: enough common words at its level's length, and no
 * blocked word (or stem) can be traced on it. Seeded, so a re-run makes the
 * same boards.
 *
 * Output: public/assets/words/letter-garden-1.json
 *   { common: "a b c …", more: "…", boards: { easy: ["ABCD…"], medium: […], hard: […] } }
 *
 * Usage: pnpm words:build [--force]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolve(ROOT, 'public/assets/words/letter-garden-1.json');
const require = createRequire(import.meta.url);

/** Board size, the shortest word that counts, and how many common words a board must hold. Mirrored in config.puzzles.letterGarden. */
export const LEVELS = {
  easy: { size: 4, minLetters: 3, minCommon: 14 },
  medium: { size: 4, minLetters: 4, minCommon: 10 },
  hard: { size: 5, minLetters: 5, minCommon: 8 },
};
export const BOARDS_PER_LEVEL = 240;
export const MAX_LETTERS = 8;

// ---------------------------------------------------------------- words

const rot13 = (s) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));

/** The blocklist: stems (blocked anywhere in a word) and whole words (with simple endings). */
export function readBlocklist() {
  const lines = readFileSync(resolve(ROOT, 'scripts/words/blocklist.rot13.txt'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'));
  const [stems, words] = lines.map((l) => l.trim().split(/\s+/).map(rot13));
  const endings = ['', 's', 'es', 'ed', 'ing', 'er', 'ers', 'y'];
  const whole = new Set(words.flatMap((w) => endings.map((e) => w + e)));
  return { stems, whole, blocked: (w) => whole.has(w) || stems.some((s) => w.includes(s)) };
}

function scowl(sizes) {
  const out = new Set();
  for (const size of sizes) {
    for (const variant of ['english', 'american']) {
      for (const w of require(`wordlist-english/${variant}-words-${size}.json`)) out.add(w);
    }
  }
  return out;
}

export function buildWords() {
  const { blocked } = readBlocklist();
  const ok = (w) => /^[a-z]+$/.test(w) && w.length >= 3 && w.length <= MAX_LETTERS && !blocked(w);
  const common = [...scowl([10, 20])].filter(ok).sort();
  const commonSet = new Set(common);
  const more = [...scowl([10, 20, 35])].filter((w) => ok(w) && !commonSet.has(w)).sort();
  return { common, more };
}

// ---------------------------------------------------------------- boards

/** A seeded little random so the boards come out the same every run. */
function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Letter weights for the tiles (English frequency; no Q, few X / Z / J so boards stay friendly). */
const WEIGHTS = {
  e: 12,
  t: 8,
  a: 9,
  o: 8,
  i: 7,
  n: 7,
  s: 6,
  r: 6,
  h: 4,
  d: 4,
  l: 4,
  u: 3.5,
  c: 3,
  m: 3,
  f: 2,
  y: 2,
  w: 2,
  g: 2.5,
  p: 2.5,
  b: 2,
  v: 1,
  k: 1,
  x: 0.3,
  j: 0.3,
  z: 0.3,
};
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

function weightedLetter(R) {
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  let r = R() * total;
  for (const [l, w] of Object.entries(WEIGHTS)) {
    r -= w;
    if (r <= 0) return l;
  }
  return 'e';
}

function neighbours(i, size) {
  const x = i % size;
  const y = Math.floor(i / size);
  const out = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) out.push(ny * size + nx);
    }
  return out;
}

/** Every word in `dict` (a Set) traceable on the board (letters touching, each tile once), using `prefixes`. */
export function solve(board, size, dict, prefixes, minLetters) {
  const found = new Set();
  const used = new Array(board.length).fill(false);
  const walk = (i, word) => {
    const w = word + board[i];
    if (!prefixes.has(w)) return;
    if (w.length >= minLetters && dict.has(w)) found.add(w);
    if (w.length >= MAX_LETTERS) return;
    used[i] = true;
    for (const n of neighbours(i, size)) if (!used[n]) walk(n, w);
    used[i] = false;
  };
  for (let i = 0; i < board.length; i++) walk(i, '');
  return found;
}

function prefixSet(words) {
  const p = new Set();
  for (const w of words) for (let k = 1; k <= w.length; k++) p.add(w.slice(0, k));
  return p;
}

/** True if any blocked stem or word can be traced (any length from 3). */
function hasBlocked(board, size, blockedWords, blockedPrefixes) {
  return solve(board, size, blockedWords, blockedPrefixes, 3).size > 0;
}

/** Plant a word along a random path of touching tiles (false if it doesn't fit). */
function plant(board, size, word, R) {
  for (let tries = 0; tries < 30; tries++) {
    const path = [Math.floor(R() * board.length)];
    while (path.length < word.length) {
      const options = neighbours(path[path.length - 1], size).filter((n) => !path.includes(n));
      if (!options.length) break;
      path.push(options[Math.floor(R() * options.length)]);
    }
    if (path.length !== word.length) continue;
    if (path.some((p, k) => board[p] !== null && board[p] !== word[k])) continue;
    path.forEach((p, k) => (board[p] = word[k]));
    return true;
  }
  return false;
}

export function buildBoards(common, more) {
  const { stems, whole } = readBlocklist();
  const all = new Set([...common, ...more]);
  const commonSet = new Set(common);
  const allPrefixes = prefixSet(all);
  const blockedWords = new Set([...stems, ...whole]);
  const blockedPrefixes = prefixSet(blockedWords);
  const out = {};
  for (const [level, L] of Object.entries(LEVELS)) {
    const R = rand(Object.keys(LEVELS).indexOf(level) * 7919 + 17);
    // Planted words never hold Q, X, Z or J: a lone Q tile is almost never any use.
    const seeds = common.filter((w) => w.length >= L.minLetters && w.length <= L.size + 2 && !/[qxzj]/.test(w));
    const boards = new Set();
    for (let guard = 0; boards.size < BOARDS_PER_LEVEL && guard < 200000; guard++) {
      const n = L.size * L.size;
      const board = new Array(n).fill(null);
      for (let k = 0; k < 2; k++) plant(board, L.size, seeds[Math.floor(R() * seeds.length)], R);
      for (let i = 0; i < n; i++) if (board[i] === null) board[i] = weightedLetter(R);
      const vowels = board.filter((c) => VOWELS.has(c)).length;
      if (vowels < Math.round(n * 0.3) || vowels > Math.round(n * 0.55)) continue;
      const found = solve(board, L.size, all, allPrefixes, L.minLetters);
      const commonFound = [...found].filter((w) => commonSet.has(w)).length;
      if (commonFound < L.minCommon) continue;
      if (hasBlocked(board, L.size, blockedWords, blockedPrefixes)) continue;
      boards.add(board.join(''));
    }
    if (boards.size < BOARDS_PER_LEVEL) throw new Error(`${level}: only ${boards.size} boards`);
    out[level] = [...boards];
  }
  return out;
}

// ---------------------------------------------------------------- main

function main() {
  const { common, more } = buildWords();
  const boards = buildBoards(common, more);
  const json = JSON.stringify({ common: common.join(' '), more: more.join(' '), boards });
  if (existsSync(OUT) && !process.argv.includes('--force')) {
    console.error(
      `Refusing to overwrite ${OUT} (pass --force). A changed list should ship under a new name (week-long cache).`,
    );
    process.exit(1);
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, json);
  console.log(
    `wrote ${OUT}: ${common.length} common + ${more.length} more words, ${JSON.stringify(Object.fromEntries(Object.entries(boards).map(([k, v]) => [k, v.length])))} boards, ${(json.length / 1024).toFixed(0)} KB`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
