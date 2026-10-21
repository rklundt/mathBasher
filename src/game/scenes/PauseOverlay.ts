// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { config } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { Settings } from '@/services/Settings';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { computeGridSlots } from '@/game/ui/menuLayoutGeometry';
import { buildChallengeGrid } from '@/game/ui/ChallengeGrid';
import { text } from '@/game/ui/typography';
import { selectChallenge } from '@/game/services/challengeSelection';
import type { SettingsSceneInit } from '@/game/scenes/SettingsScene';
import type { QuitDestination } from '@/game/scenes/gameSceneContract';

/**
 * Translucent overlay that floats above GameScene + HudScene while a round
 * is paused: the pause card.
 *
 * Two views (sprint 2.9):
 *  - **Pause buttons:** Resume, then a 2 × 2 grid: Settings, Change
 *    challenge, Change game, Quit to menu.
 *  - **Challenge buttons** (after Change challenge): "Pick your challenge!"
 *    and the same buttons as the challenge picker, inside this card. Back
 *    (or Esc, or the same challenge) returns to the pause buttons with the
 *    round intact; a different challenge ends the round (not scored, the
 *    same path as Change game) and goes to this game's Difficulty.
 *
 * Lifecycle:
 *  - LAUNCHED (parallel) by GameScene.pause(); STOPPED by GameScene.resume()
 *    or by a quit. Never started in place of GameScene — that would tear
 *    down round state.
 *  - Esc on the pause buttons resumes; on the challenge buttons it goes back
 *    to the pause buttons.
 *
 * Render order note: PauseOverlay is registered after GameScene/HudScene in
 * `src/app/boot.ts`, so it draws over them. The §7(b) attribution footer is a
 * DOM strip below the canvas (sprint 2.5.2), so it stays visible while paused
 * regardless of scene order.
 */
export interface PauseOverlayInit {
  /** Called when the user picks Resume (or presses Esc on the pause buttons). */
  resumeFn: () => void;
  /** Called on Change game (`game-select`), Quit to menu (`menu`) or a new challenge (`difficulty`). */
  quitFn: (destination: QuitDestination) => void;
}

export class PauseOverlay extends Phaser.Scene {
  static readonly key = SceneKeys.PauseOverlay;

  private resumeFn?: () => void;
  private quitFn?: (destination: QuitDestination) => void;
  /** Everything in the card's current view (destroyed when the view changes). */
  private view: Phaser.GameObjects.GameObject[] = [];
  private nav?: KeyboardNavigator;
  private showingChallenges = false;

  constructor() {
    super(PauseOverlay.key);
  }

  init(data: Partial<PauseOverlayInit>): void {
    this.resumeFn = data.resumeFn;
    this.quitFn = data.quitFn;
  }

  create(): void {
    _th.logToAi('PauseOverlay Started', SeverityLevel.Information, { from: 'gameplay' });
    this.view = [];
    this.nav = undefined;
    this.showingChallenges = false;

    const { width, height } = this.scale;

    // Translucent backdrop covers the whole canvas. Slightly darker than the
    // HUD's 45% alpha so the paused state reads as visibly different from the
    // active HUD bar above it.
    const backdrop = this.add.rectangle(0, 0, width, height, 0x000000, 0.6);
    backdrop.setOrigin(0, 0);

    this.showPauseButtons();

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ESC', this.handleEsc, this);
    }

    this.events.once('shutdown', () => {
      if (this.input.keyboard) {
        this.input.keyboard.off('keydown-ESC', this.handleEsc, this);
      }
      _th.logToAi('PauseOverlay Completed', SeverityLevel.Information);
    });
  }

  private clearView(): void {
    this.nav?.destroy();
    this.nav = undefined;
    for (const obj of this.view) obj.destroy();
    this.view = [];
  }

  /** Resume, then Settings · Change challenge / Change game · Quit to menu. */
  private showPauseButtons(): void {
    this.clearView();
    this.showingChallenges = false;
    const cx = this.scale.width / 2;
    const P = config.layout.challengeFlow.pause;

    // TextKind 'headline' — 67px primary.
    this.view.push(text(this, cx, P.titleY, 'Paused', 'headline').setOrigin(0.5));
    const resume = new PlaceholderButton({
      scene: this,
      x: cx,
      y: P.resume.y,
      width: P.resume.w,
      height: P.resume.h,
      label: 'Resume',
      onClick: () => this.handleResume(),
    });
    const items: Array<{ label: string; onClick: () => void }> = [
      { label: 'Settings', onClick: () => this.handleSettings() },
      { label: 'Change Challenge', onClick: () => this.showChallengeButtons() },
      // "Change game" goes straight to Game Select (challenge and difficulty carry over).
      { label: 'Change Game', onClick: () => this.handleQuit('game-select') },
      { label: 'Quit to Menu', onClick: () => this.handleQuit('menu') },
    ];
    const slots = computeGridSlots(cx, P.grid.topY, items.length, P.grid);
    const grid = items.map(
      (item, i) =>
        new PlaceholderButton({
          scene: this,
          x: slots[i].x,
          y: slots[i].y,
          width: slots[i].width,
          height: slots[i].height,
          label: item.label,
          onClick: item.onClick,
        }),
    );
    this.view.push(resume, ...grid);
    this.nav = new KeyboardNavigator(this, [resume, ...grid]);
  }

  /** "Pick your challenge!" inside the card; Back returns to the pause buttons. */
  private showChallengeButtons(): void {
    if (this.scene.isActive(SceneKeys.Settings)) return;
    this.clearView();
    this.showingChallenges = true;
    _th.logToAi('PauseOverlay.ChallengesOpened', SeverityLevel.Information);
    const cx = this.scale.width / 2;
    const P = config.layout.challengeFlow.pause;
    const L = config.layout.challengeFlow;

    this.view.push(text(this, cx, P.challengeHeadingY, 'Pick your challenge!', 'h2').setOrigin(0.5));
    const current = Settings.round.mathId;
    const grid = buildChallengeGrid(this, {
      centerX: cx,
      firstRowY: P.challengeGridTopY,
      onPick: (id) => {
        if (id === current) {
          this.showPauseButtons();
          return;
        }
        // A new challenge ends this round (not scored) → this game's Difficulty.
        selectChallenge(id, 'pause');
        this.handleQuit('difficulty');
      },
    });
    const back = new PlaceholderButton({
      scene: this,
      x: cx,
      y: P.challengeBackY,
      width: L.backButton.w,
      height: L.backButton.h,
      label: 'Back',
      onClick: () => this.showPauseButtons(),
    });
    this.view.push(...grid.buttons, back);
    this.nav = new KeyboardNavigator(this, [...grid.buttons, back], {
      ...(grid.currentIndex >= 0 && { initialIndex: grid.currentIndex }),
    });
  }

  /** Esc: back to the pause buttons from the challenges; otherwise resume. */
  private handleEsc(): void {
    if (this.showingChallenges) {
      this.showPauseButtons();
      return;
    }
    this.handleResume();
  }

  private handleResume(): void {
    // Guard: when SettingsScene is launched on top of this overlay (via the
    // Settings button), Phaser still routes input to BOTH scenes. Pressing
    // Esc to dismiss SettingsScene would otherwise also fire this handler
    // and accidentally resume the game underneath. Skip when Settings is
    // active; SettingsScene's own Esc handler closes the settings panel
    // and a subsequent Esc on this overlay (with Settings now gone) resumes
    // as expected. Mirrors the double-launch guard pattern in
    // `handleSettings` below.
    if (this.scene.isActive(SceneKeys.Settings)) return;
    this.resumeFn?.();
  }

  private handleQuit(destination: QuitDestination): void {
    this.quitFn?.(destination);
  }

  /**
   * Open the SettingsScene STACKED on top of this overlay. Pause stays
   * active underneath so the kid sees Settings layered over Pause; on
   * Back, Settings stops and Pause is the foreground again. Game stays
   * paused throughout — neither this scene nor SettingsScene resumes
   * the game, only the explicit Resume button does.
   */
  private handleSettings(): void {
    if (this.scene.isActive(SceneKeys.Settings)) return; // guard double-open
    _th.logToAi('PauseOverlay.SettingsOpened', SeverityLevel.Information);
    const init: SettingsSceneInit = {
      onBack: () => this.scene.stop(SceneKeys.Settings),
    };
    this.scene.launch(SceneKeys.Settings, init);
  }
}
