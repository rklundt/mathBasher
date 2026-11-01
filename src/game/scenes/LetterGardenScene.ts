// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { config } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import type { RoundPuzzleId } from '@/core/gameIds';
import { pickTileFlipSfx } from '@/core/audioKeys';
import { getAudioManager } from '@/services/audioManagerFactory';
import { Settings } from '@/services/Settings';
import {
  type WordList,
  checkTrace,
  neighbours,
  pathFor,
  pickBoard,
  revealWord,
  wordListFrom,
  wordOf,
  type LetterGardenData,
} from '@/game/systems/puzzles/letterGarden';
import { ThemedRoundScene } from '@/game/scenes/ThemedRoundScene';
import { DragPath } from '@/game/ui/dragPath';
import { PUZZLE_DEPTH, SandTimer, sparkle } from '@/game/ui/puzzleFrame';
import { text } from '@/game/ui/typography';
import { applyTextOutline } from '@/game/ui/callouts';

const P = config.puzzles;
const LG = P.letterGarden;
const INK = 0x3a2420;

/**
 * Sprint 2.16 — Letter Garden (owner, 2026-11-01): drag through touching
 * letters (across, down or diagonal) to make words. Eight words a round,
 * sand for each (owner: "8 words, timer each"); a new garden every
 * `wordsPerBoard` words. A word that isn't in the list is a miss; too short
 * or already found just says so. Three misses or the sand and it goes red,
 * showing a word that was there. The drag is `ui/dragPath.ts` (reusable);
 * on a keyboard, typing the word finds its letters.
 */
export class LetterGardenScene extends ThemedRoundScene {
  static readonly key = SceneKeys.LetterGarden;

  private gardenData!: LetterGardenData;
  private list!: WordList;
  private board = '';
  private size = 4;
  private minLetters = 3;
  private found = new Set<string>();
  private boardObjects: Phaser.GameObjects.GameObject[] = [];
  private tiles: Phaser.GameObjects.Graphics[] = [];
  private centres: { x: number; y: number }[] = [];
  private tilePx = 100;
  private drag?: DragPath;
  private current!: Phaser.GameObjects.Text;
  private foundText!: Phaser.GameObjects.Text;
  private typed = '';
  private misses = 0;
  private live = false;
  private sand?: SandTimer;

  constructor() {
    super(LetterGardenScene.key);
  }

  preload(): void {
    super.preload();
    if (!this.cache.json.exists(LG.wordsKey)) this.load.json(LG.wordsKey, LG.wordsUrl);
  }

  protected puzzleId(): RoundPuzzleId | null {
    return Settings.round.gameId === 'letter-garden' ? 'letter-garden' : null;
  }

  protected startRound(): void {
    this.gardenData = this.cache.json.get(LG.wordsKey) as LetterGardenData;
    const t0 = performance.now();
    this.list = wordListFrom(this.gardenData);
    _th.logToAi('LetterGarden.WordListReady', SeverityLevel.Information, {
      ...this.props(),
      reason: `word list ready in ${String(Math.round(performance.now() - t0))} ms`,
    });
    this.size = LG.size[this.level];
    this.minLetters = LG.minLetters[this.level];
    this.board = '';
    this.boardObjects = [];
    this.sand = new SandTimer(this, this.scale.width / 2, P.layout.sand.y, P.layout.sand.width);

    // The word being traced (left) and the words found in this garden (right).
    this.current = text(this, 205, 330, '', 'h2').setOrigin(0.5).setDepth(PUZZLE_DEPTH.stage);
    this.current.setColor(this.colours.onBackdrop);
    if (this.theme === 'cosmos') applyTextOutline(this.current);
    const hint = text(this, 205, 400, 'Drag across\ntouching letters', 'bodyLarge')
      .setOrigin(0.5)
      .setAlign('center')
      .setDepth(PUZZLE_DEPTH.stage);
    hint.setColor(this.colours.onBackdrop);
    if (this.theme === 'cosmos') applyTextOutline(hint);
    const heading = text(this, 1075, 220, 'Found', 'sectionLabel').setOrigin(0.5).setDepth(PUZZLE_DEPTH.stage);
    applyTextOutline(heading);
    this.foundText = text(this, 1075, 255, '', 'bodyLarge')
      .setOrigin(0.5, 0)
      .setAlign('center')
      .setDepth(PUZZLE_DEPTH.stage);
    applyTextOutline(this.foundText);

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.events.once('shutdown', () => this.drag?.destroy());
    this.showWord(0);
  }

  /** Word `i` of the round: a new garden every `wordsPerBoard`, and the sand. */
  private showWord(i: number): void {
    this.misses = 0;
    this.typed = '';
    const prompt = `Find a word with ${String(this.minLetters)} letters or more!`;
    this.beginPuzzle(i, prompt);
    if (i % LG.wordsPerBoard === 0 || this.board === '') this.newGarden();
    this.paintTiles([]);
    this.current.setText('');
    this.live = true;
    this.drag?.setEnabled(true);
    this.sand?.start(P.timed['letter-garden'][this.level], () => this.miss('Time’s up!'));
    this.restartClock();
  }

  private newGarden(): void {
    for (const o of this.boardObjects) o.destroy();
    this.boardObjects = [];
    this.drag?.destroy();
    this.found = new Set();
    this.foundText.setText('');
    this.board = pickBoard(this.gardenData, this.level, this.board);
    const n = this.size;
    this.tilePx = n === 5 ? 78 : 92;
    const gap = n === 5 ? 10 : 14;
    const span = n * this.tilePx + (n - 1) * gap;
    const cx = 640;
    const cy = 412;
    const bed = this.add.graphics().setDepth(PUZZLE_DEPTH.stage - 1);
    bed
      .fillStyle(this.colours.bed, 0.9)
      .fillRoundedRect(cx - span / 2 - 22, cy - span / 2 - 22, span + 44, span + 44, 30);
    bed.lineStyle(5, INK, 1).strokeRoundedRect(cx - span / 2 - 22, cy - span / 2 - 22, span + 44, span + 44, 30);
    this.boardObjects.push(bed);
    this.tiles = [];
    this.centres = [];
    for (let k = 0; k < n * n; k++) {
      const x = cx - span / 2 + this.tilePx / 2 + (k % n) * (this.tilePx + gap);
      const y = cy - span / 2 + this.tilePx / 2 + Math.floor(k / n) * (this.tilePx + gap);
      this.centres.push({ x, y });
      const g = this.add.graphics().setDepth(PUZZLE_DEPTH.stage);
      const letter = text(this, x, y, this.board[k].toUpperCase(), 'weightLabel')
        .setOrigin(0.5)
        .setDepth(PUZZLE_DEPTH.stage + 1);
      letter.setFontSize(Math.round(this.tilePx * 0.52));
      letter.setScale(0);
      this.tweens.add({ targets: letter, scale: 1, duration: 220, delay: k * 18, ease: 'Back.Out' });
      this.tiles.push(g);
      this.boardObjects.push(g, letter);
    }
    this.drag = new DragPath({
      scene: this,
      cells: this.centres,
      hitRadius: this.tilePx * 0.42,
      canFollow: (a, b) => neighbours(a, n).includes(b),
      onChange: (path) => {
        this.typed = '';
        this.paintTiles(path);
        this.current.setText(wordOf(this.board, path).toUpperCase());
        if (path.length > 0) getAudioManager().play(pickTileFlipSfx(), 'sfx');
      },
      onEnd: (path) => this.submit(path),
      lineColour: this.colours.trace,
      depth: PUZZLE_DEPTH.stage + 2,
    });
  }

  /** Draw every tile, the ones in `on` lit. */
  private paintTiles(on: readonly number[], colour = this.colours.tileOn): void {
    const r = this.tilePx / 2;
    this.tiles.forEach((g, k) => {
      const { x, y } = this.centres[k];
      g.clear();
      g.fillStyle(on.includes(k) ? colour : this.colours.tile, 1);
      if (this.theme === 'critters') {
        // A flower: five petals round the letter's disc.
        for (let p = 0; p < 5; p++) {
          const a = -Math.PI / 2 + (p * 2 * Math.PI) / 5;
          g.fillCircle(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.5);
        }
        g.lineStyle(3, INK, 1).strokeCircle(x, y, r * 0.74);
        g.fillCircle(x, y, r * 0.72);
      } else {
        g.fillRoundedRect(x - r, y - r, r * 2, r * 2, r * 0.3);
        g.lineStyle(3, INK, 1).strokeRoundedRect(x - r, y - r, r * 2, r * 2, r * 0.3);
      }
    });
  }

  /** Typing on a keyboard: letters find a path, Backspace takes one off, Enter tries the word. */
  private onKey(e: KeyboardEvent): void {
    if (this.blocked || !this.live) return;
    const key = e.key.toLowerCase();
    if (key === 'enter') {
      const path = pathFor(this.board, this.size, this.typed);
      if (path) this.submit(path);
      return;
    }
    if (key === 'backspace') this.typed = this.typed.slice(0, -1);
    else if (/^[a-z]$/.test(key)) {
      const next = this.typed + key;
      if (pathFor(this.board, this.size, next) === null) {
        this.tweens.add({ targets: this.current, x: { from: 195, to: 215 }, duration: 60, yoyo: true, repeat: 1 });
        return;
      }
      this.typed = next;
    } else return;
    const path = pathFor(this.board, this.size, this.typed) ?? [];
    this.drag?.show(path);
    this.paintTiles(path);
    this.current.setText(this.typed.toUpperCase());
  }

  private submit(path: readonly number[]): void {
    this.drag?.clear();
    this.typed = '';
    if (this.blocked || !this.live || path.length === 0) {
      this.paintTiles([]);
      return;
    }
    const word = wordOf(this.board, path);
    const result = checkTrace(word, this.minLetters, this.list, this.found);
    if (result === 'short' || result === 'again') {
      this.paintTiles([]);
      this.current.setText('');
      this.prompt.flash(
        result === 'short' ? `Too short! ${String(this.minLetters)} letters or more.` : 'You found that one already!',
        'retry',
      );
      return;
    }
    if (result === 'unknown') {
      this.misses++;
      this.paintTiles(path, 0xf87171);
      this.time.delayedCall(450, () => {
        if (this.live) this.paintTiles([]);
      });
      if (this.outOfTries(this.misses)) this.miss('Here’s one!');
      else this.markWrong(`${word.toUpperCase()} isn’t in my word list.`);
      return;
    }
    this.live = false;
    this.drag?.setEnabled(false);
    this.sand?.stop();
    this.found.add(word);
    this.foundText.setText([...this.found].map((w) => w.toUpperCase()).join('\n'));
    this.paintTiles(path, 0x4ade80);
    for (const k of path) sparkle(this, this.centres[k].x, this.centres[k].y, 5);
    this.markRight(this.misses, this.sand?.used() ?? null, `${word.toUpperCase()}!`, () => this.next());
  }

  /** Red: the sand ran out or three misses. Show a word that was there. */
  private miss(note: string): void {
    if (!this.live) return;
    this.live = false;
    this.drag?.setEnabled(false);
    this.sand?.stop();
    const r = revealWord(this.board, this.size, this.list, this.minLetters, this.found);
    if (r) {
      this.paintTiles(r.path, 0xffd43b);
      this.drag?.show(r.path);
      this.current.setText(r.word.toUpperCase());
      this.found.add(r.word);
    }
    this.markRed(r ? `${note} You could make ${r.word.toUpperCase()}.` : note, () => {
      this.drag?.clear();
      this.next();
    });
  }

  private next(): void {
    if (this.index + 1 >= P.perRound) {
      this.sand?.destroy();
      this.endRound();
      return;
    }
    this.showWord(this.index + 1);
  }
}
