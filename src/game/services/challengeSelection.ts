// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { MathId } from '@/core/config';
import type { SceneKey } from '@/core/sceneKeys';
import { _th, SeverityLevel } from '@/core/telemetry';
import { Settings } from '@/services/Settings';

/** Sprint 2.9 — where a challenge was picked from (telemetry `source`). */
export type ChallengeSource = 'menu' | 'gameSelect' | 'difficulty' | 'pause' | 'gameOver';

/** Where the challenge picker goes after a pick (`next`) and on Back / Esc (`back`). Set fresh on every opening. */
export interface ChallengePickerInit {
  next: SceneKey;
  back: SceneKey;
  source: ChallengeSource;
}

/**
 * Set the challenge (today's math type). Logs `ChallengeChanged` only on a
 * real change, with the previous challenge as `from`. Returns whether it changed.
 */
export function selectChallenge(id: MathId, source: ChallengeSource): boolean {
  const previous = Settings.round.mathId;
  if (previous === id) return false;
  Settings.setMathId(id);
  _th.logToAi('ChallengeChanged', SeverityLevel.Information, { mathId: id, from: previous ?? 'none', source });
  return true;
}
