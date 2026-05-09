// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { AudioManager } from '@/services/AudioManager';
import { PhaserAudioManager } from '@/game/services/PhaserAudioManager';

/**
 * Single-instance factory for the AudioManager. Mirrors the
 * `scoreStoreFactory` pattern: one memoized instance per page lifetime,
 * created at app boot in `src/main.ts`, retrieved from anywhere via
 * `getAudioManager()`.
 *
 * Why one shared instance: mute state and the Phaser scene reference both
 * live on the manager. Creating a new one per round (or per scene) would
 * lose mute mid-session, and would re-create a duplicate sound manager
 * binding that no one knows about.
 *
 * The return type is the pure `AudioManager` facade, NOT the concrete
 * `PhaserAudioManager`. Callers cannot reach Phaser specifics through this
 * factory — same hygiene as `IScoreStore` / `SessionScoreStore`.
 */
let instance: AudioManager | null = null;

export function createAudioManager(): AudioManager {
  if (instance === null) {
    instance = new PhaserAudioManager();
  }
  return instance;
}

/**
 * Alias used by callers who don't want the create-implication. Same instance.
 */
export function getAudioManager(): AudioManager {
  return createAudioManager();
}

/**
 * Test-only reset. The production app NEVER calls this — the singleton is
 * supposed to live for the page lifetime. Tests use it between cases to
 * isolate state.
 */
export function _resetAudioManagerForTests(): void {
  instance = null;
}
