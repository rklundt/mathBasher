// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { _th, SeverityLevel } from '@/core/telemetry';

/**
 * Cross-cutting audio facade. Pure TypeScript — does NOT import phaser, so
 * it can be unit-tested without spinning up a scene and so other pure
 * services can call it without dragging the engine into their dependency
 * tree.
 *
 * The Phaser-coupled implementation that actually drives WebAudio lives at
 * `src/game/services/PhaserAudioManager.ts` and `extends AudioManager`. The
 * factory in `audioManagerFactory.ts` returns the concrete subclass while
 * exposing this facade type to callers — same pattern as `IScoreStore` /
 * `SessionScoreStore` / `scoreStoreFactory`.
 *
 * Mute is persisted to `localStorage` so a kid who muted last session
 * doesn't have to re-mute every game. The persistence happens in this base
 * class (not the Phaser subclass) because it has nothing to do with the
 * audio engine — it's pure storage.
 */
export const AUDIO_MUTE_STORAGE_KEY = 'mathbasher.audio.muted';

/**
 * Volume cap applied to every `play()` call. Even if a future change in the
 * Phaser subclass passes `volume: 1.0`, the cap still applies. Per the
 * project's audio anti-pattern list: "Default volume is moderate, NEVER 100%."
 */
export const DEFAULT_VOLUME = 0.6;

/**
 * Subset of the global `Storage` interface that this manager actually uses.
 * Lets tests pass a minimal in-memory mock without satisfying the full
 * `Storage` contract (which has `length`, `key`, `clear`, etc.).
 */
export interface MinimalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class AudioManager {
  protected muted: boolean;

  /**
   * @param storage Pluggable storage backend. Defaults to `globalThis.localStorage`
   *   when present (browser); tests pass an in-memory mock. The Node test
   *   environment doesn't have `localStorage`, so the default falls back to
   *   a stub that no-ops reads/writes — matching how a contributor running
   *   tests would expect this to behave.
   */
  constructor(private readonly storage: MinimalStorage = resolveDefaultStorage()) {
    const persisted = this.storage.getItem(AUDIO_MUTE_STORAGE_KEY);
    this.muted = persisted === 'true';
  }

  /**
   * Whether audio is currently muted. Reads in-memory state (already
   * synced with localStorage at construction).
   */
  isMuted(): boolean {
    return this.muted;
  }

  /**
   * Toggle mute. Persists to storage immediately so a tab close right after
   * the toggle still preserves the choice. Idempotent.
   */
  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    this.storage.setItem(AUDIO_MUTE_STORAGE_KEY, muted ? 'true' : 'false');
    _th.logToAi('AudioManager.setMuted', SeverityLevel.Information, {
      reason: muted ? 'muted' : 'unmuted',
    });
  }

  /**
   * Play a loaded sound by key. Volume is always capped to `DEFAULT_VOLUME`
   * (0.6) — callers cannot override this. The base class is a no-op
   * (intentional: keeps the test surface free of engine dependencies); the
   * Phaser subclass overrides to actually trigger playback.
   *
   * Missing keys log a Warning via `_th.logToAi` and return silently —
   * never throw. The fire loop should not crash because someone forgot to
   * preload an asset.
   */
  play(_key: string): void {
    // Base class is no-op. Phaser subclass overrides.
  }

  /**
   * Bind to a Phaser scene. The base class is a no-op and exists only so
   * the pure facade can be called from any layer without the caller
   * needing to know whether the underlying impl is Phaser-coupled. The
   * Phaser subclass overrides to actually capture the scene reference.
   *
   * IMPORTANT: callers MUST invoke `init` from inside a user-gesture
   * handler on iOS Safari. WebAudio cannot be created/resumed outside a
   * gesture, and a `play()` call before init has resolved silently fails.
   */
  init(_scene: unknown): void {
    // Base class is no-op. Phaser subclass overrides.
  }
}

/**
 * Resolves a default storage backend. In a browser, returns `localStorage`.
 * In the Node test environment, falls back to an in-memory stub so
 * AudioManager construction doesn't throw — tests that care about
 * persistence pass their own mock instead.
 *
 * NOTE: Node 20+ ships a `globalThis.localStorage` that's an EMPTY stub
 * without `getItem`/`setItem` methods (it's reserved for the experimental
 * `--localstorage-file` flag). A bare truthy check passes that stub
 * through, then the next call into it crashes. We check that the
 * methods are actually functions before trusting the binding.
 */
function resolveDefaultStorage(): MinimalStorage {
  const g = globalThis as { localStorage?: unknown };
  const ls = g.localStorage as Partial<MinimalStorage> | undefined;
  if (ls && typeof ls.getItem === 'function' && typeof ls.setItem === 'function') {
    return ls as MinimalStorage;
  }
  return new InMemoryStorage();
}

class InMemoryStorage implements MinimalStorage {
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
