// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { ChallengeId, SubjectId } from '@/core/subjects';
import type { PuzzleId } from '@/core/puzzles';
import type Phaser from 'phaser';
import { SceneKeys, puzzleSetupSceneKeyFor, type SceneKey } from '@/core/sceneKeys';
import { puzzleById } from '@/core/puzzles';
import { _th, SeverityLevel } from '@/core/telemetry';
import { Settings, type LastPick } from '@/services/Settings';

/** Sprint 2.9 — where a challenge was picked from (telemetry `source`). */
export type ChallengeSource = 'menu' | 'gameSelect' | 'difficulty' | 'pause' | 'gameOver';

/** Where the challenge picker goes after a pick (`next`) and on Back / Esc (`back`). Set fresh on every opening. */
export interface ChallengePickerInit {
  next: SceneKey;
  back: SceneKey;
  source: ChallengeSource;
  /**
   * Sprint 2.13 — the tab to open on (Back from a puzzle's setup opens on
   * Puzzles). Without it: the last pick's tab, else Math.
   */
  subject?: SubjectId;
}

/**
 * Set the challenge (today's math type). Logs `ChallengeChanged` only on a
 * real change, with the previous challenge as `from`. Returns whether it changed.
 * Always records a math challenge as the last pick (sprint 2.13), even when
 * it's the same challenge as before (picked again after a puzzle).
 */
export function selectChallenge(id: ChallengeId, source: ChallengeSource): boolean {
  Settings.setLastPick('challenge');
  const previous = Settings.round.challengeId;
  if (previous === id) return false;
  Settings.setChallenge(id);
  _th.logToAi('ChallengeChanged', SeverityLevel.Information, { mathId: id, from: previous ?? 'none', source });
  return true;
}

/** Sprint 2.13 — a puzzle picked on the picker: it becomes the last pick (the challenge stays as it was). */
export function selectPuzzle(id: PuzzleId, source: ChallengeSource): void {
  Settings.setLastPick(id);
  _th.logToAi('PuzzlePicked', SeverityLevel.Information, { puzzleId: id, source });
}

/** Where Menu Start goes: the picker, Game Select (math), or a puzzle's setup. */
export type MenuStartTarget = { kind: 'picker' } | { kind: 'game-select' } | { kind: 'puzzle'; puzzle: PuzzleId };

/**
 * Sprint 2.13 — Menu Start goes back to the visit's last pick: a math
 * challenge → Game Select, a puzzle → its setup; nothing yet → the picker.
 * The last pick is checked first: picking a puzzle keeps the challenge set.
 */
export function menuStartTarget(lastPick: LastPick, challengeId: ChallengeId | null): MenuStartTarget {
  if (lastPick !== null && lastPick !== 'challenge') return { kind: 'puzzle', puzzle: lastPick };
  if (challengeId === null) return { kind: 'picker' };
  return { kind: 'game-select' };
}

/**
 * Sprint 2.14 — the game picker, on the Puzzles tab: Back from a puzzle's
 * setup, and Menu from a puzzle (pause card or end panel). Owner: from a
 * puzzle, Menu means the subjects and games, not the title screen.
 */
export function openPuzzlePicker(scene: Phaser.Scene): void {
  const init: ChallengePickerInit = {
    next: SceneKeys.GameSelect,
    back: SceneKeys.Menu,
    source: 'menu',
    subject: 'puzzles',
  };
  scene.scene.start(SceneKeys.ChallengePicker, init);
}

/**
 * Sprint 2.13 — open a puzzle's setup screen, through Loading (the setup
 * shows the puzzle's own pictures, so they're loaded first; once cached,
 * Loading passes straight through). A puzzle that isn't built does nothing.
 */
export function openPuzzle(scene: Phaser.Scene, id: PuzzleId): void {
  const { gameId } = puzzleById(id);
  if (gameId === null) return;
  Settings.setGameId(gameId);
  scene.scene.start(SceneKeys.Loading, { targetSceneKey: puzzleSetupSceneKeyFor(gameId), gameId });
}
