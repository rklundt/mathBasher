// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { config, type MathId, type SpeedKey } from '@/core/config';
import { SceneKeys, gameSceneKeyFor } from '@/core/sceneKeys';
import { isMathGameId, type MathGameId } from '@/core/gameIds';
import { CHALLENGE_SUBJECTS } from '@/core/subjects';
import { generators, getImplementedIds } from '@/math/registry';
import { Settings } from '@/services/Settings';
import { getRememberedPicks } from '@/services/RememberedPicks';
import { getScoreStore } from '@/services/scoreStoreFactory';
import { formatPoints, fractionLevelNote, pointsMultiplierLabel, upToPointsLabel } from '@/services/challengePoints';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { computeGridSlots } from '@/game/ui/menuLayoutGeometry';
import { createChoiceTile } from '@/game/ui/choiceTile';
import { createSetupFrame, sectionHeading, type SetupFrame } from '@/game/ui/setupFrame';
import { speedDisplayFor, speedQuestionFor } from '@/game/ui/mathSpeedLabels';
import { text, TEXT_AMBER, TEXT_SOFT } from '@/game/ui/typography';
import { setupScene } from '@/game/scenes/sceneSetup';
import { openChooser } from '@/game/services/chooserNavigation';

const SPEEDS: readonly SpeedKey[] = ['slow', 'medium', 'fast'];

/** The math type a first visit opens on. */
const FIRST_CHALLENGE: MathId = 'add-to-10';

/** "Best this visit: 2,150 points" (the high scores last until the page reloads). */
export function mathBestLine(best: number | null): string {
  return best === null ? 'Play a round to set your best!' : `Best this visit: ${formatPoints(best)} points`;
}

/**
 * Sprint 2.15 — a math game's setup screen (it replaced Difficulty; the math
 * type is picked per game again, owner 2026-10-29): **What math?** (the 11
 * types, each with its points under it) and **How fast?** / **How tough?**
 * (the game's own three levels, each with "Up to N points!" for the type
 * picked; a fraction type shows what changes instead of the game's line).
 * Both picks are remembered and already selected (the type is shared by
 * every math game, the speed is per game), so Start is one tap.
 *
 * Start goes through Loading to the game; Back to the games list.
 */
export class MathSetupScene extends Phaser.Scene {
  static readonly key = SceneKeys.MathSetup;

  private gameId: MathGameId = 'alien-shoot';
  private frame!: SetupFrame;
  private chips: PlaceholderButton[] = [];
  private chipIds: MathId[] = [];
  /** The speed tiles and their "Up to" lines (redrawn when the math type changes). */
  private speedTiles: PlaceholderButton[] = [];
  private speedExtras: Phaser.GameObjects.GameObject[] = [];
  private nav?: KeyboardNavigator;

  constructor() {
    super(MathSetupScene.key);
  }

  create(): void {
    setupScene(this);
    const gameId = Settings.round.gameId;
    if (!isMathGameId(gameId)) {
      _th.logToAi('MathSetupScene.notMathGame', SeverityLevel.Warning, { gameId });
      openChooser(this);
      return;
    }
    this.gameId = gameId;
    this.chips = [];
    this.chipIds = [];
    this.speedTiles = [];
    this.speedExtras = [];
    this.nav = undefined;
    if (Settings.round.challengeId === null) Settings.setChallenge(FIRST_CHALLENGE);

    this.frame = createSetupFrame(this, gameId, 'MathSetupScene', () => this.start());
    this.buildChips();
    this.buildSpeeds(this.frame.start);
  }

  /** "What math?": the types, 4 to a row, each ringed when picked, its points under it. */
  private buildChips(): void {
    const M = config.layout.chooser.mathSetup;
    sectionHeading(this, M.mathHeadingY, 'What math?');
    const ids = CHALLENGE_SUBJECTS[0].challenges;
    const ready = new Set(getImplementedIds());
    const current = Settings.round.challengeId;
    const slots = computeGridSlots(this.scale.width / 2, M.chips.firstRowY, ids.length, M.chips);
    ids.forEach((id, i) => {
      const s = slots[i];
      const chip = new PlaceholderButton({
        scene: this,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        label: generators[id].label,
        labelKind: 'pickLabel',
        selected: id === current,
        disabled: !ready.has(id),
        onClick: () => this.pickMath(id),
      });
      const mult = config.scoring.mathDifficulty[id];
      const points = text(this, s.x, s.y + s.height / 2 + M.pointsGapPx, pointsMultiplierLabel(id), 'pickPoints');
      points.setOrigin(0.5, 0).setColor(mult > 1 ? TEXT_AMBER : TEXT_SOFT);
      this.chips.push(chip);
      this.chipIds.push(id);
    });
  }

  /** "How fast?": the game's three levels for the current type; then the Tab order. */
  private buildSpeeds(focus: PlaceholderButton): void {
    for (const obj of [...this.speedTiles, ...this.speedExtras]) obj.destroy();
    this.speedTiles = [];
    this.speedExtras = [];

    const M = config.layout.chooser.mathSetup;
    const mathId = Settings.round.challengeId ?? FIRST_CHALLENGE;
    const speed = Settings.round.speed;
    const heading = sectionHeading(this, M.speedHeadingY, speedQuestionFor(this.gameId));
    this.speedExtras.push(heading);
    // Space Escape: the round length is the same at every level, so it's said once.
    if (this.gameId === 'number-climb') {
      const floors = `${String(config.numberClimb.questionsPerRound)} floors per round`;
      const note = text(this, heading.x + heading.width + 20, M.speedHeadingY, floors, 'tileLine').setOrigin(0, 0.5);
      this.speedExtras.push(note);
    }

    const T = M.speeds;
    const x0 = this.scale.width / 2 - T.w - T.gapX;
    SPEEDS.forEach((key, i) => {
      const x = x0 + i * (T.w + T.gapX);
      const display = speedDisplayFor(this.gameId, key, mathId);
      const tile = createChoiceTile({
        scene: this,
        x,
        y: T.y,
        width: T.w,
        height: T.h,
        name: display.label,
        nameKind: 'tileName',
        lines: [{ text: fractionLevelNote(mathId, key) ?? display.subtitle, kind: 'tileLine' }],
        selected: key === speed,
        onClick: () => this.pickSpeed(key),
      });
      const upTo = text(this, x, T.y + T.h / 2 + M.upToGapPx, upToPointsLabel(this.gameId, mathId, key), 'upTo');
      this.speedTiles.push(tile);
      this.speedExtras.push(upTo.setOrigin(0.5, 0));
    });

    // Tab order: top bar, trail, the types, the levels, Start.
    this.nav?.destroy();
    const order = [...this.frame.top, ...this.chips, ...this.speedTiles, this.frame.start];
    this.nav = new KeyboardNavigator(this, order, { initialIndex: order.indexOf(focus) });
    void this.refreshBest();
  }

  private pickMath(id: MathId): void {
    if (id !== Settings.round.challengeId) {
      _th.logToAi('ChallengeChanged', SeverityLevel.Information, {
        mathId: id,
        from: Settings.round.challengeId ?? 'none',
        source: 'setup',
      });
      Settings.setChallenge(id);
    }
    this.chips.forEach((chip, i) => chip.setSelected(this.chipIds[i] === id));
    // The levels' points and fraction notes follow the type.
    this.buildSpeeds(this.chips[this.chipIds.indexOf(id)]);
  }

  private pickSpeed(key: SpeedKey): void {
    Settings.setSpeed(key);
    this.speedTiles.forEach((tile, i) => tile.setSelected(SPEEDS[i] === key));
    void this.refreshBest();
  }

  /** The best round this visit for this game, type and speed. */
  private async refreshBest(): Promise<void> {
    const { challengeId: mathId, speed } = Settings.round;
    if (mathId === null || speed === null) return;
    const best = await getScoreStore().bestForCombo({ gameId: this.gameId, mathId, speed });
    if (!this.scene.isActive()) return;
    this.frame.best.setText(mathBestLine(best?.score ?? null));
  }

  private start(): void {
    if (!Settings.isReady()) return;
    getRememberedPicks().setLastGame(this.gameId);
    // Through Loading (sprint 2.1.8), so the game's own pictures load with a bar.
    this.scene.start(SceneKeys.Loading, { targetSceneKey: gameSceneKeyFor(this.gameId), gameId: this.gameId });
  }
}
