// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Subset of the global `Storage` interface the app's services use. Lets tests
 * pass a minimal in-memory mock without satisfying the full `Storage`
 * contract (which has `length`, `key`, `clear`, etc.).
 *
 * Sprint 2.9.2 — moved here from `AudioManager.ts` (which re-exports it) so
 * `MyScores` can share it.
 */
export interface MinimalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Resolves a default storage backend. In a browser, returns `localStorage`.
 * In the Node test environment, falls back to an in-memory stub so services
 * don't throw on construction — tests that care about persistence pass their
 * own mock instead.
 *
 * NOTE: Node 20+ ships a `globalThis.localStorage` that's an EMPTY stub
 * without `getItem`/`setItem` methods (it's reserved for the experimental
 * `--localstorage-file` flag). A bare truthy check passes that stub
 * through, then the next call into it crashes. We check that the
 * methods are actually functions before trusting the binding.
 *
 * Even reading `globalThis.localStorage` throws in some browsers when
 * storage is blocked (Safari with site data blocked, sandboxed frames), so
 * the lookup is wrapped too.
 */
export function resolveDefaultStorage(): MinimalStorage {
  try {
    const g = globalThis as { localStorage?: unknown };
    const ls = g.localStorage as Partial<MinimalStorage> | undefined;
    if (ls && typeof ls.getItem === 'function' && typeof ls.setItem === 'function') {
      return ls as MinimalStorage;
    }
  } catch {
    // Blocked storage: fall through to memory.
  }
  return new InMemoryStorage();
}

export class InMemoryStorage implements MinimalStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}
