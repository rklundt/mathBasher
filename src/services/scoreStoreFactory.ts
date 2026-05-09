// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { IScoreStore } from '@/services/IScoreStore';
import { SessionScoreStore } from '@/services/SessionScoreStore';

/**
 * Single call site for "give me the score store the app should use." Gameplay
 * code asks for an `IScoreStore` and never has to know which implementation
 * is wired in.
 *
 * The instance is memoized — `createScoreStore()` (and its alias
 * `getScoreStore()`) returns the SAME `IScoreStore` every call within the
 * lifetime of the page. main.ts calls it once at boot to eagerly initialize;
 * GameScene + GameOverScene call it later and get the same instance, so
 * scores saved in one round are visible to bestForCombo() in the next.
 *
 * When Phase 3 adds an API-backed store with accounts, the swap is **a
 * single change to this file** — every other file consumes the interface and
 * is unchanged.
 */
let instance: IScoreStore | null = null;

export function createScoreStore(): IScoreStore {
  if (!instance) {
    instance = new SessionScoreStore();
  }
  return instance;
}

/** Alias of `createScoreStore()` for call sites that read better as "get". */
export const getScoreStore = createScoreStore;

/**
 * Test-only helper: reset the memoized instance so tests can construct fresh
 * stores without page reload. Production code does NOT call this.
 */
export function _resetScoreStoreForTests(): void {
  instance = null;
}
