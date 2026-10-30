// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import { SceneKeys } from '@/core/sceneKeys';
import type { ChallengePickerInit } from '@/game/services/challengeSelection';

/** Sprint 2.15 — open the Game Chooser (the Title Screen's Play). */
export function openChooser(scene: Phaser.Scene): void {
  const init: ChallengePickerInit = { next: SceneKeys.GameSelect, back: SceneKeys.Title, source: 'menu' };
  scene.scene.start(SceneKeys.ChallengePicker, init);
}
