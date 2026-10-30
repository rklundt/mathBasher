// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import { config } from '@/core/config';
import { isMathGameId, type GameId } from '@/core/gameIds';
import { gamesStepFor, trailFor } from '@/core/chooserSteps';
import { gameName } from '@/core/chooserTiles';
import { GAME_ICON_SHEET, PUZZLE_ICON_SHEET } from '@/core/spriteKeys';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import type { Focusable } from '@/game/ui/KeyboardNavigator';
import { createTopBar } from '@/game/ui/topBar';
import { createTrail } from '@/game/ui/trail';
import { addScreenTag } from '@/game/ui/screenTag';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { text, textStyle } from '@/game/ui/typography';
import { openChooser, openGamesFor, openMyScores } from '@/game/services/chooserNavigation';

export interface SetupFrame {
  /** The top bar and the trail, in Tab order (the screen's own picks go after). */
  top: Focusable[];
  start: PlaceholderButton;
  /** "Your best: …" beside Start. */
  best: Phaser.GameObjects.Text;
}

/**
 * Sprint 2.15 — what every setup screen shares (math, puzzles, Pair Pals):
 * the chooser's top bar with the game's picture and name, the trail
 * ("Math › mathBasher › Alien Shoot"; each chip goes back to that step), the
 * best line and a big Start along the bottom, the screen tag, and Back / Esc
 * to the games list.
 */
export function createSetupFrame(
  scene: Phaser.Scene,
  game: GameId,
  /** The screen tag's name ("MathSetupScene"); class names don't survive the production build. */
  tagName: string,
  onStart: () => void,
): SetupFrame {
  const S = config.layout.chooser.setup;
  const games = gamesStepFor(game);
  // The game's own backdrop shows through (Background follows the game);
  // a dark wash keeps the words readable on a bright pond or snow.
  const { width: w, height: h } = scene.scale;
  scene.add.rectangle(0, 0, w, h, S.washColor, S.washAlpha).setOrigin(0);
  const back = (): void => openGamesFor(scene, game);

  const bar = createTopBar(scene, {
    title: gameName(game),
    picture: isMathGameId(game)
      ? { key: GAME_ICON_SHEET.key, frame: GAME_ICON_SHEET.frames[game] }
      : { key: PUZZLE_ICON_SHEET.key, frame: PUZZLE_ICON_SHEET.frames[game] },
    onBack: back,
    onScores: () => openMyScores(scene),
  });
  const trail = createTrail(scene, trailFor(games, { label: gameName(game), to: games }), (chip) =>
    openChooser(scene, chip.to),
  );

  const { width } = scene.scale;
  const start = new PlaceholderButton({
    scene,
    x: width - S.sidePadPx - S.startW / 2,
    y: S.bottomY,
    width: S.startW,
    height: S.startH,
    label: '▶  Start',
    labelKind: 'h3',
    variant: 'primary',
    onClick: onStart,
  });
  const best = text(scene, S.sidePadPx, S.bottomY, '', 'bestLine').setOrigin(0, 0.5);
  best.setWordWrapWidth(width - 2 * S.sidePadPx - S.startW - 24);

  addScreenTag(scene, `${tagName} · ${game}`);
  wireEscBack(scene, back);
  return { top: [...bar.focusables, ...trail.buttons], start, best };
}

/** A section heading ("What math?") at the screen's left margin. */
export function sectionHeading(scene: Phaser.Scene, y: number, label: string): Phaser.GameObjects.Text {
  return scene.add.text(config.layout.chooser.setup.sidePadPx, y, label, textStyle('setupHeading')).setOrigin(0, 0.5);
}
