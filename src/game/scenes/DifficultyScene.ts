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

    // Vertical anchors. Sprint 1.5 — with 9 implemented math types
    // (after Phase 1 division + Mixed landed), the math grid wraps to
    // 3 rows of 4-per-row at 220px tile width (row 3 has 1 tile centered).
    // To fit 3 math rows + Speed + Start/Back + AGPL footer in the
    // 720-tall design canvas, math tiles were SHRUNK 116 → 64 tall AND
    // their subtitles DROPPED — the labels alone ("Add to 10", "Multiply
    // 10×10", "Mixed") are self-descriptive enough at this point in
    // the player's journey, and the subtitle text was redundant for
    // returning players. New shorter tiles match the Speed-button
    // height visually, which incidentally makes the whole screen read
    // as a more uniform grid.
    //
    // Layout math (3 math rows × 64 tall, 12-px row gap):
    //   Math row 1 at y=0.30=216 (label at y=126, tile-top=184, bot=248)
    //   Math row 2 at y=216 + (64+12) = 292 (top 260, bot 324)
    //   Math row 3 at y=216 + 2*(64+12) = 368 (top 336, bot 400)
    //   Speed label at y=460 (=Speed-row-y - 60 = 0.72*720-60); Speed
    //     row at y=520, tile-top 488, bot 552
    //   Start/Back at y=0.85*720=612, button-top 584, bot 640
    //   AGPL footer top y=688 → 48-px clearance from Start/Back bottom.
    //   Plenty of margin.
    //
    // Subtitle drop is applied via `subtitle: undefined` in
    // renderMathTypes (the PlaceholderButton's existing no-subtitle
    // path auto-centers the label).
    this.renderMathTypes(cx, height * 0.3);
    this.renderSpeeds(cx, height * 0.72);
    this.renderStartButton(cx, height * 0.85);
    this.renderBackButton(cx - 250, height * 0.85);

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
    // Sprint 1.5 wrap-up — all geometry sourced from
    // config.layout.difficultyTile. See the tuning-history comment
    // on that config block for the back-and-forth that landed us here.
    const dt = config.layout.difficultyTile;
    text(this, cx, firstRowY - dt.mathSectionLabelOffsetY, 'Math Type', 'sectionLabel').setOrigin(
      0.5,
    );

    const ids = Object.keys(config.scoring.mathDifficulty) as MathId[];
    const implemented = new Set(getImplementedIds());

    // Per-row centering preserved from sprint 1.1 Story 8 — partial
    // last row (row 3 with 1 tile when there are 9 tiles total) sits
    // centered relative to the canvas, not left-aligned. Subtitle is
    // dropped for math tiles per sprint 1.5 Story 5 — the labels alone
    // are self-descriptive. (Mixed renamed "Mixed Math" in sprint 1.5
    // wrap-up so its label is self-descriptive without a subtitle.)
    const tileWidth = dt.mathWidthPx;
    const tileHeight = dt.mathHeightPx;
    const colGap = dt.mathColGapPx;
    const rowGap = dt.mathRowGapPx;
    const MAX_PER_ROW = dt.mathMaxPerRow;

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
        // Subtitle DROPPED in Sprint 1.5 — see renderMathTypes header
        // comment for the rationale. Sprint 1.5 wrap-up also DELETED
        // the now-dead `gen.description` field from the
        // QuestionGenerator type (was unread after Story 5). If a
        // future sprint adds tooltips or a help screen, restore the
        // field from git history — types.ts has a comment pointing at
        // the prior commit.
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
    // All geometry from config.layout.difficultyTile (sprint 1.5
    // wrap-up lift). See that config block for tuning history.
    const dt = config.layout.difficultyTile;
    text(this, cx, y - dt.speedSectionLabelOffsetY, 'Speed', 'sectionLabel').setOrigin(0.5);

    const speeds: { key: SpeedKey; label: string }[] = [
      { key: 'slow', label: 'Slow' },
      { key: 'medium', label: 'Medium' },
      { key: 'fast', label: 'Fast' },
    ];
    const tileWidth = dt.speedWidthPx;
    const gap = dt.speedGapPx;
    const totalWidth = speeds.length * tileWidth + (speeds.length - 1) * gap;
    const startX = cx - totalWidth / 2 + tileWidth / 2;

    speeds.forEach((s, i) => {
      const button = new PlaceholderButton({
        scene: this,
        x: startX + i * (tileWidth + gap),
        y,
        width: tileWidth,
        height: dt.speedHeightPx,
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
          // Sprint 2.1 — route by gameId. Each game mode has its own
          // scene key; this dispatch is the single point where the
          // user's "Pick a Game" choice translates to a scene transition.
          const target =
            Settings.round.gameId === 'asteroid-field'
              ? SceneKeys.AsteroidField
              : SceneKeys.Game;
          this.scene.start(target);
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
