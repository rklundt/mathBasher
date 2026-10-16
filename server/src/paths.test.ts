// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAppRoot, resolveDistDir } from './paths.js';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('server paths', () => {
  let tmp: string | null = null;
  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    tmp = null;
  });

  it('finds dist/ from the compiled server location (server/dist/server/src)', () => {
    tmp = mkdtempSync(join(tmpdir(), 'mb-paths-'));
    writeFileSync(join(tmp, 'package.json'), '{}');
    const compiled = join(tmp, 'server', 'dist', 'server', 'src');
    mkdirSync(compiled, { recursive: true });
    expect(findAppRoot(compiled)).toBe(tmp);
    expect(resolveDistDir(compiled)).toBe(join(tmp, 'dist'));
  });

  it('resolves this repo’s dist/ from the server source folder', () => {
    const repoRoot = resolve(HERE, '..', '..');
    expect(resolveDistDir(HERE)).toBe(join(repoRoot, 'dist'));
  });
});
