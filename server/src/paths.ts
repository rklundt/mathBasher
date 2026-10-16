// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The nearest folder at or above `startDir` that holds a `package.json` —
 * the app root, both in the repo and in the Docker image (`/app`). Walking up
 * keeps this independent of where tsc puts the compiled server (today
 * `server/dist/server/src/`, because `rootDir` is the project root).
 * Returns null if no `package.json` is found.
 */
export function findAppRoot(startDir: string): string | null {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The Vite client build (`<app root>/dist`) the server serves. */
export function resolveDistDir(moduleDir: string): string {
  const root = findAppRoot(moduleDir);
  if (root === null) throw new Error(`No package.json found at or above ${moduleDir}`);
  return join(root, 'dist');
}
