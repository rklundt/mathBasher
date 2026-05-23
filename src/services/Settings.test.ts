// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Sprint 2.4.1 story 3 + audit fix — `Settings.heroSkin` persistence
 * + invalid-value rejection. The setting is the first localStorage-
 * backed value on the `Settings` singleton (prior persisted values
 * live on `AudioManager`). Tests cover:
 *
 *   - Default at first read when no key present
 *   - Round-trip set→get
 *   - Invalid strings in storage fall back to default
 *   - `setHeroSkin` writes to localStorage (so reload picks up the
 *     new value)
 *   - Tolerance to localStorage throwing (iOS private mode pre-15,
 *     sandboxed-iframe edge case)
 *
 * Note: Settings reads `localStorage` at MODULE LOAD time to pick
 * the initial value. We use `vi.resetModules()` + a dynamic import
 * per test so each test sees a fresh module-graph instance with
 * its own pre-arranged storage state.
 */

/** Minimal localStorage shim — Map-backed; injectable to throw on access. */
function makeMockStorage(opts: { throwOn?: 'getItem' | 'setItem' | 'both' } = {}): Storage {
  const data = new Map<string, string>();
  const fail = (op: 'getItem' | 'setItem'): never => {
    throw new Error(`localStorage.${op} blocked (test simulation)`);
  };
  return {
    get length(): number { return data.size; },
    clear: () => data.clear(),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    getItem: (k: string): string | null => {
      if (opts.throwOn === 'getItem' || opts.throwOn === 'both') fail('getItem');
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string): void => {
      if (opts.throwOn === 'setItem' || opts.throwOn === 'both') fail('setItem');
      data.set(k, v);
    },
    removeItem: (k: string) => { data.delete(k); },
  };
}

function installStorage(storage: Storage | undefined): void {
  if (storage) {
    (globalThis as { localStorage?: Storage }).localStorage = storage;
  } else {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
}

describe('Settings.heroSkin — persistence + invalid-value handling', () => {
  let originalStorage: Storage | undefined;

  beforeEach(() => {
    originalStorage = (globalThis as { localStorage?: Storage }).localStorage;
    vi.resetModules();
  });

  afterEach(() => {
    installStorage(originalStorage);
    vi.resetModules();
  });

  it('defaults to "space-robot" when no localStorage entry is present', async () => {
    installStorage(makeMockStorage());
    const { Settings } = await import('@/services/Settings');
    expect(Settings.getHeroSkin()).toBe('space-robot');
  });

  it('reads a previously-persisted "og-yellow" value at module load', async () => {
    const storage = makeMockStorage();
    storage.setItem('mathbasher.heroSkin', 'og-yellow');
    installStorage(storage);
    const { Settings } = await import('@/services/Settings');
    expect(Settings.getHeroSkin()).toBe('og-yellow');
  });

  it('rejects unexpected strings in storage + falls back to default', async () => {
    const storage = makeMockStorage();
    storage.setItem('mathbasher.heroSkin', 'banana');
    installStorage(storage);
    const { Settings } = await import('@/services/Settings');
    // Tampered / arbitrary string must NOT widen the HeroSkin union.
    expect(Settings.getHeroSkin()).toBe('space-robot');
  });

  it('setHeroSkin persists to localStorage so a reload picks it up', async () => {
    const storage = makeMockStorage();
    installStorage(storage);
    const { Settings } = await import('@/services/Settings');
    Settings.setHeroSkin('og-yellow');
    expect(storage.getItem('mathbasher.heroSkin')).toBe('og-yellow');
    Settings.setHeroSkin('space-robot');
    expect(storage.getItem('mathbasher.heroSkin')).toBe('space-robot');
  });

  it('tolerates localStorage getItem throwing at module load (iOS private mode)', async () => {
    installStorage(makeMockStorage({ throwOn: 'getItem' }));
    // Must not throw on module import.
    const { Settings } = await import('@/services/Settings');
    // Default value held in memory.
    expect(Settings.getHeroSkin()).toBe('space-robot');
  });

  it('tolerates localStorage setItem throwing (storage quota / sandboxed iframe)', async () => {
    installStorage(makeMockStorage({ throwOn: 'setItem' }));
    const { Settings } = await import('@/services/Settings');
    // Should not throw despite the underlying setItem rejecting.
    Settings.setHeroSkin('og-yellow');
    // In-memory observable still updates so the rest of the session
    // sees the new choice; reload would revert to last-successfully-
    // persisted value (or default if none).
    expect(Settings.getHeroSkin()).toBe('og-yellow');
  });

  it('onHeroSkinChange subscribers fire on every value change', async () => {
    installStorage(makeMockStorage());
    const { Settings } = await import('@/services/Settings');
    const listener = vi.fn();
    const unsub = Settings.onHeroSkinChange(listener);
    Settings.setHeroSkin('og-yellow');
    Settings.setHeroSkin('space-robot');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, 'og-yellow');
    expect(listener).toHaveBeenNthCalledWith(2, 'space-robot');
    unsub();
    Settings.setHeroSkin('og-yellow');
    expect(listener).toHaveBeenCalledTimes(2); // no further calls
  });
});
