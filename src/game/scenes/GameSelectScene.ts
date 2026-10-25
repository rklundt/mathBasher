// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { Settings, type GameId } from '@/services/Settings';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { computeGridSlots } from '@/game/ui/menuLayoutGeometry';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { text } from '@/game/ui/typography';
import { setupScene } from '@/game/scenes/sceneSetup';
import { createMuteIconButton } from '@/game/ui/MuteIconButton';
import { createChallengeChip } from '@/game/ui/ChallengeChip';
import type { ChallengePickerInit } from '@/game/services/challengeSelection';

/**
 * Game-mode selection: "Pick a game!", the challenge chip (sprint 2.9:
 * the challenge is picked first and stays put while you hop between games),
 * and nine tiles in a 3 × 3 grid (sprint 2.12).
 */
export class GameSelectScene extends Phaser.Scene {
  static readonly key = SceneKeys.GameSelect;

  constructor() {
    super(GameSelectScene.key);
  }

  create(): void {
    setupScene(this);

    const { width, height } = this.scale;
    const cx = width / 2;

    const L = config.layout.challengeFlow.gameSelect;
    text(this, cx, L.headingY, 'Pick a game!', 'h2').setOrigin(0.5);
    // Sprint 2.9 — the challenge chip: tap to swap the challenge, then back here.
    const chip = createChallengeChip(this, cx, L.chipY, () => {
      const init: ChallengePickerInit = {
        next: SceneKeys.GameSelect,
        back: SceneKeys.GameSelect,
        source: 'gameSelect',
      };
      this.scene.start(SceneKeys.ChallengePicker, init);
    });

    // Top-right mute icon — matches MenuScene + HudScene placement so
    // the affordance is in the same spot every screen.
    createMuteIconButton(this, width - 16 - 22, 16 + 18);

    // Sprint 2.12 — nine games in a 3 × 3 grid (sprint 2.8 had two rows of
    // four). Tiles 360 × 104: wide enough that the subtitles fit in two lines,
    // tall enough to tap on a phone.
    const slots = computeGridSlots(cx, L.grid.firstRowY, 9, L.grid);
    let slotIndex = 0;
    const tile = (label: string, subtitle: string, gameId: GameId): PlaceholderButton => {
      const s = slots[slotIndex++];
      return new PlaceholderButton({
        scene: this,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        label,
        subtitle,
        onClick: () => {
          Settings.setGameId(gameId);
          this.scene.start(SceneKeys.Difficulty);
        },
      });
    };

    // Alien Shoot (the original lane-drop gameplay), Asteroid Field
    // (sprint 2.1 free-aim), Space Escape! (sprint 2.2 climb), Math-a-lotl
    // (sprint 2.5.4 underwater bubbles), Frog Splash (sprint 2.5.6 river
    // hop), Space Shooter (sprint 2.6 cockpit window), Penguin Slide
    // (sprint 2.7 snowy hill), Bunny Garden (sprint 2.8 carrot patch) and
    // Balance Scale (sprint 2.12 missing numbers on a scale).
    const alienShoot = tile('Alien Shoot', 'Aliens carry answers. Shoot the right one.', 'alien-shoot');
    const asteroidField = tile('Asteroid Field', 'Aim at floating asteroids. Beat the timer.', 'asteroid-field');
    const numberClimb = tile('Space Escape!', 'Climb to escape the burning station.', 'number-climb');
    const mathALotl = tile('Math-a-lotl', 'Help the axolotl catch the right bubble.', 'math-a-lotl');
    const frogSplash = tile('Frog Splash', 'Hop across the river on the right lily pads.', 'frog-splash');
    const spaceShooter = tile('Space Shooter', 'From your cockpit, blast the right alien ship.', 'space-shooter');
    const penguinSlide = tile('Penguin Slide', 'Slide down and catch the right fish.', 'penguin-slide');
    const bunnyGarden = tile('Bunny Garden', 'Tap the carrot with the right answer.', 'bunny-garden');
    const balanceScale = tile('Balance Scale', 'Find the missing number that balances the scale.', 'balance-scale');

    const back = new PlaceholderButton({
      scene: this,
      x: cx,
      y: height * 0.85,
      width: 200,
      height: 56,
      label: 'Back',
      onClick: () => this.scene.start(SceneKeys.Menu),
    });

    // The chip is first in Tab order, but focus lands on the first game.
    new KeyboardNavigator(
      this,
      [
        chip,
        alienShoot,
        asteroidField,
        numberClimb,
        mathALotl,
        frogSplash,
        spaceShooter,
        penguinSlide,
        bunnyGarden,
        balanceScale,
        back,
      ],
      { initialIndex: 1 },
    );

    // Esc returns to the previous step in the menu stack.
    wireEscBack(this, () => this.scene.start(SceneKeys.Menu));
  }
}
