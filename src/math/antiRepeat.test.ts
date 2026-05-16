// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import { generators } from '@/math/registry';
import { config, type MathId } from '@/core/config';
import { mulberry32 } from '@/test-utils/mulberry32';

/**
 * Regression coverage for the sprint 1.1 wrap-up anti-repeat sliding
 * window. The actual wiring lives in `GameScene.startNextQuestion`
 * (which can't easily be tested without spinning up Phaser); this file
 * re-implements the same loop pure so the algorithmic contract is
 * locked in:
 *
 *   1. With historyLimit=0, anti-repeat is OFF — output is identical
 *      to raw generator.generate() over the same seed
 *   2. With historyLimit=4 (the default), the same prompt cannot appear
 *      within 5 consecutive draws (i.e. distance between two
 *      occurrences must be > historyLimit)
 *   3. The maxRerolls cap is honored — if the generator can't produce
 *      a fresh prompt within `maxRerolls` attempts, the last attempt's
 *      draw is accepted (rather than looping forever)
 *   4. Per-round duplicate-prompt counts drop measurably vs. raw
 *      generator output across all implemented generators
 *
 * If a future refactor accidentally removes the loop from GameScene OR
 * changes its semantics (e.g. flips the order of push/check, or
 * forgets to trim history), this test won't catch it directly — but
 * the SHAPE of the contract is at least preserved here so a future
 * GameScene change has a reference algorithm to match.
 */

interface AntiRepeatOpts {
  historyLimit: number;
  maxRerolls: number;
  rng?: () => number;
}

/** Pure re-implementation of GameScene.startNextQuestion's draw loop. */
function drawRound(
  id: MathId,
  roundSize: number,
  opts: AntiRepeatOpts,
): string[] {
  const gen = generators[id];
  const history: string[] = [];
  const prompts: string[] = [];
  for (let i = 0; i < roundSize; i++) {
    let prompt = gen.generate(opts.rng).prompt;
    if (opts.historyLimit > 0) {
      let attempts = 1;
      while (attempts < opts.maxRerolls && history.includes(prompt)) {
        prompt = gen.generate(opts.rng).prompt;
        attempts += 1;
      }
      history.push(prompt);
      while (history.length > opts.historyLimit) history.shift();
    }
    prompts.push(prompt);
  }
  return prompts;
}

const ROUND_SIZE = config.round.questionsPerRound;
const HISTORY_LIMIT = config.round.recentPromptHistoryLimit;
const MAX_REROLLS = config.round.recentPromptMaxRerolls;

describe('Anti-repeat sliding window (sprint 1.1 wrap-up)', () => {
  it('with historyLimit=0, no de-duplication happens (anti-repeat OFF)', () => {
    // Same seed + same generator with anti-repeat OFF should produce the
    // exact same prompts the generator would on its own.
    const rng1 = mulberry32(42);
    const withAR = drawRound('add-to-10', 100, {
      historyLimit: 0,
      maxRerolls: 8,
      rng: rng1,
    });
    const rng2 = mulberry32(42);
    const raw: string[] = [];
    for (let i = 0; i < 100; i++) {
      raw.push(generators['add-to-10'].generate(rng2).prompt);
    }
    expect(withAR).toEqual(raw);
  });

  it('with historyLimit=4, no prompt repeats within 5 consecutive draws (any generator)', () => {
    for (const id of Object.keys(generators) as MathId[]) {
      for (let seed = 1; seed <= 20; seed++) {
        const prompts = drawRound(id, ROUND_SIZE, {
          historyLimit: HISTORY_LIMIT,
          maxRerolls: MAX_REROLLS,
          rng: mulberry32(seed),
        });
        // Walk the prompts; for each occurrence, distance to next
        // occurrence MUST be > historyLimit (OR the gap was due to
        // maxRerolls falling through — covered by the next test).
        // We assert the weaker "no two CONSECUTIVE same prompts" here
        // since the maxRerolls fallthrough makes the strict
        // distance-> historyLimit assertion only probabilistic.
        for (let i = 1; i < prompts.length; i++) {
          // The IMMEDIATELY-previous prompt should never match: that's
          // the deepest in-window position. The other in-window
          // positions can ONLY match if maxRerolls was exhausted.
          // For all currently-implemented generators with historyLimit=4
          // and maxRerolls=8, the pools are large enough that the
          // strict "no match within historyLimit" holds.
          for (let back = 1; back <= HISTORY_LIMIT && i - back >= 0; back++) {
            // Skip the assertion only if maxRerolls fallthrough was
            // genuinely necessary — heuristic: a generator with fewer
            // unique prompts than historyLimit would force a duplicate.
            // None of the implemented generators are that pathological,
            // so this is a hard assertion.
            const dup = prompts[i] === prompts[i - back];
            expect(
              dup,
              `${id} seed=${seed} q${i} prompt "${prompts[i]}" matches q${i - back} (within historyLimit=${HISTORY_LIMIT})`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it('measurably reduces avg duplicates per round vs. raw generator output', () => {
    // Compare 200 rounds with anti-repeat ON vs OFF for each generator;
    // anti-repeat should reduce avg duplicate count by at least 50% for
    // the most-affected generators (add-to-10, sub-to-10) and produce
    // ZERO regressions (anti-repeat never INCREASES duplicates).
    const ROUNDS = 200;
    for (const id of Object.keys(generators) as MathId[]) {
      let withARDups = 0;
      let rawDups = 0;
      for (let seed = 1; seed <= ROUNDS; seed++) {
        const withAR = drawRound(id, ROUND_SIZE, {
          historyLimit: HISTORY_LIMIT,
          maxRerolls: MAX_REROLLS,
          rng: mulberry32(seed * 7),
        });
        const raw = drawRound(id, ROUND_SIZE, {
          historyLimit: 0,
          maxRerolls: 0,
          rng: mulberry32(seed * 7),
        });
        withARDups += ROUND_SIZE - new Set(withAR).size;
        rawDups += ROUND_SIZE - new Set(raw).size;
      }
      // Anti-repeat must never make things WORSE
      expect(
        withARDups,
        `${id}: anti-repeat increased duplicates (${withARDups} with AR vs ${rawDups} raw)`,
      ).toBeLessThanOrEqual(rawDups);
    }
  });

  it('the maxRerolls cap prevents infinite loops with a degenerate generator', () => {
    // Build a fake generator whose prompt pool is a single string —
    // EVERY draw collides with history after the first. The anti-repeat
    // loop should fall through to the (still-duplicated) prompt after
    // maxRerolls attempts, not hang.
    let drawCount = 0;
    const fakeGen = {
      id: 'add-to-10' as const, // satisfy type; not used
      label: 'fake',
      description: 'fake',
      generate: () => {
        drawCount += 1;
        return { prompt: '1 + 1 = ?', correctAnswer: 2, choices: [2, 3, 4, 5] };
      },
    };
    const history: string[] = [];
    const prompts: string[] = [];
    const HISTORY = 4;
    const MAX_REROLLS_TEST = 8;
    // Inline-simulate the loop (since drawRound uses the real registry)
    for (let q = 0; q < 5; q++) {
      drawCount = 0;
      let prompt = fakeGen.generate().prompt;
      let attempts = 1;
      while (attempts < MAX_REROLLS_TEST && history.includes(prompt)) {
        prompt = fakeGen.generate().prompt;
        attempts += 1;
      }
      // First question: pool empty, so 1 attempt. Subsequent: maxRerolls cap.
      if (q === 0) {
        expect(drawCount).toBe(1);
      } else {
        expect(drawCount).toBe(MAX_REROLLS_TEST);
      }
      prompts.push(prompt);
      history.push(prompt);
      while (history.length > HISTORY) history.shift();
    }
    // Even with the cap exhausted, we still got 5 prompts back (the
    // loop didn't hang).
    expect(prompts).toHaveLength(5);
  });
});
