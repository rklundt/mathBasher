// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { isThemedPickId, type RoundPuzzleId, type ThemedPickId } from '@/core/gameIds';
import { PUZZLE_PICS_SHEET, THEME_COUNTERS_SHEET } from '@/core/spriteKeys';
import { pickTileFlipSfx } from '@/core/audioKeys';
import { getAudioManager } from '@/services/audioManagerFactory';
import { Settings } from '@/services/Settings';
import { generateThemedRound, type ThemedPuzzle } from '@/game/systems/puzzles/themedPuzzles';
import { wordListFrom, type LetterGardenData } from '@/game/systems/puzzles/letterGarden';
import { textToken, type TextToken, type Token } from '@/game/systems/puzzles/tokens';
import { ThemedRoundScene } from '@/game/scenes/ThemedRoundScene';
import { AnswerTray, PUZZLE_DEPTH, SandTimer, questionCard, tokenCard } from '@/game/ui/puzzleFrame';
import { text } from '@/game/ui/typography';
import { applyTextOutline } from '@/game/ui/callouts';

const P = config.puzzles;
const INK = 0x3a2420;

/**
 * Sprint 2.16 — the nine Words and Numbers "pick one" puzzles in one scene
 * (which one comes from `Settings.round.gameId`): Word Train, Odd Word
 * Out, Word Wand, Missing Letter, Word Snap, Number Train, Number Machine,
 * Odd Number Out and Quick Count. Like the puzzle pack's pick-one scene:
 * the stage (a train, a shelf, a wand or machine, a picture with a gap, two
 * halves, a flash of counters), a tray of cards, sand for each puzzle; a
 * wrong card greys out, three of them (or the sand) and it goes red. Drawn
 * in the picked look (`ThemedRoundScene`).
 */
export class ThemedPickScene extends ThemedRoundScene {
  static readonly key = SceneKeys.ThemedPick;

  private puzzles: ThemedPuzzle[] = [];
  private stageObjects: Phaser.GameObjects.GameObject[] = [];
  private tray?: AnswerTray;
  private slot?: { x: number; y: number; w: number; h: number; card: Phaser.GameObjects.Container };
  /** Missing Letter: its gaps, left to right (Hard has two). */
  private letterGaps: { x: number; y: number; w: number; h: number; card: Phaser.GameObjects.Container }[] = [];
  private misses = 0;
  private locked = false;
  private sand?: SandTimer;
  /** Quick Count: the tray waits until the counters hide. */
  private flashTimer?: Phaser.Time.TimerEvent;
  /** Quick Count: the counters (hidden while the kid answers) and the "?" over them. */
  private flash?: { counters: Phaser.GameObjects.Image[]; cover?: Phaser.GameObjects.Text };

  constructor() {
    super(ThemedPickScene.key);
  }

  protected puzzleId(): RoundPuzzleId | null {
    const id = Settings.round.gameId;
    return isThemedPickId(id) ? id : null;
  }

  private get pickId(): ThemedPickId {
    return this.id as ThemedPickId;
  }

  preload(): void {
    super.preload();
    // Missing Letter checks its choices against Letter Garden's big word list (loaded once, shared).
    const LG = P.letterGarden;
    if (Settings.round.gameId === 'missing-letter' && !this.cache.json.exists(LG.wordsKey)) {
      this.load.json(LG.wordsKey, LG.wordsUrl);
    }
  }

  protected startRound(): void {
    const data = this.cache.json.get(P.letterGarden.wordsKey) as LetterGardenData | undefined;
    const words = this.pickId === 'missing-letter' && data ? wordListFrom(data) : undefined;
    this.puzzles = generateThemedRound(this.pickId, this.level, P.perRound, undefined, words);
    this.stageObjects = [];
    this.sand = new SandTimer(this, this.scale.width / 2, P.layout.sand.y, P.layout.sand.width);
    this.tray = undefined;
    this.slot = undefined;
    const kb = this.input.keyboard;
    kb?.on('keydown-LEFT', () => this.tray?.moveFocus(-1));
    kb?.on('keydown-RIGHT', () => this.tray?.moveFocus(1));
    const pickFocused = (): void => {
      const f = this.tray?.focused() ?? -1;
      if (f >= 0) this.pick(f);
      else this.tray?.moveFocus(0);
    };
    kb?.on('keydown-SPACE', pickFocused);
    kb?.on('keydown-ENTER', pickFocused);
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'].forEach((k, i) => kb?.on(`keydown-${k}`, () => this.pick(i)));
    this.showPuzzle(0);
  }

  private seconds(): number {
    return P.timed[this.pickId][this.level];
  }

  private showPuzzle(i: number): void {
    const stopTweens = (o: Phaser.GameObjects.GameObject): void => {
      this.tweens.killTweensOf(o);
      if (o instanceof Phaser.GameObjects.Container) o.list.forEach(stopTweens);
    };
    for (const o of this.stageObjects) {
      stopTweens(o);
      o.destroy();
    }
    this.stageObjects = [];
    this.tray?.destroy();
    this.tray = undefined;
    this.flashTimer?.remove(false);
    this.flash = undefined;
    this.slot = undefined;
    this.letterGaps = [];
    this.misses = 0;
    this.locked = false;
    const p = this.puzzles[i];
    this.beginPuzzle(i, p.prompt);
    switch (p.stage.kind) {
      case 'train':
        this.drawTrain(p.stage.cars);
        break;
      case 'shelf':
        this.drawShelf(p.choices.length);
        break;
      case 'pair':
        this.drawPair(p.stage.from, p.stage.to, p.stage.next);
        break;
      case 'machine':
        this.drawMachine(p.stage.rows, p.stage.next);
        break;
      case 'missing':
        this.drawMissing(p.stage.picture, p.stage.letters);
        break;
      case 'snap':
        this.drawSnap(p.stage.left, p.stage.right, p.stage.whole);
        break;
      case 'flash':
        this.drawFlash(p.stage.spots);
        return;
    }
    this.openTray(p);
  }

  /** The tray of cards (Odd One Out's stand on the shelf), and the sand starts. */
  private openTray(p: ThemedPuzzle): void {
    const shelf = p.stage.kind === 'shelf';
    const n = p.choices.length;
    const spots = shelf
      ? p.choices.map((_, k) => ({ x: this.scale.width / 2 + (k - (n - 1) / 2) * 190, y: 360 }))
      : undefined;
    // Owner (2026-11-01): cards with and without pictures side by side were confusing, so a
    // row shows pictures only when every card in it has one.
    const allPics = p.choices.every((c) => c.pic !== null);
    const cards = allPics ? p.choices : p.choices.map((c) => textToken(c.text));
    this.tray = new AnswerTray(this, cards, (c) => this.pick(c), spots, shelf ? 160 : undefined);
    this.sand?.start(this.seconds(), () => this.miss('Time’s up! It was this one.'));
    this.restartClock();
  }

  private pick(c: number): void {
    if (this.blocked || this.locked || !this.tray || c >= this.tray.cards.length || this.tray.isTried(c)) return;
    const p = this.puzzles[this.index];
    getAudioManager().play(pickTileFlipSfx(), 'sfx');
    if (c === p.answer) {
      this.locked = true;
      this.sand?.stop();
      this.tray.right(c);
      this.fillSlot(p.choices[c]);
      this.markRight(this.misses, this.sand?.used() ?? null, p.why, () => this.next());
      return;
    }
    this.misses++;
    this.tray.wrong(c);
    if (this.outOfTries(this.misses)) this.miss('It was this one!');
    else this.markWrong();
  }

  private miss(note: string): void {
    if (this.locked || !this.tray) return;
    this.locked = true;
    this.sand?.stop();
    const p = this.puzzles[this.index];
    this.tray.reveal(p.answer);
    this.fillSlot(p.choices[p.answer]);
    this.markRed(note, () => this.next());
  }

  private next(): void {
    if (this.index + 1 >= this.puzzles.length) {
      this.sand?.destroy();
      this.endRound();
      return;
    }
    this.showPuzzle(this.index + 1);
  }

  /** The "?" becomes the answer (Quick Count: the counters come back, so the kid can check). */
  private fillSlot(token: Token): void {
    if (this.flash) {
      this.tweens.add({ targets: this.flash.counters, alpha: 1, duration: 220 });
      if (this.flash.cover) this.tweens.add({ targets: this.flash.cover, alpha: 0, duration: 160 });
    }
    if (this.letterGaps.length > 0 && token.kind === 'text') {
      // Missing Letter: one letter of the card in each gap.
      const letters = token.text.replace(/ /g, '');
      this.letterGaps.forEach((g, k) => {
        const card = tokenCard(this, g.x, g.y, g.w, g.h, textToken(letters[k] ?? ''))
          .setDepth(PUZZLE_DEPTH.stage + 1)
          .setScale(0.3);
        this.tweens.add({ targets: card, scale: 1, duration: 260, delay: k * 90, ease: 'Back.Out' });
        g.card.setVisible(false);
        this.stageObjects.push(card);
      });
      return;
    }
    const s = this.slot;
    if (!s) return;
    const plain = token.kind === 'text' ? textToken(token.text) : token;
    const card = tokenCard(this, s.x, s.y, s.w, s.h, plain)
      .setDepth(PUZZLE_DEPTH.stage + 1)
      .setScale(0.3);
    this.tweens.add({ targets: card, scale: 1, duration: 260, ease: 'Back.Out' });
    s.card.setVisible(false);
    this.stageObjects.push(card);
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.stageObjects.push(o);
    (o as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(PUZZLE_DEPTH.stage);
    return o;
  }

  private popIn(targets: Phaser.GameObjects.GameObject[]): void {
    targets.forEach((t, i) => {
      const tr = t as unknown as Phaser.GameObjects.Components.Transform;
      const to = tr.scaleX;
      tr.setScale(to * 0.2);
      this.tweens.add({
        targets: t,
        scale: to,
        duration: P.timings.popInMs,
        delay: i * P.timings.popStaggerMs,
        ease: 'Back.Out',
      });
    });
  }

  /** A card (no picture) the stage shows. */
  private card(x: number, y: number, w: number, h: number, t: TextToken): Phaser.GameObjects.Container {
    return this.keep(tokenCard(this, x, y, w, h, textToken(t.text)));
  }

  /** A "?" card that the answer fills. */
  private gap(x: number, y: number, w: number, h: number): Phaser.GameObjects.Container {
    const q = this.keep(questionCard(this, x, y, w, h));
    this.slot = { x, y, w, h, card: q };
    return q;
  }

  /** A fat right arrow (the change from one card to the next). */
  private arrow(x: number, y: number): Phaser.GameObjects.Graphics {
    const g = this.keep(this.add.graphics());
    g.fillStyle(this.colours.arrow, 1);
    g.lineStyle(4, INK, 1);
    const pts = [
      [-30, -9],
      [6, -9],
      [6, -22],
      [32, 0],
      [6, 22],
      [6, 9],
      [-30, 9],
    ].map(([px, py]) => new Phaser.Math.Vector2(x + px, y + py));
    g.fillPoints(pts, true).strokePoints(pts, true, true);
    return g;
  }

  /** A word straight on the backdrop ("so", "+", "="), readable in either look. */
  private say(x: number, y: number, s: string): Phaser.GameObjects.Text {
    const t = this.keep(text(this, x, y, s, 'h3').setOrigin(0.5).setColor(this.colours.onBackdrop));
    if (this.theme === 'cosmos') applyTextOutline(t);
    return t;
  }

  // ----- stages ------------------------------------------------------------

  /** Word / Number Train: the look's engine and a car per card, one of them "?". */
  private drawTrain(cars: readonly (TextToken | null)[]): void {
    const T = this.art.train;
    const n = cars.length + 1;
    const scale = Math.min(0.82, (this.scale.width - 80) / (n * T.frameWidth));
    const carW = T.frameWidth * scale;
    const y = 330;
    const x0 = this.scale.width / 2 - ((n - 1) * carW) / 2;
    const track = this.keep(this.add.graphics());
    const railY = y + (T.frameHeight * scale) / 2 - 6;
    track.fillStyle(this.theme === 'cosmos' ? 0x63e6be : 0xa86a3c, this.theme === 'cosmos' ? 0.5 : 1);
    track.fillRect(0, railY, this.scale.width, 10);
    const pieces: Phaser.GameObjects.GameObject[] = [];
    pieces.push(this.keep(this.add.image(x0, y, T.key, 0).setScale(scale)));
    const winY = y - (T.frameHeight * scale) / 2 + T.windowY * scale;
    const cw = (T.frameWidth - 68) * scale;
    const ch = 72 * scale;
    cars.forEach((tok, k) => {
      const x = x0 + (k + 1) * carW;
      pieces.push(this.keep(this.add.image(x, y, T.key, 1 + (k % T.cars)).setScale(scale)));
      pieces.push(tok === null ? this.gap(x, winY, cw, ch) : this.card(x, winY, cw, ch, tok));
    });
    this.popIn(pieces);
  }

  /** Odd One Out: a shelf (or a hover platform) the cards stand on. */
  private drawShelf(n: number): void {
    const cx = this.scale.width / 2;
    const w = n * 190 + 60;
    const g = this.keep(this.add.graphics());
    g.fillStyle(this.colours.shelf, 1).fillRoundedRect(cx - w / 2, 448, w, 26, 10);
    g.lineStyle(4, INK, 1).strokeRoundedRect(cx - w / 2, 448, w, 26, 10);
    if (this.theme === 'cosmos') {
      // A hover platform: glowing beams instead of legs.
      for (const x of [cx - w / 2 + 60, cx + w / 2 - 60]) {
        g.fillStyle(this.colours.shelfLeg, 0.35).fillTriangle(x - 30, 520, x + 30, 520, x, 476);
      }
    } else {
      g.fillStyle(this.colours.shelfLeg, 1)
        .fillRect(cx - w / 2 + 40, 474, 24, 56)
        .fillRect(cx + w / 2 - 64, 474, 24, 56);
    }
  }

  /** Word Wand: A → B, "so", C → ?, with the look's wand or zapper. */
  private drawPair(from: TextToken, to: TextToken, next: TextToken): void {
    const y = 330;
    const w = 170;
    const h = 120;
    const xs = [220, 450, 790, 1020];
    const pieces: Phaser.GameObjects.GameObject[] = [
      this.card(xs[0], y, w, h, from),
      this.card(xs[1], y, w, h, to),
      this.card(xs[2], y, w, h, next),
    ];
    pieces.push(this.gap(xs[3], y, w, h));
    for (const ax of [(xs[0] + xs[1]) / 2, (xs[2] + xs[3]) / 2]) pieces.push(this.arrow(ax, y));
    pieces.push(this.say((xs[1] + xs[2]) / 2, y, 'so'));
    const C = this.art.changer;
    const changer = this.keep(this.add.image(640, 470, C.key, C.frame));
    changer.setScale(this.theme === 'critters' ? 0.75 : 0.6).setAngle(this.theme === 'critters' ? -60 : 0);
    this.tweens.add({ targets: changer, y: 455, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.popIn(pieces);
  }

  /** Number Machine: what went in and came out on the left, the machine, then this number → ? */
  private drawMachine(rows: readonly { input: TextToken; output: TextToken }[], next: TextToken): void {
    const pieces: Phaser.GameObjects.GameObject[] = [];
    const rowH = 84;
    const top = 340 - ((rows.length - 1) * rowH) / 2;
    rows.forEach((r, k) => {
      const y = top + k * rowH;
      pieces.push(this.card(150, y, 110, 70, r.input), this.arrow(250, y), this.card(350, y, 110, 70, r.output));
    });
    const M = this.art.machine;
    const machine = this.keep(this.add.image(640, 345, M.key, M.frame).setScale(1.05));
    this.tweens.add({ targets: machine, angle: { from: -2, to: 2 }, duration: 700, yoyo: true, repeat: -1 });
    pieces.push(this.card(900, 345, 120, 84, next), this.arrow(1005, 345), this.gap(1110, 345, 120, 84));
    this.popIn([machine, ...pieces]);
  }

  /** Missing Letter: the picture, and the word's letters with one gap. */
  private drawMissing(picture: number | null, letters: readonly (string | null)[]): void {
    const pieces: Phaser.GameObjects.GameObject[] = [];
    if (picture !== null) {
      pieces.push(this.keep(tokenCard(this, 270, 340, 230, 230, null)));
      pieces.push(this.keep(this.add.image(270, 340, PUZZLE_PICS_SHEET.key, picture).setDisplaySize(200, 200)));
    }
    // The letters fill what's left of the stage (all of it when there's no picture).
    const gapX = 14;
    const left = picture !== null ? 420 : 120;
    const right = 1180;
    const tile = Math.min(100, Math.floor((right - left) / letters.length) - gapX);
    const cx = (left + right) / 2;
    const x0 = cx - ((letters.length - 1) * (tile + gapX)) / 2;
    letters.forEach((l, k) => {
      const x = x0 + k * (tile + gapX);
      if (l === null) {
        const g = this.gap(x, 340, tile, tile + 16);
        this.letterGaps.push({ x, y: 340, w: tile, h: tile + 16, card: g });
        pieces.push(g);
      } else {
        pieces.push(this.card(x, 340, tile, tile + 16, textToken(l.toUpperCase())));
      }
    });
    this.popIn(pieces);
  }

  /** Word Snap: one half + the other ("?"), and the whole word when it's shown. */
  private drawSnap(left: string | null, right: string | null, whole: string | null): void {
    const y = 330;
    const w = 220;
    const h = 120;
    const xs = whole !== null ? [230, 540] : [430, 850];
    const pieces: Phaser.GameObjects.GameObject[] = [
      left === null ? this.gap(xs[0], y, w, h) : this.card(xs[0], y, w, h, textToken(left)),
      this.say((xs[0] + xs[1]) / 2, y, '+'),
      right === null ? this.gap(xs[1], y, w, h) : this.card(xs[1], y, w, h, textToken(right)),
    ];
    if (whole !== null) {
      pieces.push(this.say(720, y, '='), this.card(960, y, 300, h, textToken(whole)));
    }
    this.popIn(pieces);
  }

  /** Quick Count: the counters show on a mat for a moment, then hide; then the tray and the sand. */
  private drawFlash(spots: readonly { x: number; y: number }[]): void {
    const p = this.puzzles[this.index];
    const mat = { x: 640, y: 340, w: 640, h: 300 };
    const g = this.keep(this.add.graphics());
    g.fillStyle(this.colours.mat, 0.92).fillRoundedRect(mat.x - mat.w / 2, mat.y - mat.h / 2, mat.w, mat.h, 28);
    g.lineStyle(5, this.colours.matEdge, 1).strokeRoundedRect(mat.x - mat.w / 2, mat.y - mat.h / 2, mat.w, mat.h, 28);
    const frame = this.art.counters[Math.floor(Math.random() * this.art.counters.length)];
    const px = spots.length > 10 ? 58 : spots.length > 6 ? 66 : 78;
    const counters = spots.map((s) =>
      this.keep(
        this.add
          .image(
            mat.x - mat.w / 2 + 40 + s.x * (mat.w - 80),
            mat.y - mat.h / 2 + 30 + s.y * (mat.h - 60),
            THEME_COUNTERS_SHEET.key,
            frame,
          )
          .setDisplaySize(px, px),
      ),
    );
    this.popIn(counters);
    this.flash = { counters };
    this.prompt.setText('Look quick!');
    this.flashTimer = this.time.delayedCall(P.quickCount.flashMs[this.level], () => {
      this.tweens.add({ targets: counters, alpha: 0, duration: 180 });
      const q = this.keep(text(this, mat.x, mat.y, '?', 'title').setOrigin(0.5).setFontSize(150));
      q.setColor(this.theme === 'cosmos' ? '#f8f9fa' : '#3a2420');
      if (this.flash) this.flash.cover = q;
      this.tweens.add({ targets: q, scale: { from: 0.4, to: 1 }, duration: 260, ease: 'Back.Out' });
      this.prompt.setText(p.prompt);
      this.openTray(p);
    });
  }
}
