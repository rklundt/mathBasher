// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { GameId } from '@/services/Settings';

/**
 * Asset scope taxonomy — sprint 2.1.6's central concept for partitioning
 * which assets load at boot vs. lazily-on-first-game-pick.
 *
 *   - `'eager'`   — loaded by `BootScene.preload`. Necessary at app
 *                   start (splash, UI 9-slice, button-click SFX,
 *                   parallax stars, nebula bg as the default backdrop).
 *   - `'always'`  — loaded by `BootScene.preload` too — but tagged
 *                   "needed by every game" so the scope mapping is
 *                   honest. Examples: hit/wrong SFX (used by every
 *                   game), `button-click-1` (used by every menu).
 *                   Conceptually distinct from `'eager'` even though
 *                   the boot path treats them identically; the
 *                   distinction surfaces "boot-loaded for technical
 *                   reasons" vs "boot-loaded because both games use
 *                   them" for the next reviewer.
 *   - `'game:<gameId>'` — loaded by the game scene's own
 *                   `preload()` the first time the player picks that
 *                   mode. Phaser's texture cache makes subsequent
 *                   loads no-ops, so the load only ever HAPPENS once
 *                   per session per game. Examples (sprint 2.1.6
 *                   stories 5 + 7): alien spritesheets are
 *                   `game:alien-shoot`; asteroid rocks + asteroid-
 *                   hero ships + `loop-3` + `timeout-fail-1` are
 *                   `game:asteroid-field`.
 *
 * Adding a new game mode = TypeScript exhaustiveness will flag any
 * `isGameScope` switch that forgets to handle it (the `game:${GameId}`
 * template-literal type widens automatically as `GameId` widens).
 */
export type AssetScope = 'eager' | 'always' | `game:${GameId}`;

/**
 * True if the asset should be loaded at boot (eager OR always).
 * `BootScene.preload` filters its manifests by this predicate.
 *
 * Pure function — no side effects. Trivially unit-testable.
 */
export function isBootScope(scope: AssetScope): boolean {
  return scope === 'eager' || scope === 'always';
}

/**
 * True if the asset should be loaded by the given game's scene
 * (`always` is loaded eagerly already but is included here too so a
 * future "lazy-only mode" — where `always` ALSO defers — is a 1-line
 * change in `BootScene`, not a 2-line change across BootScene + each
 * game-scene preloader).
 *
 * Game-scene `preload()` filters its manifests by
 * `isGameScope(entry.scope, this.gameId)`.
 */
export function isGameScope(scope: AssetScope, gameId: GameId): boolean {
  return scope === 'always' || scope === `game:${gameId}`;
}
