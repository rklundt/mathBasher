// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

// Runs on `pnpm install` (the `prepare` script). Points this clone's git at
// the committed hooks in `.githooks/` (sprint 2.6.4, ADR-0013).
//
// It does nothing — and never fails the install — when there's no git
// checkout to configure: on CI, in the Docker build (no `.git`, no git
// binary), or in a source download without `.git`. Settings are written at
// local scope only, never globally.

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const skip = (why) => {
  console.log(`install-hooks: skipped (${why}).`);
  process.exit(0);
};

if (process.env.CI) skip('CI');
if (!existsSync('.git')) skip('no .git folder');
if (spawnSync('git', ['--version'], { stdio: 'ignore' }).status !== 0) skip('git not found');

const get = (key) => spawnSync('git', ['config', '--local', '--get', key], { encoding: 'utf8' }).stdout.trim();
const set = (key, value) => spawnSync('git', ['config', '--local', key, value], { stdio: 'ignore' }).status === 0;

const previous = get('core.hooksPath');
if (previous && previous !== '.githooks') {
  console.log(`install-hooks: replacing your core.hooksPath ("${previous}") with .githooks; set it back with git config --local core.hooksPath "${previous}".`);
}
if (!set('core.hooksPath', '.githooks')) skip('could not write git config');
// Deliberately not setting blame.ignoreRevsFile: git then refuses to blame
// any checkout without that file (see ADR-0013).
console.log('install-hooks: git hooks enabled (.githooks/).');
