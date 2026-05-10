// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_SOURCE = readFileSync(resolve(__dirname, 'main.ts'), 'utf8');

/**
 * Static contract test for the boot sequence (sprint 0.5.4).
 *
 * `Phaser.Game` MUST be constructed inside the splash button's click
 * handler (or via the `?autostart` dev shortcut), NEVER at module load.
 * Doing so synchronously creates a `WebAudioSoundManager` which calls
 * `new AudioContext()` — and the browser warns about that if it happens
 * before any user gesture.
 *
 * A future contributor who "cleans up" the deferred boot by moving
 * `new Phaser.Game(...)` back to a top-level statement would re-introduce
 * the AudioContext warning AND break iOS Safari's first-gesture audio
 * context creation. This test catches that regression statically — no
 * DOM mocking, no Phaser instantiation, just a string scan against the
 * source file.
 */
describe('main.ts boot sequence', () => {
  it('does NOT construct Phaser.Game at module top level', () => {
    // Top-level statements have NO leading whitespace. Statements inside
    // a function body have at least one space/tab of indentation.
    const lines = MAIN_SOURCE.split('\n');
    const offendingLines = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => /^new Phaser\.Game\s*\(/.test(line));

    expect(
      offendingLines,
      `main.ts must NOT construct Phaser.Game at top level. The construction\n` +
        `must live inside the splash click handler (the startGame function) so\n` +
        `the AudioContext is created inside a user-gesture context (browser\n` +
        `requirement; sprint 0.5.4 specifically introduced this deferral).\n` +
        `Found offending top-level statement(s):\n` +
        offendingLines.map((o) => `  line ${o.i + 1}: ${o.line}`).join('\n'),
    ).toEqual([]);
  });

  it('still constructs Phaser.Game somewhere (sanity check — boot must work at all)', () => {
    // Counterpart to the above: verify Phaser.Game IS instantiated, just
    // not at top level. If a future change accidentally deletes the
    // construction call entirely (e.g. during a refactor), this fails.
    expect(MAIN_SOURCE).toMatch(/new Phaser\.Game\s*\(/);
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
