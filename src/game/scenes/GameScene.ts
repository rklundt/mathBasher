// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';
import { config, type MathId, type SpeedKey } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { Settings } from '@/services/Settings';
import { ScoreCalculator } from '@/services/ScoreCalculator';
import { getGenerator } from '@/math/registry';
import type { Question } from '@/math/types';
import { Hero } from '@/game/entities/Hero';
import { Projectile } from '@/game/entities/Projectile';
import type { Alien } from '@/game/entities/Alien';
// `Alien` is used as a type-only import for handleHit's parameter.
import { WaveSystem } from '@/game/systems/WaveSystem';
import { HitSystem } from '@/game/systems/HitSystem';
import { InputSystem } from '@/game/systems/InputSystem';
import { getAudioManager } from '@/services/audioManagerFactory';
import { SfxKeys, MidgroundKeys, MusicKeys } from '@/core/audioKeys';

/**
 * The actual game. One round = `config.round.questionsPerRound` questions.
 * Each question = one wave of 4 aliens descending; the hero auto-runs along
 * the bottom; the player times Space / click / tap to fire upward.
 *
 * Per-question outcomes (from gameplay events to ScoreCalculator):
 *   - Hit the alien with the correct answer  -> wasCorrect: true
 *   - Hit a wrong alien                       -> applyWrongShotPenalty(),
 *                                                wave continues; player keeps
 *                                                shooting until they hit the
 *                                                right one OR aliens land
 *   - Aliens reach the hero                   -> wasCorrect: false (timeout)
 *
 * The wrong-shot penalty halves points awarded for the EVENTUAL correct
 * answer that question (per ScoreCalculator's `usedWrongShot` flag).
 *
 * Telemetry events emitted (matched by HudScene):
 *   - 'questionStarted' { question, index, total }
 *   - 'questionEnded'   { wasCorrect, score, correctCount }
 */
export class GameScene extends Phaser.Scene {
  static readonly key = SceneKeys.Game;

  // Configured at create()
  private mathId!: MathId;
  private speed!: SpeedKey;
  private hero!: Hero;
  private waveSystem!: WaveSystem;
  private inputSystem!: InputSystem;
  private scoreCalculator!: ScoreCalculator;

  private projectile: Projectile | null = null;
  private currentQuestion: Question | null = null;
  private questionIndex = 0;
  private transitioning = false;
  private paused = false;

  /**
   * Snapshot of the in-flight question, exposed so HudScene can sync up after
   * its own `create()` runs (Phaser launches parallel scenes asynchronously,
   * so HudScene's listener bind can race with the first `questionStarted`
   * emit). Null between rounds and after the last question.
   */
  getCurrentQuestionPayload(): { question: Question; index: number; total: number } | null {
    if (!this.currentQuestion) return null;
    return {
      question: this.currentQuestion,
      index: this.questionIndex,
      total: config.round.questionsPerRound,
    };
  }

  constructor() {
    super(GameScene.key);
  }

  create(): void {
    const { mathId, speed } = Settings.round;
    // Defensive defaults — DifficultyScene gates progress on isReady() so
    // these should always be set, but if a future flow lands here without
    // selections (e.g. dev hotload), pick reasonable fallbacks.
    this.mathId = mathId ?? 'add-to-10';
    this.speed = speed ?? 'medium';

    const props: TelemetryProps = { mathId: this.mathId, speed: this.speed };
    _th.logToAi('RoundStarted', SeverityLevel.Information, props);

    // Hud overlay (parallel scene), guarded against double-launch.
    if (!this.scene.isActive(SceneKeys.Hud)) {
      this.scene.launch(SceneKeys.Hud);
    }

    const { width, height } = this.scale;
    const padding = config.layout.safeAreaPaddingPx;
    const leftBound = padding + 24;
    const rightBound = width - padding - 24;
    const heroY = height - 80;
    const spawnY = 40;

    this.hero = new Hero(this, width / 2, heroY, leftBound, rightBound);

    const speedConfig = config.scoring.speed[this.speed];
    this.waveSystem = new WaveSystem({
      scene: this,
      lanes: config.layout.targetLanes,
      descentSpeedPxPerSec: speedConfig.descentPxPerSec,
      penaltyPxPerSec: speedConfig.penaltyPxPerSec,
      leftBound,
      rightBound,
      spawnY,
      heroY: heroY - 40, // contact line slightly above the hero's center
    });

    this.scoreCalculator = new ScoreCalculator(this.mathId, this.speed);
    this.questionIndex = 0;
    this.transitioning = false;
    this.paused = false;

    this.inputSystem = new InputSystem(this);
    this.inputSystem.onFire(() => this.handleFire());

    // Start the active-round loops: background music + hero movement
    // skittering. Both are tracked by AudioManager and respect their
    // per-kind volume sliders + master mute. They're stopped in
    // cleanup() and pause/resumed via the pause/resume contract.
    //
    // Re-bind the AudioManager to THIS scene before starting the loops.
    // The first init() happened in MenuScene.Start onClick (iOS Safari
    // first-gesture rule); MenuScene has long since shut down by the time
    // GameScene runs. Phaser's per-scene `sound` proxy is tied to its
    // owning scene's lifecycle — adding/playing sounds via a shut-down
    // scene's proxy creates Sounds whose internal scheduling/update
    // contract is owed to a dead scene. Symptoms include alternating
    // audible/silent playback on rapid one-shots and stuttering loops
    // (user playtest 2026-05-09). Re-binding here points the manager at
    // the currently-active scene whose update loop is alive.
    const audio = getAudioManager();
    audio.init(this);
    audio.playLoop(MusicKeys.Loop1, 'music');
    audio.playLoop(MidgroundKeys.Skittering1, 'midground');

    this.startNextQuestion();

    this.events.once('shutdown', () => {
      this.cleanup();
      _th.logToAi('GameScene Completed', SeverityLevel.Information);
    });
  }

  override update(_time: number, dt: number): void {
    if (this.transitioning) return;
    if (this.paused) return;
    this.hero.update(dt);

    // Wave step
    const outcome = this.waveSystem.update(dt);
    if (outcome === 'reached-hero') {
      this.handleTimeout();
      return;
    }

    // Projectile step + collision
    if (this.projectile) {
      const stillAlive = this.projectile.advance(dt);
      if (!stillAlive || this.projectile.topY() < 0) {
        this.projectile.kill();
        this.projectile = null;
      } else {
        const hit = HitSystem.findHit(this.projectile, this.waveSystem.liveAliens());
        if (hit) {
          this.projectile.kill();
          this.projectile = null;
          this.handleHit(hit);
        }
      }
    }
  }

  private handleFire(): void {
    if (this.transitioning) return;
    if (this.projectile) return; // one in flight at a time
    // Play SFX BEFORE spawning the projectile so the sound is sample-aligned
    // with the visual fire. Phaser caches the decoded buffer at preload, so
    // play() is effectively zero-latency. AudioManager respects the mute
    // toggle + per-kind volume slider; if init() hasn't fired yet (e.g. dev
    // hot reload skips MenuScene) play() is a silent no-op rather than a
    // crash. Kind is explicit ('sfx') for clarity even though it's the
    // default — makes the playback category obvious at the call site.
    getAudioManager().play(SfxKeys.Fire1, 'sfx');
    this.projectile = new Projectile(this, this.hero.x, this.hero.y - 40);
  }

  private handleHit(alien: Alien): void {
    const correct = this.waveSystem.isCorrectLane(alien.lane);
    if (correct) {
      this.transitioning = true;
      const usedWrongShot = this.waveSystem.hasUsedWrongShot();
      this.scoreCalculator.recordOutcome({ wasCorrect: true, usedWrongShot });
      this.hero.playHitAnim();
      alien.playExplodeAnim(true, () => {
        // Fade the rest of the wave smoothly so it doesn't snap-disappear.
        const survivors = this.waveSystem.liveAliens();
        let pendingFades = survivors.length;
        if (pendingFades === 0) {
          this.afterQuestion(true);
          return;
        }
        for (const s of survivors) {
          s.playFadeOut(() => {
            pendingFades -= 1;
            if (pendingFades === 0) this.afterQuestion(true);
          });
        }
      });
    } else {
      // Wrong shot: explode the wrong alien, accelerate the rest, wave continues.
      this.waveSystem.applyWrongShotPenalty();
      alien.playExplodeAnim(false, () => {
        // No state change beyond the alien being gone + speed boost applied.
      });
      _th.logToAi('WrongShot', SeverityLevel.Information, {
        questionIndex: String(this.questionIndex),
        mathId: this.mathId,
        speed: this.speed,
      });
    }
  }

  private handleTimeout(): void {
    this.transitioning = true;
    this.scoreCalculator.recordOutcome({
      wasCorrect: false,
      usedWrongShot: this.waveSystem.hasUsedWrongShot(),
    });
    // Stop the skittering loop while the hero dies — the movement sound
    // shouldn't continue when the box is incapacitated. afterQuestion
    // restarts it before the next wave begins. Music keeps playing
    // through the death anim (the round isn't over).
    getAudioManager().stopLoop(MidgroundKeys.Skittering1);
    this.hero.playDeathAnim(() => {
      this.afterQuestion(false);
    });
  }

  private afterQuestion(wasCorrect: boolean): void {
    const props: TelemetryProps = {
      questionIndex: String(this.questionIndex),
      wasCorrect: String(wasCorrect),
      usedWrongShot: String(this.waveSystem.hasUsedWrongShot()),
      mathId: this.mathId,
      speed: this.speed,
    };
    _th.logToAi('QuestionEnded', SeverityLevel.Information, props);
    this.events.emit('questionEnded', {
      wasCorrect,
      score: this.scoreCalculator.score,
      correctCount: this.scoreCalculator.correctCount,
    });

    this.waveSystem.clearWave(true);
    this.questionIndex += 1;
    this.transitioning = false;
    // Restart the hero skittering loop in case it was stopped during
    // the death anim. playLoop is a no-op if the loop is already
    // active (correct hits never stop it), so this is safe to call
    // unconditionally on every wave transition.
    getAudioManager().playLoop(MidgroundKeys.Skittering1, 'midground');
    this.startNextQuestion();
  }

  private startNextQuestion(): void {
    if (this.questionIndex >= config.round.questionsPerRound) {
      this.endRound();
      return;
    }
    const generator = getGenerator(this.mathId);
    this.currentQuestion = generator.generate();
    this.waveSystem.spawnWave(this.currentQuestion);

    _th.logToAi('QuestionStarted', SeverityLevel.Information, {
      questionIndex: String(this.questionIndex),
      mathId: this.mathId,
      speed: this.speed,
    });
    this.events.emit('questionStarted', {
      question: this.currentQuestion,
      index: this.questionIndex,
      total: config.round.questionsPerRound,
    });
  }

  private endRound(): void {
    const props: TelemetryProps = {
      mathId: this.mathId,
      speed: this.speed,
      roundScore: String(this.scoreCalculator.score),
      roundCorrectCount: String(this.scoreCalculator.correctCount),
      passed: String(this.scoreCalculator.passed),
    };
    _th.logToAi('RoundEnded', SeverityLevel.Information, props);

    this.scene.stop(SceneKeys.Hud);
    this.scene.start(SceneKeys.GameOver, {
      score: this.scoreCalculator.score,
      correctCount: this.scoreCalculator.correctCount,
      passed: this.scoreCalculator.passed,
      stars: this.scoreCalculator.stars,
      mathId: this.mathId,
      speed: this.speed,
    });
  }

  private cleanup(): void {
    this.projectile?.kill();
    this.projectile = null;
    this.waveSystem?.clearWave(true);
    this.inputSystem?.destroy();
    // Stop both active loops cleanly. stopLoop is idempotent so calling
    // on a loop that's already stopped (e.g. skittering after a death
    // anim that didn't restart before round end) is a safe no-op.
    const audio = getAudioManager();
    audio.stopLoop(MusicKeys.Loop1);
    audio.stopLoop(MidgroundKeys.Skittering1);
    if (this.scene.isActive(SceneKeys.Hud)) {
      this.scene.stop(SceneKeys.Hud);
    }
    if (this.scene.isActive(SceneKeys.PauseOverlay)) {
      this.scene.stop(SceneKeys.PauseOverlay);
    }
    if (this.scene.isActive(SceneKeys.Settings)) {
      this.scene.stop(SceneKeys.Settings);
    }
  }

  // ----- Pause / resume / quit (sprint 0.5.1) ------------------------------

  isPaused(): boolean {
    return this.paused;
  }

  /** Questions COMPLETED so far (i.e. answered or timed out). Used by RoundAbandoned. */
  getQuestionsCompleted(): number {
    return this.questionIndex;
  }

  /**
   * Freeze the round. Stops alien descent (WaveSystem.pause), suppresses fire
   * input (InputSystem.setPaused), pauses HudScene's timers/animations
   * (scene.pause), and pauses every active tween scoped to this scene
   * (tweens.pauseAll). Pause is silent — score and round state are preserved
   * exactly. No auto-fail timeout: this is not a stealth difficulty mechanic.
   *
   * Idempotent: a second pause() call is a no-op.
   */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.waveSystem?.pause();
    this.inputSystem?.setPaused(true);
    this.tweens.pauseAll();
    // Pause every active audio loop (gameplay music + hero skittering).
    // pauseAllLoops uses Phaser's Sound.pause under the hood so the loops
    // freeze in place — resume picks up at the same playback position.
    getAudioManager().pauseAllLoops();
    if (this.scene.isActive(SceneKeys.Hud)) {
      this.scene.pause(SceneKeys.Hud);
    }
    _th.logToAi('GamePaused', SeverityLevel.Information, {
      mathId: this.mathId,
      speed: this.speed,
      questionIndex: String(this.questionIndex),
    });
  }

  /** Reverse `pause()`. Idempotent. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.waveSystem?.resume();
    // Resume the loops we paused — symmetric with pause().
    getAudioManager().resumeAllLoops();
    this.inputSystem?.setPaused(false);
    this.tweens.resumeAll();
    if (this.scene.isPaused(SceneKeys.Hud)) {
      this.scene.resume(SceneKeys.Hud);
    }
    _th.logToAi('GameResumed', SeverityLevel.Information, {
      mathId: this.mathId,
      speed: this.speed,
      questionIndex: String(this.questionIndex),
    });
  }

  /**
   * Abandon the round and return to the title screen. NO score is saved
   * (per the sprint spec — abandonment is distinct from a completed round
   * and `RoundAbandoned` telemetry surfaces this for analysis).
   *
   * Cleanup is the same as scene shutdown — `cleanup()` runs via the
   * shutdown event when MenuScene takes over.
   */
  quitToMenu(): void {
    _th.logToAi('RoundAbandoned', SeverityLevel.Information, {
      mathId: this.mathId,
      speed: this.speed,
      questionsCompleted: String(this.questionIndex),
    });
    // Resume tweens before exit so any cleanup tweens GameScene's children
    // queue up don't sit frozen on the next round.
    this.tweens.resumeAll();
    this.scene.start(SceneKeys.Menu);
  }
}
