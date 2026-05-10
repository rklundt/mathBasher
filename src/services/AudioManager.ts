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
 * doesn't have to re-mute every game. Per-kind volumes (sfx / midground /
 * music) are also persisted, one localStorage entry each, so adjusting any
 * slider survives a page refresh.
 *
 * MUTE-MASTER RULE: when `isMuted()` is true, `play()` is a no-op and every
 * active loop's volume is silenced — sliders are NOT auto-zeroed. They keep
 * their pre-mute values and resume on unmute. (One-icon kid UX from sprint
 * 0.5.2.)
 */
// localStorage key for the master mute toggle. RETAINED only so the
// constructor can clean up any prior-session value (see constructor).
//
// **Mute is NOT persisted across page reloads** — every fresh page load
// starts UNMUTED, period. Per user direction (post-0.5.3 testing where a
// previous bug accidentally persisted muted=true and made the next session
// mysteriously silent). The mute toggle still works WITHIN a session
// (loops drop to 0 volume, fire stays silent until unmuted), but a refresh
// always brings audio back. Volumes ARE still persisted (see
// VOLUME_STORAGE_KEY_PREFIX below) — those are the kid's preference and
// reasonable to remember. Mute is more like "right now, be quiet."
export const AUDIO_MUTE_STORAGE_KEY = 'mathbasher.audio.muted';

/**
 * The three audio categories the project ships. Each maps to a different
 * shipped folder, encoder profile, and volume slider in SettingsScene.
 */
export type AudioKind = 'sfx' | 'midground' | 'music';

/** All `AudioKind` values, in slider order. Used by SettingsScene. */
export const AUDIO_KINDS: readonly AudioKind[] = ['sfx', 'midground', 'music'];

/**
 * Per-kind default volumes (0–100 integer percent). Tuned so:
 *   - sfx is loud and clear (one-shot fire/click events)
 *   - midground sits beneath sfx (atmospheric loops shouldn't compete)
 *   - music sits beneath midground (background atmosphere)
 * The encoder's per-kind LUFS targets (-16 / -22 / -18) layer with these
 * defaults to produce a sensible mix out of the box.
 */
export const DEFAULT_VOLUMES: Readonly<Record<AudioKind, number>> = {
  sfx: 70,
  midground: 40,
  music: 50,
};

const VOLUME_STORAGE_KEY_PREFIX = 'mathbasher.audio.volume.';
const volumeStorageKey = (kind: AudioKind): string => `${VOLUME_STORAGE_KEY_PREFIX}${kind}`;

/**
 * Opaque handle returned from `playLoop`. Implementation-internal — callers
 * just hold the value and pass it back to `stopLoop`. v1 uses the asset key
 * as the handle (one loop per key — calling `playLoop` for an already-looping
 * key is a no-op), so `LoopHandle === string`. The type alias keeps the
 * internal representation hidden so a future implementation can swap to
 * (e.g.) numeric counters without breaking call sites.
 */
export type LoopHandle = string;

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
  /** In-memory mirror of the per-kind 0–100 percent volumes. */
  protected volumes: Record<AudioKind, number>;

  /**
   * @param storage Pluggable storage backend. Defaults to `globalThis.localStorage`
   *   when present (browser); tests pass an in-memory mock. The Node test
   *   environment doesn't have a real `localStorage` (Node 20+ ships an
   *   empty stub), so the default falls back to a private in-memory
   *   implementation.
   */
  constructor(private readonly storage: MinimalStorage = resolveDefaultStorage()) {
    // Mute always starts OFF on a fresh page load — see AUDIO_MUTE_STORAGE_KEY
    // doc above for the why. Clean up any leftover persisted mute value from
    // before this policy change (a one-time migration; harmless when storage
    // is empty).
    this.muted = false;
    this.storage.removeItem(AUDIO_MUTE_STORAGE_KEY);

    // Volumes DO persist — they're a preference worth remembering across
    // sessions ("the kid likes music quiet").
    this.volumes = {
      sfx: this.readVolume('sfx'),
      midground: this.readVolume('midground'),
      music: this.readVolume('music'),
    };
  }

  // ----- Mute -------------------------------------------------------------

  isMuted(): boolean {
    return this.muted;
  }

  /**
   * Toggle mute. Mute is **session-scoped** — applied immediately to all
   * playback but NOT persisted across page loads. A page refresh always
   * brings audio back. Idempotent.
   *
   * Implementations override to additionally update active loop volumes
   * (mute → drop loops to 0; unmute → restore to slider value). This base
   * class only owns the in-memory state + event log.
   */
  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    _th.logToAi('AudioManager.setMuted', SeverityLevel.Information, {
      reason: muted ? 'muted' : 'unmuted',
    });
    this.onMuteChanged(muted);
  }

  /**
   * Hook for subclasses: called whenever mute state actually changes. Base
   * class is a no-op; PhaserAudioManager uses it to live-update the volume
   * of every active looping sound.
   */
  protected onMuteChanged(_muted: boolean): void {
    // no-op; subclasses override
  }

  // ----- Per-kind volume --------------------------------------------------

  /**
   * Current volume (0–100 integer percent) for the given kind. Reads from
   * the in-memory mirror that was set up at construction (sourced from
   * localStorage with defensive fallbacks).
   */
  getVolume(kind: AudioKind): number {
    return this.volumes[kind];
  }

  /**
   * Set the volume (0–100 integer percent) for the given kind. Clamps
   * out-of-range input. Persists immediately. Notifies subclasses so they
   * can live-update active loops of this kind.
   */
  setVolume(kind: AudioKind, percent: number): void {
    const next = clampPercent(percent);
    if (this.volumes[kind] === next) return;
    this.volumes[kind] = next;
    this.storage.setItem(volumeStorageKey(kind), String(next));
    _th.logToAi('AudioManager.setVolume', SeverityLevel.Information, {
      reason: kind,
    });
    this.onVolumeChanged(kind, next);
  }

  /**
   * Hook for subclasses: called whenever a per-kind volume actually
   * changes. Base class is a no-op; PhaserAudioManager uses it to
   * live-update every active loop of the matching kind so the kid moving
   * a slider mid-round hears the change immediately (no restart click).
   */
  protected onVolumeChanged(_kind: AudioKind, _percent: number): void {
    // no-op; subclasses override
  }

  /**
   * Resolves the EFFECTIVE volume that should apply to a sound of the
   * given kind right now: 0 if muted, otherwise the kind's slider value
   * normalized to a 0.0–1.0 multiplier suitable for Phaser's sound API.
   * Used by both `play` (one-shots) and the loop machinery.
   */
  protected effectiveVolume01(kind: AudioKind): number {
    if (this.muted) return 0;
    return this.volumes[kind] / 100;
  }

  // ----- Playback (one-shots) --------------------------------------------

  /**
   * Play a loaded sound by key. Volume is determined by:
   *   - master mute (if muted, no audio)
   *   - the kind's slider value (defaults to 'sfx' if the kind arg is omitted)
   * Callers cannot pass a raw 0–1 volume — the slider is the source of truth.
   *
   * Missing keys log Warning via `_th.logToAi` and return silently — never
   * throw. The fire loop should not crash because someone forgot to
   * preload an asset.
   *
   * Base class is a no-op (intentional: keeps the test surface free of
   * engine dependencies); the Phaser subclass overrides to actually trigger
   * playback.
   */
  play(_key: string, _kind: AudioKind = 'sfx'): void {
    // Base class is no-op. Phaser subclass overrides.
  }

  // ----- Playback (loops) ------------------------------------------------

  /**
   * Start a looping sound. Returns an opaque handle the caller passes
   * back to `stopLoop`. Volume tracks the kind's slider, live — calling
   * `setVolume(kind, n)` while a loop of that kind is active updates the
   * loop's volume immediately (no restart).
   *
   * Calling `playLoop` for a key that's already looping is a no-op —
   * returns the existing handle. (One loop per key is the v1 contract.)
   *
   * Base class returns the key as a no-op handle; subclasses override to
   * track the actual underlying sound instance.
   */
  playLoop(key: string, _kind: AudioKind): LoopHandle {
    return key;
  }

  /**
   * Stop a looping sound. Idempotent — calling stop twice on the same
   * handle, or calling stop on a handle whose underlying sound has
   * already ended, is a safe no-op.
   */
  stopLoop(_handle: LoopHandle): void {
    // Base class is no-op. Phaser subclass overrides.
  }

  /**
   * Pause every active loop in one call. Used by GameScene's pause() to
   * freeze music + ambient layers along with the rest of the game state.
   * Idempotent.
   */
  pauseAllLoops(): void {
    // Base class is no-op. Phaser subclass overrides.
  }

  /**
   * Resume every paused loop. Used by GameScene's resume(). Idempotent.
   */
  resumeAllLoops(): void {
    // Base class is no-op. Phaser subclass overrides.
  }

  // ----- Lifecycle -------------------------------------------------------

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

  // ----- Internal --------------------------------------------------------

  /**
   * Read a per-kind volume from storage with defensive fallback. Returns
   * the kind's `DEFAULT_VOLUMES` value when:
   *   - no value stored (first run)
   *   - stored value doesn't parse as an integer
   *   - parsed value is outside [0, 100]
   * That last case in particular protects against a corrupted
   * localStorage entry quietly setting volume to (say) NaN or 999.
   */
  private readVolume(kind: AudioKind): number {
    const raw = this.storage.getItem(volumeStorageKey(kind));
    if (raw === null) return DEFAULT_VOLUMES[kind];
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_VOLUMES[kind];
    const asInt = Math.trunc(parsed);
    if (asInt < 0 || asInt > 100) return DEFAULT_VOLUMES[kind];
    return asInt;
  }
}

/** Clamp a percent to the integer range [0, 100]. */
function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  const asInt = Math.trunc(percent);
  if (asInt < 0) return 0;
  if (asInt > 100) return 100;
  return asInt;
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
