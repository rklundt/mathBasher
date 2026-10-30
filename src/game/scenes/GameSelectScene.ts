// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { Settings } from '@/services/Settings';
import { isMathGameId, type MathGameId } from '@/core/gameIds';
import { GAME_GROUPS, gameGroupById, gameGroupOf, type GameGroupId } from '@/core/gameGroups';
import { GAME_ICON_SHEET } from '@/core/spriteKeys';
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
 * Each game's tile: its name and one line about it. Alien Shoot (the
 * original lane-drop gameplay), Asteroid Field (sprint 2.1 free-aim), Space
 * Escape! (sprint 2.2 climb), Math-a-lotl (sprint 2.5.4 underwater bubbles),
 * Frog Splash (sprint 2.5.6 river hop), Space Shooter (sprint 2.6 cockpit
 * window), Penguin Slide (sprint 2.7 snowy hill), Bunny Garden (sprint 2.8
 * carrot patch) and Balance Scale (sprint 2.12 missing numbers on a scale).
 */
const TILES: Readonly<Record<MathGameId, { label: string; subtitle: string }>> = {
  'alien-shoot': { label: 'Alien Shoot', subtitle: 'Aliens carry answers. Shoot the right one.' },
  'asteroid-field': { label: 'Asteroid Field', subtitle: 'Aim at floating asteroids. Beat the timer.' },
  'number-climb': { label: 'Space Escape!', subtitle: 'Climb to escape the burning station.' },
  'math-a-lotl': { label: 'Math-a-lotl', subtitle: 'Help the axolotl catch the right bubble.' },
  'frog-splash': { label: 'Frog Splash', subtitle: 'Hop across the river on the right lily pads.' },
  'space-shooter': { label: 'Space Shooter', subtitle: 'From your cockpit, blast the right alien ship.' },
  'penguin-slide': { label: 'Penguin Slide', subtitle: 'Slide down and catch the right fish.' },
  'bunny-garden': { label: 'Bunny Garden', subtitle: 'Tap the carrot with the right answer.' },
  'balance-scale': { label: 'Balance Scale', subtitle: 'Find the missing number that balances the scale.' },
};

/**
 * Game-mode selection: "Pick a game!", the challenge chip (sprint 2.9: the
 * challenge is picked first and stays put while you hop between games), and
 * the games.
 *
 * Sprint 2.13.1 — the games sit in two tabs (`core/gameGroups.ts`): **Math
 * Basher** (the space and arcade games) and **Math Fun** (the cute ones).
 * Tapping a tab swaps the tiles below in place, like the challenge picker's
 * subject tabs. Each tile shows the game's picture (`GAME_ICON_SHEET`). The
 * scene opens on the tab picked last this visit, else on the current game's.
 */
export class GameSelectScene extends Phaser.Scene {
  static readonly key = SceneKeys.GameSelect;

  /** The tab picked last; kept on the scene, so it lasts until the page reloads. */
  private groupId: GameGroupId | null = null;
  private chip!: PlaceholderButton;
  private tabs: PlaceholderButton[] = [];
  private backButton!: PlaceholderButton;
  /** The game tiles (rebuilt on a tab swap). */
  private tiles: PlaceholderButton[] = [];
  private nav?: KeyboardNavigator;

  constructor() {
    super(GameSelectScene.key);
  }

  create(): void {
    setupScene(this);
    // Sprint 2.13 — back from a puzzle: the math games' default backdrop, not the puzzle's.
    const current = Settings.round.gameId;
    if (!isMathGameId(current)) Settings.setGameId('alien-shoot');
    const currentGame: MathGameId = isMathGameId(current) ? current : 'alien-shoot';
    this.groupId ??= gameGroupOf(currentGame).id;
    this.tiles = [];
    this.nav = undefined;

    const { width } = this.scale;
    const cx = width / 2;

    const L = config.layout.challengeFlow.gameSelect;
    text(this, cx, L.headingY, 'Pick a game!', 'h2').setOrigin(0.5);
    // Sprint 2.9 — the challenge chip: tap to swap the challenge, then back here.
    this.chip = createChallengeChip(this, cx, L.chipY, () => {
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

    // One tab per game group; the open one is ringed.
    this.tabs = GAME_GROUPS.map(
      (g, i) =>
        new PlaceholderButton({
          scene: this,
          x: cx + (i - (GAME_GROUPS.length - 1) / 2) * (L.tab.w + L.tab.gapX),
          y: L.tabY,
          width: L.tab.w,
          height: L.tab.h,
          label: g.label,
          selected: g.id === this.groupId,
          onClick: () => this.showGroup(g.id),
        }),
    );

    const goBack = (): void => {
      this.scene.start(SceneKeys.Menu);
    };
    this.backButton = new PlaceholderButton({
      scene: this,
      x: cx,
      y: L.backY,
      width: config.layout.challengeFlow.backButton.w,
      height: config.layout.challengeFlow.backButton.h,
      label: 'Back',
      onClick: goBack,
    });

    this.buildTiles(false, currentGame);

    // Esc returns to the previous step in the menu stack.
    wireEscBack(this, goBack);
  }

  /** Swap the tab: the tiles below change in place (with a quick fade-in, so the change is noticed). */
  private showGroup(id: GameGroupId): void {
    if (id === this.groupId) return;
    this.groupId = id;
    this.tabs.forEach((tab, i) => tab.setSelected(GAME_GROUPS[i].id === id));
    this.buildTiles(true, null);
  }

  /** This tab's tiles in two rows, then the Tab order: chip, tabs, tiles, Back. */
  private buildTiles(fade: boolean, focusGame: MathGameId | null): void {
    this.nav?.destroy();
    for (const tile of this.tiles) tile.destroy();

    const L = config.layout.challengeFlow.gameSelect;
    const group = gameGroupById(this.groupId ?? GAME_GROUPS[0].id);
    const perRow = Math.ceil(group.games.length / L.grid.rows);
    const slots = computeGridSlots(this.scale.width / 2, L.grid.firstRowY, group.games.length, {
      ...L.grid,
      perRow,
    });
    this.tiles = group.games.map((gameId, i) => {
      const s = slots[i];
      return new PlaceholderButton({
        scene: this,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        label: TILES[gameId].label,
        subtitle: TILES[gameId].subtitle,
        icon: {
          key: GAME_ICON_SHEET.key,
          frame: GAME_ICON_SHEET.frames[gameId],
          sizePx: L.icon.sizePx,
          padPx: L.icon.padPx,
        },
        onClick: () => {
          Settings.setGameId(gameId);
          this.scene.start(SceneKeys.Difficulty);
        },
      });
    });

    // The chip and tabs come first in Tab order, but focus lands on a game:
    // the current one when it's in this tab, else the first.
    const order = [this.chip, ...this.tabs, ...this.tiles, this.backButton];
    const focusAt = focusGame === null ? -1 : group.games.indexOf(focusGame);
    const initialIndex = 1 + this.tabs.length + Math.max(0, focusAt);
    this.nav = new KeyboardNavigator(this, order, { initialIndex });

    if (fade) {
      for (const tile of this.tiles) {
        tile.setAlpha(0);
        this.tweens.add({ targets: tile, alpha: 1, duration: L.swapFadeMs, ease: 'Sine.Out' });
      }
    }
  }
}
