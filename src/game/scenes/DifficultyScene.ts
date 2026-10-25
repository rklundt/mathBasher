// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { config, questionSeconds, roundSeconds, type MathId, type SpeedKey } from '@/core/config';
import { SceneKeys, gameSceneKeyFor } from '@/core/sceneKeys';
import { Settings, type GameId } from '@/services/Settings';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { text } from '@/game/ui/typography';
import { applyTextOutline } from '@/game/ui/callouts';
import { createChallengeChip } from '@/game/ui/ChallengeChip';
import type { ChallengePickerInit } from '@/game/services/challengeSelection';
import { fractionLevelNote, upToPointsLabel } from '@/services/challengePoints';
import { setupScene } from '@/game/scenes/sceneSetup';
import { RUNGS_PER_DIFFICULTY } from '@/game/systems/numberClimbFloorMath';

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
interface SpeedDisplay {
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
function speedSectionTitleFor(gameId: GameId): string {
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
function timerLabel(totalSec: number): string {
  if (totalSec < 120) return `${totalSec}s`;
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
}

/**
 * Label + subtitle for a difficulty tile. Time limits shown are the real
 * ones for the selected math type (sprint 2.5.7 — harder math gets more
 * time), so the subtitles refresh when the math type changes.
 */
function speedDisplayFor(gameId: GameId, key: SpeedKey, mathId: MathId | null): SpeedDisplay {
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
      // between the three subtitles in the DifficultyScene playtest).
      // The floor count is now rendered ONCE as a shared subtitle line
      // in `renderSpeeds` below. Per-tile subtitles compress to
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

/** The game's name as its Game Select tile shows it (the Difficulty heading uses it). */
function gameDisplayName(gameId: GameId): string {
  switch (gameId) {
    case 'alien-shoot':
      return 'Alien Shoot';
    case 'asteroid-field':
      return 'Asteroid Field';
    case 'number-climb':
      return 'Space Escape!';
    case 'math-a-lotl':
      return 'Math-a-lotl';
    case 'frog-splash':
      return 'Frog Splash';
    case 'space-shooter':
      return 'Space Shooter';
    case 'penguin-slide':
      return 'Penguin Slide';
    case 'bunny-garden':
      return 'Bunny Garden';
    case 'balance-scale':
      return 'Balance Scale';
  }
}

/** "Bunny Garden: how tough?", or "Alien Shoot: how fast?" for the two games whose setting is speed. */
function headingFor(gameId: GameId): string {
  const question = speedSectionTitleFor(gameId) === 'Speed' ? 'how fast?' : 'how tough?';
  // "Space Escape!: how tough?" reads oddly, so a name's own "!" is dropped here.
  return `${gameDisplayName(gameId).replace(/!$/, '')}: ${question}`;
}

/**
 * Difficulty, per game (sprint 2.9: the challenge is picked before the
 * game, on the challenge picker; this screen only picks Easy / Medium /
 * Hard). Each tile keeps the game's own label ("3 holes · 25s") and shows
 * "Up to 1,500 points!" for the current challenge; a fraction challenge
 * adds what changes with the level. The challenge chip at the top opens
 * the picker and comes back here.
 *
 * Arriving with no challenge (it shouldn't happen: the first Start of a
 * visit opens the picker) sends the kid to the picker rather than showing
 * a Start that can't work.
 */
export class DifficultyScene extends Phaser.Scene {
  static readonly key = SceneKeys.Difficulty;

  private speedButtons: Map<SpeedKey, PlaceholderButton> = new Map();
  private startButton?: PlaceholderButton;

  constructor() {
    super(DifficultyScene.key);
  }

  create(): void {
    setupScene(this);
    // Phaser reuses the scene instance: drop the previous visit's objects.
    this.speedButtons.clear();

    const { challengeId: mathId } = Settings.round;
    if (mathId === null) {
      _th.logToAi('DifficultyScene.noChallenge', SeverityLevel.Warning, { gameId: Settings.round.gameId });
      const init: ChallengePickerInit = {
        next: SceneKeys.Difficulty,
        back: SceneKeys.GameSelect,
        source: 'difficulty',
      };
      this.scene.start(SceneKeys.ChallengePicker, init);
      return;
    }
    if (Settings.round.speed === null) Settings.setSpeed('medium');

    const { width } = this.scale;
    const cx = width / 2;
    const L = config.layout.challengeFlow.difficulty;
    const gameId = Settings.round.gameId;

    text(this, cx, L.headingY, headingFor(gameId), 'h2').setOrigin(0.5);
    const chip = createChallengeChip(this, cx, L.chipY, () => {
      const init: ChallengePickerInit = {
        next: SceneKeys.Difficulty,
        back: SceneKeys.Difficulty,
        source: 'difficulty',
      };
      this.scene.start(SceneKeys.ChallengePicker, init);
    });

    // Space Escape: the round length is the same at every level, so it's
    // said once, here, not on each tile.
    if (gameId === 'number-climb') {
      text(this, cx, L.floorsY, `${config.numberClimb.questionsPerRound} floors per round`, 'subtitle').setOrigin(0.5);
    }

    this.renderSpeeds(cx, gameId, mathId);

    this.startButton = new PlaceholderButton({
      scene: this,
      x: cx + L.backW / 2 + 20,
      y: L.buttonsY,
      width: L.startW,
      height: L.buttonH,
      label: 'Start',
      onClick: () => this.start(),
    });
    const back = new PlaceholderButton({
      scene: this,
      x: cx - L.startW / 2 - 20,
      y: L.buttonsY,
      width: L.backW,
      height: L.buttonH,
      label: 'Back',
      onClick: () => this.scene.start(SceneKeys.GameSelect),
    });

    // Tab order: the chip, the three levels, Start, Back. Focus lands on
    // Start (an Enter-masher plays; it doesn't re-open the picker).
    const tabOrder: PlaceholderButton[] = [chip, ...this.speedButtons.values(), this.startButton, back];
    new KeyboardNavigator(this, tabOrder, { initialIndex: tabOrder.indexOf(this.startButton) });

    // Esc returns to the previous step in the menu stack.
    wireEscBack(this, () => this.scene.start(SceneKeys.GameSelect));

    this.refreshSelection();
  }

  private renderSpeeds(cx: number, gameId: GameId, mathId: MathId): void {
    const L = config.layout.challengeFlow.difficulty;
    const speedKeys: SpeedKey[] = ['slow', 'medium', 'fast'];
    const { w, h, gapX } = L.tile;
    const startX = cx - (speedKeys.length * w + (speedKeys.length - 1) * gapX) / 2 + w / 2;

    speedKeys.forEach((key, i) => {
      const display = speedDisplayFor(gameId, key, mathId);
      const x = startX + i * (w + gapX);
      const button = new PlaceholderButton({
        scene: this,
        x,
        y: L.tileY,
        width: w,
        height: h,
        label: display.label,
        subtitle: display.subtitle,
        onClick: () => {
          Settings.setSpeed(key);
          this.refreshSelection();
        },
      });
      this.speedButtons.set(key, button);

      // "Up to 1,500 points!" under the tile: the round's top score for this
      // challenge at this level (from the scoring config, so it never drifts).
      const upTo = text(this, x, L.tileY + h / 2 + L.upToGapPx, upToPointsLabel(gameId, mathId, key), 'bodyAccent');
      upTo.setOrigin(0.5, 0);
      applyTextOutline(upTo);
      const note = fractionLevelNote(mathId, key);
      if (note !== null) {
        const noteText = text(this, x, L.tileY + h / 2 + L.noteGapPx, note, 'buttonSubtitle').setOrigin(0.5, 0);
        applyTextOutline(noteText);
      }
    });
  }

  private start(): void {
    if (!Settings.isReady()) return;
    // Route by gameId through LoadingScene (sprint 2.1.8) so the per-game
    // asset bundle shows a visible bar. Exhaustive per ADR-0011.
    const targetSceneKey = gameSceneKeyFor(Settings.round.gameId);
    this.scene.start(SceneKeys.Loading, { targetSceneKey, gameId: Settings.round.gameId });
  }

  private refreshSelection(): void {
    const { speed } = Settings.round;
    for (const [key, btn] of this.speedButtons) btn.setSelected(key === speed);
    this.startButton?.setDisabled(!Settings.isReady());
  }
}
