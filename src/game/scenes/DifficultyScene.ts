// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { config, type MathId, type SpeedKey } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { Settings } from '@/services/Settings';
import { generators, getImplementedIds } from '@/math/registry';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { text } from '@/game/ui/typography';
import { setupScene } from '@/game/scenes/sceneSetup';

/**
 * Difficulty selection. Two sections:
 * - **Math Type**: one button per `config.scoring.mathDifficulty` key.
 *   Implemented generators are enabled; stubbed ones (`isStub: true` in the
 *   registry) are visually disabled and ignore pointer events. The disabled
 *   tile renders the stub's `description` ("Coming soon.") as its subtitle so
 *   a kid sees a friendly explanation, not a stub-throw error.
 * - **Speed**: three buttons (Slow / Medium / Fast).
 *
 * The Start button is disabled until BOTH a math type and a speed are
 * selected, then transitions to GameScene with the choices recorded in
 * `Settings`.
 *
 * **Tile-gating rule (sprint 0.3 wrap follow-up):** math tiles MUST gate on
 * `getImplementedIds()`. A kid clicking a stubbed tile must NEVER trigger the
 * stub generator's `throw new Error(...)`. The PlaceholderButton's disabled
 * state already enforces the no-pointer-events contract; this scene's job is
 * to set `disabled: true` on every stub.
 */
export class DifficultyScene extends Phaser.Scene {
  static readonly key = SceneKeys.Difficulty;

  private mathButtons: Map<MathId, PlaceholderButton> = new Map();
  private speedButtons: Map<SpeedKey, PlaceholderButton> = new Map();
  private startButton?: PlaceholderButton;

  constructor() {
    super(DifficultyScene.key);
  }

  create(): void {
    setupScene(this);

    const { width, height } = this.scale;
    const cx = width / 2;

    text(this, cx, height * 0.1, 'Pick Difficulty', 'h3').setOrigin(0.5);

    // Defensive fallback: if for some reason the math registry has no
    // implemented generators (every entry is a stub), don't render an empty
    // grid with a permanently-disabled Start button — show a friendly message
    // and a Back button. Today this can't happen (addTo10 is implemented),
    // but if a refactor ever leaves the registry stub-only, this prevents the
    // UI from silently bricking.
    if (getImplementedIds().length === 0) {
      this.renderEmptyState(cx, height);
      // Empty-state Completed log uses the explicit form (with the
      // `fallback` prop) to surface the rare condition in telemetry. The
      // standard shutdown-time Completed log from setupScene() will still
      // also fire when the scene later transitions away.
      _th.logToAi('DifficultyScene Completed', SeverityLevel.Information, {
        fallback: 'no-implemented-generators',
      });
      return;
    }

    // Vertical anchors. Sprint 1.1 Story 8 — with 6 implemented math
    // types (after Phase 1 generators landed), the math grid wraps to
    // 2 rows of 4-per-row at 220px tile width. Each math row spans
    // (tile-height + row-gap) = 116 + 16 = 132 design pixels (tile
    // height bumped 100 → 116 in sprint 1.1 wrap-up to fit the larger
    // mobile subtitle). The grid origin (FIRST row's center Y) stays
    // at 0.34 from sprint 0.7.5; subsequent rows stack downward.
    // Speed row drops 0.66 → 0.78 to clear the second math row;
    // Start/Back drop 0.85 → 0.92 to keep proportional spacing. With
    // AGPL footer at 0.955 (32px out of 720), Start/Back at 0.92 =
    // y=662, button height 56 → bottom at y=690; footer top at y=688.
    // 2px of overlap with the footer's translucent bg, but the footer
    // text + click zone are clear (footer text at center y=704,
    // fontSize 14 → top y≈697, well below button bottom). Verified safe.
    //
    // Math row 2 bottom after the 1.1 wrap-up tile-height bump:
    // 245 + 132 + 58 = 435; gap to Speed at y=562 = 127px. Plenty.
    //
    // When Phase 1.5 (division) + 1.6 (mixed) land → 8 tiles, 2 full
    // rows of 4 fits the same anchor positions, no further reflow.
    this.renderMathTypes(cx, height * 0.34);
    this.renderSpeeds(cx, height * 0.78);
    this.renderStartButton(cx, height * 0.92);
    this.renderBackButton(cx - 250, height * 0.92);

    // Default selections so the user lands on a "ready to play" state.
    // Without this, a first-time user sees the keyboard-focus blue ring on
    // "Add to 10" (because it's the first tab stop) AND the amber selected
    // ring on a previously-chosen speed, but Settings.mathId is still null
    // and Start stays disabled. The visual contradicts the actual state and
    // the user can't tell why Start won't light up. Auto-selecting the
    // first implemented math type and a default speed (Medium) closes that
    // gap — the kid can tap Start immediately or change their mind first.
    this.applyDefaultSelections();

    // Keyboard nav: math tiles in registry order, then speed tiles slow→fast,
    // then Start, then Back. Disabled stubs are skipped automatically by
    // KeyboardNavigator.
    const tabOrder: PlaceholderButton[] = [
      ...this.mathButtons.values(),
      ...this.speedButtons.values(),
    ];
    if (this.startButton) tabOrder.push(this.startButton);
    if (this.backButton) tabOrder.push(this.backButton);
    new KeyboardNavigator(this, tabOrder);

    // Esc returns to the previous step in the menu stack.
    wireEscBack(this, () => this.scene.start(SceneKeys.GameSelect));

    this.refreshSelection();
  }

  private backButton?: PlaceholderButton;

  private renderEmptyState(cx: number, height: number): void {
    const msg = text(
      this,
      cx,
      height * 0.45,
      'No math types available yet — check back soon!',
      'accent',
    );
    msg.setOrigin(0.5);
    msg.setStyle({ align: 'center' });

    const back = new PlaceholderButton({
      scene: this,
      x: cx,
      y: height * 0.7,
      width: 200,
      height: 56,
      label: 'Back',
      onClick: () => this.scene.start(SceneKeys.GameSelect),
    });
    new KeyboardNavigator(this, [back]);
  }

  private renderMathTypes(cx: number, firstRowY: number): void {
    // Section label sits 90px above the FIRST row's center. Math tiles
    // are 100px tall (so tile-top = y - 50); the 32px bold sectionLabel
    // kind occupies ~42px vertical (centered on its y-coord = ±21).
    // 90 - 50 - 21 = 19px of visible gap between label-bottom and
    // first-row tile-top — reads as "label THEN row" cleanly.
    text(this, cx, firstRowY - 90, 'Math Type', 'sectionLabel').setOrigin(0.5);

    const ids = Object.keys(config.scoring.mathDifficulty) as MathId[];
    const implemented = new Set(getImplementedIds());

    // Sprint 1.1 Story 8 — grid layout. Tiles wrap to MAX_PER_ROW per
    // row; rows stack downward from `firstRowY`. EACH row is centered
    // independently relative to the canvas — so a partial last row
    // (e.g. 2 mult tiles after 4 add/sub tiles) sits centered beneath
    // the row above it, NOT left-aligned with column 0. Reads as
    // visually balanced for a kid scanning down the grid. When Phase
    // 1.5+1.6 land at 8 tiles, both rows become full and the
    // already-centered layout still looks pristine.
    //
    // Tile dimensions:
    //   - width 220 (sprint 0.7.5 Story 5) — fits "Subtract within 20"
    //     label with margin
    //   - height 116 (sprint 1.1 wrap-up) — bumped from 100 to give the
    //     larger wrapped subtitle (typography.ts buttonSubtitle 17 → 21)
    //     vertical room without colliding with the label or the bottom
    //     border. 21px subtitle × 2 lines × ~1.3 line-height ≈ 54px;
    //     label-Y stays at -28 (24px text spans -40 to -16); subtitle-Y
    //     stays at +22 (2-line block spans -5 to +49); 116-tall tile
    //     spans -58 to +58 → top padding 18, bottom padding 9. Fits.
    //
    // Row-gap 16 unchanged — visual rhythm carries.
    const tileWidth = 220;
    const tileHeight = 116;
    const colGap = 20;
    const rowGap = 16;
    const MAX_PER_ROW = 4;

    // Pre-compute how many tiles land on each row so we can center
    // each row's start-x against ITS tile count (not against
    // MAX_PER_ROW). The last row may be partial; every other row is
    // full.
    const rowCount = Math.ceil(ids.length / MAX_PER_ROW);
    const tilesInRow = (row: number): number => {
      if (row < rowCount - 1) return MAX_PER_ROW;
      // Last row: leftover after the full rows.
      return ids.length - (rowCount - 1) * MAX_PER_ROW;
    };
    const rowStartX = (row: number): number => {
      const n = tilesInRow(row);
      const w = n * tileWidth + (n - 1) * colGap;
      return cx - w / 2 + tileWidth / 2;
    };

    ids.forEach((id, i) => {
      const row = Math.floor(i / MAX_PER_ROW);
      const col = i % MAX_PER_ROW;
      const x = rowStartX(row) + col * (tileWidth + colGap);
      const y = firstRowY + row * (tileHeight + rowGap);

      const gen = generators[id];
      const isImplemented = implemented.has(id);
      const button = new PlaceholderButton({
        scene: this,
        x,
        y,
        width: tileWidth,
        height: tileHeight,
        label: gen.label,
        subtitle: gen.description,
        disabled: !isImplemented,
        onClick: isImplemented
          ? () => {
              Settings.setMathId(id);
              this.refreshSelection();
            }
          : undefined,
      });
      this.mathButtons.set(id, button);
    });
  }

  private renderSpeeds(cx: number, y: number): void {
    // Section label sits 75px above the row center. Speed tiles are
    // 64px tall (tile-top = y - 32); 32px bold sectionLabel half-height
    // ≈ 21. Visible gap between label-bottom and tile-top = 75 - 32 -
    // 21 = 22px. Smaller offset than Math Type because the tiles
    // themselves are shorter — keeps the proportional spacing
    // consistent across both sections.
    text(this, cx, y - 75, 'Speed', 'sectionLabel').setOrigin(0.5);

    const speeds: { key: SpeedKey; label: string }[] = [
      { key: 'slow', label: 'Slow' },
      { key: 'medium', label: 'Medium' },
      { key: 'fast', label: 'Fast' },
    ];
    const tileWidth = 160;
    const gap = 20;
    const totalWidth = speeds.length * tileWidth + (speeds.length - 1) * gap;
    const startX = cx - totalWidth / 2 + tileWidth / 2;

    speeds.forEach((s, i) => {
      const button = new PlaceholderButton({
        scene: this,
        x: startX + i * (tileWidth + gap),
        y,
        width: tileWidth,
        height: 64,
        label: s.label,
        onClick: () => {
          Settings.setSpeed(s.key);
          this.refreshSelection();
        },
      });
      this.speedButtons.set(s.key, button);
    });
  }

  private renderStartButton(cx: number, y: number): void {
    this.startButton = new PlaceholderButton({
      scene: this,
      x: cx,
      y,
      width: 200,
      height: 56,
      label: 'Start',
      disabled: true,
      onClick: () => {
        if (Settings.isReady()) {
          this.scene.start(SceneKeys.Game);
        }
      },
    });
  }

  private renderBackButton(x: number, y: number): void {
    this.backButton = new PlaceholderButton({
      scene: this,
      x,
      y,
      width: 160,
      height: 56,
      label: 'Back',
      onClick: () => this.scene.start(SceneKeys.GameSelect),
    });
  }

  private refreshSelection(): void {
    const { mathId, speed } = Settings.round;
    for (const [id, btn] of this.mathButtons) {
      btn.setSelected(id === mathId);
    }
    for (const [key, btn] of this.speedButtons) {
      btn.setSelected(key === speed);
    }
    this.startButton?.setDisabled(!Settings.isReady());
  }

  /**
   * Pre-populate Settings with sane defaults if the user hasn't picked yet.
   * Called once on scene entry, AFTER the buttons have been rendered (so
   * the math-type pick is gated on `getImplementedIds()` matching the
   * actual buttons on screen).
   *
   * Existing selections are preserved — a user who picked Subtract within 10
   * before, came back here from Game Over, and is replaying still sees their
   * prior choices selected.
   */
  private applyDefaultSelections(): void {
    if (Settings.round.mathId === null) {
      const firstImplemented = getImplementedIds()[0];
      if (firstImplemented !== undefined) {
        Settings.setMathId(firstImplemented);
      }
    }
    if (Settings.round.speed === null) {
      Settings.setSpeed('medium');
    }
  }
}
