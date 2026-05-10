// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';
import { getAudioManager } from '@/services/audioManagerFactory';

/**
 * Standard scene-create boilerplate — logs Started, binds AudioManager
 * to this scene (so PlaceholderButton's pointerdown click-SFX call has
 * a live scene reference), and registers a shutdown listener that logs
 * Completed.
 *
 * Call this as the FIRST line of any scene's `create()` that:
 *   - has buttons (or any other audio-emitting object), AND
 *   - is started in place of another scene (`scene.start(...)`), so
 *     the previously-bound scene reference goes stale.
 *
 * Scenes launched in PARALLEL (HudScene, PauseOverlay, SettingsScene)
 * do NOT need to call this — they overlay an active scene that already
 * bound AudioManager, and Phaser's per-scene sound proxies cooperate
 * across active siblings. BootScene and AttributionScene also skip it
 * (no audio playback).
 *
 * `extraProps` is forwarded to the Started log only — useful for
 * GameOverScene which records the just-finished round's score, math
 * type, and speed on its Started event for telemetry filtering.
 *
 * Replaces the copy-paste pattern across MenuScene, GameSelectScene,
 * DifficultyScene, GameOverScene, GameScene that emerged in sprint
 * 0.5.4's silent-first-click follow-up. Hoisting it here means a
 * future sprint that adds (say) safe-area calculation for mobile only
 * has to touch this file, not 5 scenes.
 */
export function setupScene(scene: Phaser.Scene, extraProps?: TelemetryProps): void {
  const sceneKey = scene.scene.key;
  _th.logToAi(`${sceneKey} Started`, SeverityLevel.Information, extraProps);
  getAudioManager().init(scene);
  scene.events.once('shutdown', () => {
    _th.logToAi(`${sceneKey} Completed`, SeverityLevel.Information);
  });
}
