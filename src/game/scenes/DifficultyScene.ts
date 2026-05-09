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
    _th.logToAi('DifficultyScene Started', SeverityLevel.Information);

    const { width, height } = this.scale;
    const cx = width / 2;

    this.add
      .text(cx, height * 0.1, 'Pick Difficulty', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '36px',
        color: '#eaeaf2',
      })
      .setOrigin(0.5);

    this.renderMathTypes(cx, height * 0.32);
    this.renderSpeeds(cx, height * 0.62);
    this.renderStartButton(cx, height * 0.85);
    this.renderBackButton(cx - 250, height * 0.85);

    this.refreshSelection();

    _th.logToAi('DifficultyScene Completed', SeverityLevel.Information);
  }

  private renderMathTypes(cx: number, y: number): void {
    this.add
      .text(cx, y - 50, 'Math Type', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: '#9ca3af',
      })
      .setOrigin(0.5);

    const ids = Object.keys(config.scoring.mathDifficulty) as MathId[];
    const implemented = new Set(getImplementedIds());
    const tileWidth = 200;
    const gap = 20;
    const totalWidth = ids.length * tileWidth + (ids.length - 1) * gap;
    const startX = cx - totalWidth / 2 + tileWidth / 2;

    ids.forEach((id, i) => {
      const gen = generators[id];
      const isImplemented = implemented.has(id);
      const button = new PlaceholderButton({
        scene: this,
        x: startX + i * (tileWidth + gap),
        y,
        width: tileWidth,
        height: 80,
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
    this.add
      .text(cx, y - 50, 'Speed', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: '#9ca3af',
      })
      .setOrigin(0.5);

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
    new PlaceholderButton({
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
}
