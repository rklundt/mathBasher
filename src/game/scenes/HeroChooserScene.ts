// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { Settings, type ChosenHero } from '@/services/Settings';
import { HeroChooserKeys } from '@/core/spriteKeys';
import { text } from '@/game/ui/typography';
import { setupScene } from '@/game/scenes/sceneSetup';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { emitButtonClicked } from '@/game/ui/buttonTelemetry';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';

/**
 * Sprint 2.5 story 4 — Hero Chooser scene.
 *
 * Full-screen 4-option picker the kid hits ONCE on first visit
 * (BootScene routes here when `Settings.getChosenHero() === null`,
 * otherwise straight to MenuScene). After first pick, persisted via
 * `Settings.setChosenHero(...)`; subsequent visits skip this scene
 * but it's reachable mid-session by tapping the chosen-hero avatar
 * in MenuScene's corner.
 *
 * Init data:
 *  - `fromMenu: true` → mid-session re-open. Esc / back goes to Menu.
 *    The Skip button is hidden (the kid already has a choice; this is
 *    a deliberate swap, not a forced first-run pick).
 *  - omitted / `fromMenu: false` → first-run, hard gate. Esc does
 *    nothing (no Skip; we want them to make the choice).
 *
 * Layout: 4 heroes in a 2×2 grid, each card is a tap target showing
 * the hero sprite + a "Pick" affordance. Title above; subtitle
 * explaining the picker is cosmetic-only ("This is just your look").
 *
 * Telemetry: `HeroChooser.entered` on mount; `HeroChooser.picked`
 * with the chosen key on pick.
 */

export interface HeroChooserSceneInit {
  /**
   * True when launched from MenuScene's avatar-tap (mid-session
   * swap). False / omitted means first-run hard gate.
   */
  fromMenu?: boolean;
}

/** Card visual dimensions (px). Tuned to fit 2x2 inside the 1280x720 design canvas. */
const CARD_W = 280;
const CARD_H = 240;
const CARD_GAP = 32;
/** Sprite display size inside a card (px, max dim — preserves aspect). */
const CARD_SPRITE_DISPLAY_SIZE = 180;

export class HeroChooserScene extends Phaser.Scene {
  static readonly key = SceneKeys.HeroChooser;

  private fromMenu = false;

  constructor() {
    super(HeroChooserScene.key);
  }

  // Sprint 2.5 audit (Senior Dev) — default the param so the
  // "first-run no-data path" reads as such at the type level. Phaser
  // passes `{}` when scene.start is called without data; explicit
  // default makes the contract self-documenting.
  init(data: HeroChooserSceneInit = {}): void {
    this.fromMenu = data.fromMenu === true;
  }

  create(): void {
    setupScene(this);
    _th.logToAi('HeroChooser.entered', SeverityLevel.Information, {
      reason: this.fromMenu ? 'menu-reopen' : 'first-run',
    });

    const { width, height } = this.scale;
    const cx = width / 2;

    // Title + subtitle. Sprint 2.5 audit (Support) — subtitle copy
    // softened from "no effect on the game" (which reads as "this
    // doesn't matter" to kids) to "pick the one that feels like
    // you" — still honestly cosmetic but frames the pick as personal
    // ownership rather than inert.
    text(this, cx, height * 0.10, 'Pick Your Hero', 'h2').setOrigin(0.5);
    text(this, cx, height * 0.17, 'Just for looks — pick the one that feels like you.', 'body')
      .setOrigin(0.5);

    // 2×2 grid centered horizontally + vertically.
    // Centers at (cx - half, cy - half) → (cx + half, cy + half).
    const gridCenterY = height * 0.52;
    const halfX = (CARD_W + CARD_GAP) / 2;
    const halfY = (CARD_H + CARD_GAP) / 2;
    const positions: ReadonlyArray<{ key: ChosenHero; x: number; y: number }> = [
      { key: HeroChooserKeys.Hero1, x: cx - halfX, y: gridCenterY - halfY },
      { key: HeroChooserKeys.Hero2, x: cx + halfX, y: gridCenterY - halfY },
      { key: HeroChooserKeys.Hero3, x: cx - halfX, y: gridCenterY + halfY },
      { key: HeroChooserKeys.Hero4, x: cx + halfX, y: gridCenterY + halfY },
    ];

    const currentChoice = Settings.getChosenHero();
    for (const pos of positions) {
      this.buildHeroCard(pos.x, pos.y, pos.key, currentChoice === pos.key);
    }

    // Esc → Menu only if this is a mid-session re-open. First-run
    // has no escape hatch (deliberate hard gate so the kid commits
    // to a pick).
    //
    // Sprint 2.5 audit (Support) — Esc is keyboard-only; mobile kids
    // had no way out of the mid-session picker without re-picking.
    // Visible "Back" button (bottom-center) gives them a clear way
    // home. Only rendered on the `fromMenu` path so the first-run
    // hard gate stays a hard gate.
    if (this.fromMenu) {
      wireEscBack(this, () => this.scene.start(SceneKeys.Menu));
      new PlaceholderButton({
        scene: this,
        x: cx,
        y: height * 0.92,
        width: 200,
        height: 56,
        label: 'Back',
        onClick: () => {
          emitButtonClicked('HeroChooser:Back', this.scene.key, 'pointer');
          this.scene.start(SceneKeys.Menu);
        },
      });
    }

    this.events.once('shutdown', () => {
      _th.logToAi('HeroChooser.exited', SeverityLevel.Information);
    });
  }

  /**
   * Build one hero card — backdrop + sprite + tap area. Selected card
   * gets a brighter border so a returning kid can see which one they
   * picked last time.
   */
  private buildHeroCard(x: number, y: number, heroKey: ChosenHero, isSelected: boolean): void {
    // Card backdrop — dark slate, rounded, with an accent border on
    // the currently-selected hero (carries the amber accent from the
    // rest of the UI; matches PlaceholderButton's selected chrome).
    const bg = this.add.rectangle(x, y, CARD_W, CARD_H, 0x1f2740, 0.85);
    bg.setStrokeStyle(
      isSelected ? 4 : 2,
      isSelected ? 0xfbbf24 : 0x475569,
      1,
    );

    // Hero sprite — centered in the upper portion of the card so the
    // label sits below without overlapping. Defensive textures.exists
    // guard in case a future asset-load refactor leaves the texture
    // unloaded; renders an empty card rather than crashing.
    if (this.textures.exists(heroKey)) {
      const sprite = this.add.image(x, y - 18, heroKey).setOrigin(0.5);
      const tex = this.textures.get(heroKey).getSourceImage();
      const maxDim = Math.max(tex.width, tex.height) || 1;
      sprite.setScale(CARD_SPRITE_DISPLAY_SIZE / maxDim);
    }

    // "Pick me!" label (or "Selected" if this IS the current choice).
    text(this, x, y + CARD_H / 2 - 28, isSelected ? '★ Your hero ★' : 'Pick me!', 'rowLabel')
      .setOrigin(0.5)
      .setColor(isSelected ? '#fbbf24' : '#eaeaf2');

    // Make the whole card a tap target.
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.handlePick(heroKey);
    });
    bg.on('pointerover', () => bg.setStrokeStyle(4, 0xfbbf24, 1));
    bg.on('pointerout', () =>
      bg.setStrokeStyle(isSelected ? 4 : 2, isSelected ? 0xfbbf24 : 0x475569, 1),
    );
  }

  /**
   * Lock the kid's choice + transition. Telemetry-tagged so we can
   * see which hero is picked at what rate — useful representation-
   * engagement signal.
   */
  private handlePick(heroKey: ChosenHero): void {
    emitButtonClicked(`HeroChooser:${heroKey}`, this.scene.key, 'pointer');
    Settings.setChosenHero(heroKey);
    _th.logToAi('HeroChooser.picked', SeverityLevel.Information, {
      reason: heroKey,
    });
    this.scene.start(SceneKeys.Menu);
  }
}
