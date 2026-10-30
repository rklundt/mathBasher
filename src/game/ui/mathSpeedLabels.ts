// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config, questionSeconds, roundSeconds, type MathId, type SpeedKey } from '@/core/config';
import type { MathGameId } from '@/core/gameIds';
import { RUNGS_PER_DIFFICULTY } from '@/game/systems/numberClimbFloorMath';

/*
 * Sprint 2.15 — the words on a math game's speed tiles, moved here from the
 * old Difficulty screen for the math setup screen (`MathSetupScene`).
 */

/**
 * Per-game speed-button display (label + explanatory subtitle).
 * Sprint 2.2 story 15b — the "Slow/Medium/Fast" labels read awkwardly
 * for Number Climb (which changes rung count + cumulative timer, not
 * enemy speed) so Climb gets "Easy/Medium/Hard" instead. Subtitles give
 * first-time players the exact mechanic per tier; numbers are derived
 * from config so re-tuning timer values auto-updates the display.
 *
 * Exhaustive switch on GameId — TypeScript flags any future game mode
 * that doesn't add its display case here.
 */
export interface SpeedDisplay {
  label: string;
  subtitle: string;
}

/**
 * Per-game section title for the speed-selector row. Most games' setting
 * changes how many targets there are and the time (genuinely a difficulty
 * axis), so "Difficulty" reads better than "Speed". Alien Shoot and
 * Asteroid Field keep "Speed": they really change descent / drift rate.
 * An exhaustive switch (sprint 2.7), so a new game can't silently fall
 * back to "Speed".
 */
export function speedSectionTitleFor(gameId: MathGameId): string {
  switch (gameId) {
    case 'alien-shoot':
    case 'asteroid-field':
      return 'Speed';
    case 'number-climb':
    case 'math-a-lotl':
    case 'frog-splash':
    case 'space-shooter':
    case 'penguin-slide':
    case 'bunny-garden':
    case 'balance-scale':
      return 'Difficulty';
  }
}

/**
 * A round timer as a kid (or parent) reads it: seconds up to 2 minutes,
 * then a clock-style "M:SS" ("3:00", "8:20") — one format across the three
 * tiles. Exact, never rounded up: a tile must not promise more time than
 * the round gives.
 */
export function timerLabel(totalSec: number): string {
  if (totalSec < 120) return `${totalSec}s`;
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
}

/**
 * Label + subtitle for a difficulty tile. Time limits shown are the real
 * ones for the selected math type (sprint 2.5.7 — harder math gets more
 * time), so the subtitles refresh when the math type changes.
 */
export function speedDisplayFor(gameId: MathGameId, key: SpeedKey, mathId: MathId | null): SpeedDisplay {
  switch (gameId) {
    case 'alien-shoot': {
      const map: Record<SpeedKey, SpeedDisplay> = {
        slow: { label: 'Slow', subtitle: 'Aliens descend slowly' },
        medium: { label: 'Medium', subtitle: 'Normal pace' },
        fast: { label: 'Fast', subtitle: 'Aliens descend fast' },
      };
      return map[key];
    }
    case 'asteroid-field': {
      const countdownSec = questionSeconds(key, mathId);
      const labels: Record<SpeedKey, string> = { slow: 'Slow', medium: 'Medium', fast: 'Fast' };
      return { label: labels[key], subtitle: `${countdownSec}s per question` };
    }
    case 'number-climb': {
      const labels: Record<SpeedKey, string> = { slow: 'Easy', medium: 'Medium', fast: 'Hard' };
      const rungs = RUNGS_PER_DIFFICULTY[key];
      const totalSec = roundSeconds(key, mathId, config.numberClimb.questionsPerRound);
      // Sprint 2.4 story 0 — "N floors" lifted OUT of the per-difficulty
      // subtitle (it was constant across all three difficulties and
      // pushed each subtitle wider than its tile, causing visual overlap
      // between the three subtitles in the Difficulty screen's playtest).
      // The floor count is now rendered ONCE as a shared subtitle line
      // on the setup screen. Per-tile subtitles compress to
      // "N rungs · Ms timer" and fit cleanly. (Sprint 2.2.1 story 3
      // originally added the floor count here; the kid-facing intent —
      // "see round length before pressing Start" — is preserved by the
      // shared line.)
      return {
        label: labels[key],
        subtitle: `${rungs} rungs · ${timerLabel(totalSec)} timer`,
      };
    }
    case 'math-a-lotl': {
      // Sprint 2.5.4 — difficulty = bubble count + rise speed + countdown.
      const labels: Record<SpeedKey, string> = { slow: 'Easy', medium: 'Medium', fast: 'Hard' };
      const { bubbleCount } = config.mathALotl.speed[key];
      const countdownSec = questionSeconds(key, mathId);
      return { label: labels[key], subtitle: `${bubbleCount} bubbles · ${countdownSec}s` };
    }
    case 'frog-splash': {
      // Sprint 2.5.6 — difficulty = pads per row + time per hop (+ drift speed).
      const labels: Record<SpeedKey, string> = { slow: 'Easy', medium: 'Medium', fast: 'Hard' };
      const { padCount } = config.frogSplash.speed[key];
      const countdownSec = questionSeconds(key, mathId);
      return { label: labels[key], subtitle: `${padCount} lily pads · ${countdownSec}s` };
    }
    case 'space-shooter': {
      // Sprint 2.6 — difficulty = ships in the window + time per question (+ flight speed).
      const labels: Record<SpeedKey, string> = { slow: 'Easy', medium: 'Medium', fast: 'Hard' };
      const { shipCount } = config.spaceShooter.speed[key];
      const countdownSec = questionSeconds(key, mathId);
      return { label: labels[key], subtitle: `${shipCount} ships · ${countdownSec}s` };
    }
    case 'penguin-slide': {
      // Sprint 2.7 — difficulty = fish per row + time per question.
      const labels: Record<SpeedKey, string> = { slow: 'Easy', medium: 'Medium', fast: 'Hard' };
      const { fishCount } = config.penguinSlide.speed[key];
      const countdownSec = questionSeconds(key, mathId);
      return { label: labels[key], subtitle: `${fishCount} fish · ${countdownSec}s` };
    }
    case 'bunny-garden': {
      // Sprint 2.8 — difficulty = holes in the patch + time per question.
      const labels: Record<SpeedKey, string> = { slow: 'Easy', medium: 'Medium', fast: 'Hard' };
      const { holeCount } = config.bunnyGarden.speed[key];
      const countdownSec = questionSeconds(key, mathId);
      return { label: labels[key], subtitle: `${holeCount} holes · ${countdownSec}s` };
    }
    case 'balance-scale': {
      // Sprint 2.12 — difficulty = weights in the tray + time per question (+ reversed sentences on Medium / Hard).
      const labels: Record<SpeedKey, string> = { slow: 'Easy', medium: 'Medium', fast: 'Hard' };
      const { weights } = config.balanceScale.speed[key];
      const countdownSec = questionSeconds(key, mathId);
      return { label: labels[key], subtitle: `${weights} weights · ${countdownSec}s` };
    }
  }
}

/**
 * The setup screen's question over the speed tiles: "How fast?" for the two
 * games whose setting is speed, "How tough?" for the rest.
 */
export function speedQuestionFor(gameId: MathGameId): string {
  return speedSectionTitleFor(gameId) === 'Speed' ? 'How fast?' : 'How tough?';
}
