// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_SOURCE = readFileSync(resolve(__dirname, 'main.ts'), 'utf8');
const BOOT_SOURCE = readFileSync(resolve(__dirname, 'app/boot.ts'), 'utf8');

/**
 * Static contract test for the boot sequence (sprint 0.5.4 origin,
 * sprint 0.5.5 split — boot orchestration moved from `main.ts` into
 * `src/app/boot.ts`).
 *
 * `Phaser.Game` MUST be constructed inside the splash button's click
 * handler (or via the `?autostart` dev shortcut), NEVER at module load.
 * Doing so synchronously creates a `WebAudioSoundManager` which calls
 * `new AudioContext()` — and the browser warns about that if it happens
 * before any user gesture. Post-0.5.5, the construction physically
 * lives in `bootGame()` in `src/app/boot.ts`, but the architectural
 * rule is the same: never at top level of any module that runs at
 * page load.
 *
 * `main.ts` is now also enforced to be a thin entry — it must NOT
 * import Phaser itself. All Phaser construction is deferred into
 * `bootGame()` which `main.ts` only invokes from inside the splash
 * click handler (or the `?autostart` shortcut).
 *
 * A future contributor who "cleans up" the deferred boot by moving
 * `new Phaser.Game(...)` back to a top-level statement — in main.ts
 * OR boot.ts — would re-introduce the AudioContext warning AND break
 * iOS Safari's first-gesture audio context creation. These tests catch
 * that regression statically — no DOM mocking, no Phaser instantiation,
 * just string scans against the source files.
 */

/**
 * Anchored regex for top-level `Phaser.Game` construction. Catches the
 * five realistic regression shapes a future "cleanup" might introduce:
 *   new Phaser.Game(...)                         (bare construction)
 *   const game = new Phaser.Game(...)            (capture into const)
 *   let game = new Phaser.Game(...)              (capture into let)
 *   var game = new Phaser.Game(...)              (capture into var)
 *   export const game = new Phaser.Game(...)     (export-as-side-effect)
 *
 * The optional declaration prefix is GROUPED so it's a "complete prefix
 * or no prefix" choice — `\s*` is NOT allowed between `^` and the prefix
 * group, so an indented (in-function) call does NOT match.
 */
const TOP_LEVEL_PHASER_GAME =
  /^(?:(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*)?new Phaser\.Game\s*\(/;

function findTopLevelPhaserConstruction(
  source: string,
): { line: string; lineNumber: number }[] {
  return source
    .split('\n')
    .map((line, i) => ({ line, lineNumber: i + 1 }))
    .filter(({ line }) => TOP_LEVEL_PHASER_GAME.test(line));
}

describe('main.ts entry point', () => {
  it('does NOT import Phaser at the top level', () => {
    // main.ts is the thin entry — it wires the splash button and calls
    // bootGame(). Importing Phaser here would pull the whole engine into
    // the module-load graph that runs BEFORE any user gesture, defeating
    // the deferral. boot.ts is the only place that imports Phaser.
    const phaserImports = MAIN_SOURCE.split('\n').filter((line) =>
      /^\s*import\s+.+\s+from\s+['"]phaser['"]/.test(line),
    );
    expect(
      phaserImports,
      `main.ts must NOT import Phaser. The Phaser import lives in src/app/boot.ts,\n` +
        `which main.ts invokes from inside the splash click handler. Importing Phaser\n` +
        `here would pull the engine into the module-load graph and re-introduce the\n` +
        `AudioContext-before-gesture warning. Found:\n` +
        phaserImports.map((l) => `  ${l}`).join('\n'),
    ).toEqual([]);
  });

  it('wires the splash button via addEventListener (gestural boot path)', () => {
    // Codifies that the canonical boot path goes through the splash
    // button's click handler. If a refactor swaps to a different
    // mechanism (e.g. URL query param only, or `setTimeout`), this
    // fails — forcing a deliberate sprint conversation about the
    // boot model.
    expect(MAIN_SOURCE).toMatch(/addEventListener\(['"]click['"]/);
  });
});

describe('src/app/boot.ts boot sequence', () => {
  it('does NOT construct Phaser.Game at module top level', () => {
    // Top-level statements have NO leading whitespace. Statements inside
    // a function body have at least one space/tab of indentation. The
    // canonical home for `new Phaser.Game(...)` is INSIDE `bootGame()`.
    const offendingLines = findTopLevelPhaserConstruction(BOOT_SOURCE);

    expect(
      offendingLines,
      `src/app/boot.ts must NOT construct Phaser.Game at top level. The\n` +
        `construction must live inside the bootGame() function so the\n` +
        `AudioContext is created inside a user-gesture context (browser\n` +
        `requirement; sprint 0.5.4 specifically introduced this deferral).\n` +
        `Found offending top-level statement(s):\n` +
        offendingLines.map((o) => `  line ${o.lineNumber}: ${o.line}`).join('\n'),
    ).toEqual([]);
  });

  it('still constructs Phaser.Game somewhere (sanity check — boot must work at all)', () => {
    // Counterpart to the above: verify Phaser.Game IS instantiated, just
    // not at top level. If a future change accidentally deletes the
    // construction call entirely (e.g. during a refactor), this fails.
    expect(BOOT_SOURCE).toMatch(/new Phaser\.Game\s*\(/);
  });

  it('exports a bootGame function for main.ts to invoke', () => {
    // Codifies the entry-point shape so a refactor can't accidentally
    // un-export bootGame (which would break main.ts at module load).
    expect(BOOT_SOURCE).toMatch(/export\s+function\s+bootGame\s*\(/);
  });
});
