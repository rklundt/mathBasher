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
import { openSettings } from '@/game/ui/topBar';
import { addScreenTag } from '@/game/ui/screenTag';
import { text } from '@/game/ui/typography';
import { BORDER_GREY, SLATE_BG } from '@/game/ui/uiPalette';
import type { QuitDestination } from '@/game/scenes/gameSceneContract';

/**
 * Translucent overlay that floats above the game while a round is paused:
 * the pause card.
 *
 * Sprint 2.15 — one card for every game: **Resume**, then **Change Game**
 * (the games list the game is on), the game's own Change button ("Change
 * Math or Speed", "Change Difficulty", "Change Cards or Difficulty": its
 * setup screen) and **Settings**. No main menu and no challenge buttons any
 * more; the math type is picked on the setup screen. Leaving ends the round
 * (the points so far count, as a round ended early).
 *
 * Lifecycle:
 *  - LAUNCHED (parallel) by the game's pause; STOPPED by its resume or by a
 *    quit. Never started in place of the game — that would tear down round
 *    state.
 *  - Esc resumes (not while Settings is open over the card).
 *
 * Render order note: PauseOverlay is registered after the game scenes and
 * HudScene in `src/app/boot.ts`, so it draws over them.
 */
export interface PauseOverlayInit {
  /** Called when the user picks Resume (or presses Esc). */
  resumeFn: () => void;
  /** Called on Change Game (`'games'`) or the game's Change button (`'setup'`). */
  quitFn: (destination: QuitDestination) => void;
  /** The game's Change button: "Change Math or Speed", "Change Difficulty" or "Change Cards or Difficulty". */
  changeLabel: string;
}

export class PauseOverlay extends Phaser.Scene {
  static readonly key = SceneKeys.PauseOverlay;

  private resumeFn?: () => void;
  private quitFn?: (destination: QuitDestination) => void;
  private changeLabel = 'Change Difficulty';

  constructor() {
    super(PauseOverlay.key);
  }

  init(data: Partial<PauseOverlayInit>): void {
    this.resumeFn = data.resumeFn;
    this.quitFn = data.quitFn;
    this.changeLabel = data.changeLabel ?? 'Change Difficulty';
  }

  create(): void {
    _th.logToAi('PauseOverlay Started', SeverityLevel.Information, { from: 'gameplay' });
    const { width, height } = this.scale;
    const cx = width / 2;
    const P = config.layout.chooser.pause;

    // A dark wash over the game, then the card.
    this.add.rectangle(0, 0, width, height, 0x000000, P.washAlpha).setOrigin(0, 0);
    const card = this.add.graphics();
    const shadow = config.layout.corners.panelShadow;
    card
      .fillStyle(shadow.color, 1)
      .fillRoundedRect(cx - P.card.w / 2, P.card.y + shadow.px, P.card.w, P.card.h, P.card.radius);
    card.fillStyle(SLATE_BG, 1).fillRoundedRect(cx - P.card.w / 2, P.card.y, P.card.w, P.card.h, P.card.radius);
    card.lineStyle(4, BORDER_GREY, 1).strokeRoundedRect(cx - P.card.w / 2, P.card.y, P.card.w, P.card.h, P.card.radius);
    text(this, cx, P.titleY, 'Paused', 'headline').setOrigin(0.5);

    const resume = new PlaceholderButton({
      scene: this,
      x: cx,
      y: P.resumeY,
      width: P.buttonW,
      height: P.resumeH,
      label: '▶  Resume',
      labelKind: 'h3',
      variant: 'primary',
      onClick: () => this.handleResume(),
    });
    const items: Array<{ label: string; onClick: () => void }> = [
      { label: 'Change Game', onClick: () => this.quitFn?.('games') },
      { label: this.changeLabel, onClick: () => this.quitFn?.('setup') },
      { label: 'Settings', onClick: () => this.handleSettings() },
    ];
    const buttons = items.map(
      (item, i) =>
        new PlaceholderButton({
          scene: this,
          x: cx,
          y: P.firstButtonY + i * (P.buttonH + P.gapPx),
          width: P.buttonW,
          height: P.buttonH,
          label: item.label,
          labelKind: 'setupHeading',
          onClick: item.onClick,
        }),
    );
    new KeyboardNavigator(this, [resume, ...buttons]);
    addScreenTag(this, `PauseOverlay · over ${Settings.round.gameId}`);

    this.input.keyboard?.on('keydown-ESC', this.handleResume, this);
    this.events.once('shutdown', () => {
      this.input.keyboard?.off('keydown-ESC', this.handleResume, this);
      _th.logToAi('PauseOverlay Completed', SeverityLevel.Information);
    });
  }

  private handleResume(): void {
    // Guard: when SettingsScene is open on top of this card, Phaser still
    // routes keys to BOTH scenes. Esc closes Settings; it must not also
    // resume the game underneath.
    if (this.scene.isActive(SceneKeys.Settings)) return;
    this.resumeFn?.();
  }

  /**
   * Settings STACKED on top of this card: on Back, Settings stops and the
   * card is in front again. The game stays paused throughout — only Resume
   * resumes it.
   */
  private handleSettings(): void {
    _th.logToAi('PauseOverlay.SettingsOpened', SeverityLevel.Information);
    openSettings(this);
  }
}
