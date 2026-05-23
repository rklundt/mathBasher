// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { _th, SeverityLevel } from '@/core/telemetry';
import type { MathId, SpeedKey } from '@/core/config';
import { createObservable } from '@/services/observable';

/**
 * Cross-scene round selection state. The user picks `gameId` (which game
 * mode), `mathId` (Add to 10, etc.), and `speed` across multiple scenes;
 * this module is the single place that holds the in-flight choice
 * until a game scene reads it on `create`.
 *
 * Sprint 2.1: `gameId` was a bare string with `'alien-shoot'` as the only
 * value; widened to a `GameId` union when Asteroid Field landed. New game
 * modes add a literal to this union + a tile in GameSelectScene + a route
 * to the corresponding scene key.
 *
 * Deliberately a tiny module-level singleton — no event emitter, no
 * subscribers, no Zustand. Scenes read on `create`. If we ever need reactive
 * updates across scenes, we'll add that intentionally.
 */
export type GameId = 'alien-shoot' | 'asteroid-field' | 'number-climb';

/**
 * Sprint 2.4.1 story 3 — Alien Shoot hero skin selector. First time
 * the project lets the kid pick a hero. Two values:
 *  - `'space-robot'` (default for new + existing players) — the new
 *    single static Space Robot sprite from sprint 2.4.1.
 *  - `'og-yellow'` — preserves the original 3-speeder random-per-round
 *    behavior (Speeder1/2/3 round-robin).
 *
 * Persisted to localStorage so the choice survives reloads. Adding a
 * third skin = extend this union + the picker in `spriteKeys.ts` +
 * the SettingsScene UI.
 */
export type HeroSkin = 'space-robot' | 'og-yellow';

export interface RoundSettings {
  gameId: GameId;
  mathId: MathId | null;
  speed: SpeedKey | null;
}

/**
 * Sprint 2.1.9 — observables (gameId, imageAsteroidsEnabled) consume
 * `createObservable<T>` (`src/services/observable.ts`) instead of
 * inline Set + try/catch + idempotence-guard plumbing. Same API
 * (subscribe-returning-unsubscribe + value-changes-fire-listeners
 * semantics) — only the wiring changes.
 *
 * `gameId` observable is the source of truth for game-mode dispatch
 * (BackgroundScene swaps backdrop, future scenes can react). Initial
 * value is `'alien-shoot'` — the default game when the page loads
 * before any tile click.
 *
 * `imageAsteroidsEnabled` observable: ON by default after the v2.1
 * playtest call. Stays in-memory; page reload resets to default.
 * AsteroidFieldScene subscribes to swap LIVE asteroid visuals when
 * the in-game Settings → Game → Asteroid Images toggle flips.
 */
const _gameId = createObservable<GameId>('gameId', 'alien-shoot');
const _imageAsteroidsEnabled = createObservable<boolean>('imageAsteroidsEnabled', true);

/**
 * Sprint 2.4.1 story 3 — hero skin selector for Alien Shoot.
 * `localStorage`-backed so the kid's choice survives reloads. Mirrors
 * AudioManager's persisted-volume pattern (one localStorage key per
 * stored value, try/catch around storage access for iOS-private-mode
 * tolerance). Default is `'space-robot'` — both new players AND
 * existing players whose localStorage has no entry land on the new
 * sprite by default; the latter can opt back to `'og-yellow'` via
 * Settings → Game → Hero.
 */
const HERO_SKIN_STORAGE_KEY = 'mathbasher.heroSkin';
const HERO_SKIN_DEFAULT: HeroSkin = 'space-robot';

function readPersistedHeroSkin(): HeroSkin {
  try {
    const raw = globalThis.localStorage?.getItem(HERO_SKIN_STORAGE_KEY);
    if (raw === 'space-robot' || raw === 'og-yellow') return raw;
  } catch {
    // Storage unavailable (iOS private mode pre-15, sandboxed iframe).
    // Fall through to default.
  }
  return HERO_SKIN_DEFAULT;
}

const _heroSkin = createObservable<HeroSkin>('heroSkin', readPersistedHeroSkin());

const state: Omit<RoundSettings, 'gameId'> = {
  mathId: null,
  speed: null,
};

export const Settings = {
  /**
   * Snapshot of the current selection. Read-only access for scenes.
   * `gameId` is sourced from the observable; `mathId` + `speed` from
   * the local state (they're not observable — read once at scene
   * `create` time, no reactive consumers today).
   */
  get round(): Readonly<RoundSettings> {
    return { gameId: _gameId.get(), mathId: state.mathId, speed: state.speed };
  },

  setGameId(id: GameId): void {
    const previous = _gameId.get();
    _gameId.set(id);
    // Telemetry fires only on real changes (observable.set is
    // idempotent). Log AFTER set so a listener throwing doesn't
    // suppress the audit-trail event.
    if (previous !== id) {
      _th.logToAi('Settings.setGameId', SeverityLevel.Information, { gameId: id });
    }
  },

  setMathId(id: MathId): void {
    state.mathId = id;
    _th.logToAi('Settings.setMathId', SeverityLevel.Information, { mathId: id });
  },

  setSpeed(s: SpeedKey): void {
    state.speed = s;
    _th.logToAi('Settings.setSpeed', SeverityLevel.Information, { speed: s });
  },

  /** Clear math + speed selection (e.g. after a round completes). gameId persists. */
  reset(): void {
    state.mathId = null;
    state.speed = null;
    _th.logToAi('Settings.reset', SeverityLevel.Information);
  },

  /** True when both math and speed are picked — the Start button uses this. */
  isReady(): boolean {
    return state.mathId !== null && state.speed !== null;
  },

  // ----- Asteroid Field visual-mode toggle (sprint 2.1 playtest) -----

  /**
   * Whether to render asteroids as Midjourney image sprites (true) or
   * as procedural polygons (false, default). Read by `AsteroidWaveSystem`
   * at spawn time; not reactive — asteroids spawned BEFORE a toggle
   * change keep their original look until the next wave.
   */
  getImageAsteroidsEnabled(): boolean {
    return _imageAsteroidsEnabled.get();
  },

  setImageAsteroidsEnabled(enabled: boolean): void {
    const previous = _imageAsteroidsEnabled.get();
    _imageAsteroidsEnabled.set(enabled);
    if (previous !== enabled) {
      _th.logToAi('Settings.setImageAsteroidsEnabled', SeverityLevel.Information, {
        reason: enabled ? 'enabled' : 'disabled',
      });
    }
  },

  /**
   * Subscribe to image-asteroids toggle changes. Returns an
   * unsubscribe function — call it on scene shutdown so the listener
   * doesn't outlive the scene that owns it.
   */
  onImageAsteroidsChange(listener: (enabled: boolean) => void): () => void {
    return _imageAsteroidsEnabled.subscribe(listener);
  },

  /**
   * Subscribe to game-mode (`gameId`) changes. Returns an unsubscribe
   * function. Sprint 2.1.1 — `BackgroundScene` uses this to swap
   * gameplay backdrops when the player enters a different mode.
   * Persistent (BackgroundScene-lifetime) subscribers don't need to
   * unsubscribe; per-scene subscribers should call the returned
   * function on shutdown.
   */
  onGameIdChange(listener: (gameId: GameId) => void): () => void {
    return _gameId.subscribe(listener);
  },

  // ----- Alien Shoot hero skin (sprint 2.4.1 story 3) ----------------

  /**
   * Current Alien Shoot hero skin. Read by `pickNextHeroSpriteKey` at
   * round-start to decide between the static Space Robot sprite and
   * the original Speeder1/2/3 round-robin.
   */
  getHeroSkin(): HeroSkin {
    return _heroSkin.get();
  },

  /**
   * Set the hero skin + persist to localStorage. Telemetry fires only
   * on real changes (observable is idempotent). The try/catch around
   * localStorage matches `readPersistedHeroSkin` above — a storage
   * failure logs the choice in memory but doesn't break the toggle.
   */
  setHeroSkin(skin: HeroSkin): void {
    const previous = _heroSkin.get();
    _heroSkin.set(skin);
    try {
      globalThis.localStorage?.setItem(HERO_SKIN_STORAGE_KEY, skin);
    } catch {
      // Storage write failed — the in-memory observable is still
      // updated so the rest of this session reflects the choice;
      // page reload reverts to whatever persisted last (or default).
    }
    if (previous !== skin) {
      _th.logToAi('Settings.setHeroSkin', SeverityLevel.Information, {
        reason: skin,
      });
    }
  },

  /**
   * Subscribe to hero-skin changes. Returns an unsubscribe function.
   * Today no scene needs reactive updates (the picker reads on each
   * round-start, not continuously), but the subscriber API is here
   * for parity with the other observables and to make a future
   * mid-game live-swap a 1-line addition.
   */
  onHeroSkinChange(listener: (skin: HeroSkin) => void): () => void {
    return _heroSkin.subscribe(listener);
  },
};
