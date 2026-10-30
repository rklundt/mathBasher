// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { _th, SeverityLevel } from '@/core/telemetry';
import { isMathGameId, type GameId } from '@/core/gameIds';
import { SUBJECTS, type SubjectId } from '@/core/subjects';
import { gameGroupById, type GameGroupId } from '@/core/gameGroups';
import { puzzleById } from '@/core/puzzles';
import { GAME_ICON_SHEET, PUZZLE_ICON_SHEET } from '@/core/spriteKeys';
import { CHOOSER_TITLES, GROUP_TILES, MATH_GAME_TILES, MORE_COMING_SOON, SUBJECT_TILES } from '@/core/chooserTiles';
import {
  SUBJECTS_STEP,
  gamesOn,
  groupsOf,
  stepAfterSubject,
  stepBefore,
  stepTagName,
  trailFor,
  type ChooserStep,
} from '@/core/chooserSteps';
import { getRememberedPicks } from '@/services/RememberedPicks';
import { KeyboardNavigator, type Focusable } from '@/game/ui/KeyboardNavigator';
import { computeGridSlots, type GridSpec } from '@/game/ui/menuLayoutGeometry';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { createTopBar } from '@/game/ui/topBar';
import { createTrail } from '@/game/ui/trail';
import { createChoiceTile } from '@/game/ui/choiceTile';
import { addScreenTag } from '@/game/ui/screenTag';
import type { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { setupScene } from '@/game/scenes/sceneSetup';
import { openMyScores, openSetup, type GameChooserInit } from '@/game/services/chooserNavigation';

/** A picture on a tile: a game's or a puzzle's sheet frame. */
function pictureOf(id: GameId): { key: string; frame: number } {
  return isMathGameId(id)
    ? { key: GAME_ICON_SHEET.key, frame: GAME_ICON_SHEET.frames[id] }
    : { key: PUZZLE_ICON_SHEET.key, frame: PUZZLE_ICON_SHEET.frames[id] };
}

/**
 * Sprint 2.15 — the Game Chooser: what kind of thing to play, in steps.
 * **Subject** (Math, Puzzles, "More Coming Soon") › **group** (Math only:
 * mathBasher, Math Fun) › **games** (each with its picture and a lively
 * line). A game opens its setup screen. It replaced the challenge picker
 * and Game Select (ADR-0015).
 *
 * One scene, redrawn per step: the top bar (Back, the step's title, My
 * Scores, Settings, mute), the "where you are" trail (each chip goes back
 * to its step) and the tiles. Back and Esc walk up a step; from the
 * subjects, the Title Screen. The last subject and group are remembered,
 * already ringed, and the game started last wears "Last Played".
 */
export class GameChooserScene extends Phaser.Scene {
  static readonly key = SceneKeys.GameChooser;

  private step: ChooserStep = SUBJECTS_STEP;
  private nav?: KeyboardNavigator;

  constructor() {
    super(GameChooserScene.key);
  }

  init(data: GameChooserInit): void {
    // Phaser keeps the last start data: every opening says where it starts.
    this.step = data.step ?? SUBJECTS_STEP;
  }

  create(): void {
    setupScene(this);
    this.nav = undefined;
    wireEscBack(this, () => this.goBack());
    this.render(false);
  }

  private goTo(step: ChooserStep): void {
    _th.logToAi('ChooserStep', SeverityLevel.Information, { reason: stepTagName(step) });
    this.step = step;
    this.render(true);
  }

  private goBack(): void {
    const before = stepBefore(this.step);
    if (before === 'title') this.scene.start(SceneKeys.Title);
    else this.goTo(before);
  }

  /** Draw the current step (everything is redrawn): top bar, trail, tiles; then the Tab order. */
  private render(fade: boolean): void {
    this.nav?.destroy();
    this.tweens.killAll();
    this.children.removeAll(true);

    const step = this.step;
    const bar = createTopBar(this, {
      title: this.titleFor(step),
      onBack: () => this.goBack(),
      onScores: () => openMyScores(this, { step } satisfies GameChooserInit),
    });
    const trail = createTrail(this, trailFor(step), (chip) => this.goTo(chip.to));
    addScreenTag(this, `GameChooserScene · ${stepTagName(step)}`);

    const { tiles, focusAt } = this.buildTiles(step);

    const order: Focusable[] = [...bar.focusables, ...trail.buttons, ...tiles];
    const firstTile = bar.focusables.length + trail.buttons.length;
    this.nav = new KeyboardNavigator(this, order, { initialIndex: firstTile + Math.max(0, focusAt) });

    if (fade) {
      for (const tile of tiles) {
        const to = tile.alpha;
        tile.setAlpha(0);
        this.tweens.add({ targets: tile, alpha: to, duration: config.layout.chooser.swapFadeMs, ease: 'Sine.Out' });
      }
    }
  }

  private titleFor(step: ChooserStep): string {
    switch (step.kind) {
      case 'subjects':
        return CHOOSER_TITLES.subjects;
      case 'groups':
        return CHOOSER_TITLES.groups;
      case 'games':
        return CHOOSER_TITLES.games[step.subject];
    }
  }

  /** The step's tiles, and which one focus starts on (the remembered one). */
  private buildTiles(step: ChooserStep): { tiles: PlaceholderButton[]; focusAt: number } {
    switch (step.kind) {
      case 'subjects':
        return this.subjectTiles();
      case 'groups':
        return this.groupTiles(step.subject);
      case 'games':
        return this.gameTiles(gamesOn(step));
    }
  }

  /** Grid slots for `count` tiles, centred in the space under the trail. */
  private slots(count: number, spec: GridSpec, trail: boolean): ReturnType<typeof computeGridSlots> {
    const C = config.layout.chooser.content;
    const top = trail ? C.top : C.topNoTrail;
    const rows = Math.ceil(count / spec.perRow);
    const blockH = rows * spec.cellH + (rows - 1) * spec.gapY;
    const firstRowY = (top + C.bottom) / 2 - blockH / 2 + spec.cellH / 2;
    return computeGridSlots(this.scale.width / 2, firstRowY, count, spec);
  }

  private subjectTiles(): { tiles: PlaceholderButton[]; focusAt: number } {
    const C = config.layout.chooser;
    const remembered = getRememberedPicks().subject;
    const slots = this.slots(SUBJECTS.length + 1, C.subjects, false);
    const tiles = SUBJECTS.map((s, i) => {
      const t = SUBJECT_TILES[s.id];
      return createChoiceTile({
        scene: this,
        ...slotBox(slots[i]),
        pictures: t.pictures.map(pictureOf),
        picturePx: C.picturePx.subject,
        name: t.name,
        nameKind: 'tileNameLarge',
        lines: [{ text: t.line, kind: 'tileLine' }],
        selected: s.id === remembered,
        onClick: () => this.pickSubject(s.id),
      });
    });
    const more = createChoiceTile({
      scene: this,
      ...slotBox(slots[SUBJECTS.length]),
      name: MORE_COMING_SOON.name,
      nameKind: 'tileName',
      lines: [{ text: MORE_COMING_SOON.line, kind: 'tileLine' }],
      disabled: true,
    });
    const focusAt = SUBJECTS.findIndex((s) => s.id === remembered);
    return { tiles: [...tiles, more], focusAt };
  }

  private groupTiles(subject: SubjectId): { tiles: PlaceholderButton[]; focusAt: number } {
    const C = config.layout.chooser;
    const groups = groupsOf(subject);
    const remembered = getRememberedPicks().group;
    const slots = this.slots(groups.length, C.groups, true);
    const tiles = groups.map((g, i) => {
      const t = GROUP_TILES[g.id];
      return createChoiceTile({
        scene: this,
        ...slotBox(slots[i]),
        pictures: t.pictures.map(pictureOf),
        picturePx: C.picturePx.group,
        name: g.label,
        nameKind: 'tileNameLarge',
        lines: [
          { text: t.tagline, kind: 'tileTagline' },
          { text: `${String(g.games.length)} ${t.gamesNoun}`, kind: 'tileLine' },
        ],
        selected: g.id === remembered,
        onClick: () => this.pickGroup(subject, g.id),
      });
    });
    return { tiles, focusAt: groups.findIndex((g) => g.id === remembered) };
  }

  private gameTiles(games: readonly GameId[]): { tiles: PlaceholderButton[]; focusAt: number } {
    const C = config.layout.chooser;
    const G = C.games;
    const rows = Math.ceil(games.length / G.perRow);
    const spec: GridSpec = { ...G, cellH: rows > 1 ? G.cellH2Rows : G.cellH };
    const slots = this.slots(games.length, spec, true);
    const last = getRememberedPicks().lastGame;
    const tiles = games.map((id, i) => {
      const { name, line } = isMathGameId(id)
        ? MATH_GAME_TILES[id]
        : { name: puzzleById(id).label, line: puzzleById(id).blurb };
      return createChoiceTile({
        scene: this,
        ...slotBox(slots[i]),
        pictures: [pictureOf(id)],
        picturePx: isMathGameId(id) ? C.picturePx.game : C.picturePx.puzzle,
        name,
        nameKind: 'tileName',
        lines: [{ text: line, kind: 'tileLine' }],
        ...(id === last && { badge: 'Last Played', selected: true }),
        onClick: () => openSetup(this, id),
      });
    });
    return { tiles, focusAt: last === null ? -1 : games.indexOf(last) };
  }

  private pickSubject(id: SubjectId): void {
    getRememberedPicks().setSubject(id);
    this.goTo(stepAfterSubject(id));
  }

  private pickGroup(subject: SubjectId, id: GameGroupId): void {
    getRememberedPicks().setGroup(id);
    this.goTo({ kind: 'games', subject, group: gameGroupById(id).id });
  }
}

/** A grid slot as a tile's box. */
function slotBox(s: { x: number; y: number; width: number; height: number }): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return { x: s.x, y: s.y, width: s.width, height: s.height };
}
