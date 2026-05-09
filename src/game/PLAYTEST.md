# Manual Playtest Checklist

Gameplay code in `src/game/` is verified by manual playtest, not Vitest.
Pure modules in `src/math/` and `src/services/` have automated tests; the
Phaser-coupled stuff lives here.

Run a fresh playtest before every gameplay-touching sprint closes. Each row
below is a simple yes/no question — fill in pass / fail / skipped (with a
note on why) and date it.

## Quick start

```bash
pnpm dev
```

Open the URL Vite prints (typically `http://localhost:5173`). Click through
to a round (Menu → Pick a Game → Pick Difficulty → Start).

---

## Round mechanics

| ✓ | Check |
|---|---|
|   | A full 20-question round on Add-to-10 / **Slow** completes without crashing or hanging |
|   | A full 20-question round on Add-to-10 / **Medium** completes |
|   | A full 20-question round on Add-to-10 / **Fast** completes |
|   | The hero auto-runs left↔right at the bottom and bounces at the safe-area edges |
|   | The hero "looks" the way it's running (front notch flips on direction change) |
|   | Aliens descend from the top one wave at a time (4 per question), each carrying an answer |
|   | The correct answer is always among the four choices |
|   | The other three choices are visibly different from the correct answer (no duplicate distractor on top of correct) |

## Firing

| ✓ | Check |
|---|---|
|   | Press **Space** → projectile fires upward from hero |
|   | Click anywhere on canvas → fires |
|   | Tap on a touch device → fires |
|   | Holding Space doesn't auto-fire faster than `config.hero.fireCooldownMs` |
|   | Mashing the click rapidly → only one projectile in flight at a time (cooldown enforced) |
|   | Projectile leaving the top of the canvas is destroyed cleanly (no leak after 20 unhit shots) |

## Hit / miss outcomes

| ✓ | Check |
|---|---|
|   | Hitting the **correct** alien → green explosion + brief hero flash + score increases |
|   | Other aliens fade out smoothly (not snap-disappear) before the next wave spawns |
|   | Hitting a **wrong** alien → red explosion AND remaining aliens visibly accelerate (descent speed jumps to `config.scoring.speed[speed].penaltyPxPerSec`) |
|   | After a wrong shot, you can still fire again at the right answer; correct hit awards HALF points (`afterWrongShotMultiplier`) |
|   | A second wrong shot does NOT keep accelerating the wave (penalty is one-shot per wave) |
|   | Aliens reaching the hero → death animation plays, no points awarded, next wave starts cleanly |

## Scoring

| ✓ | Check |
|---|---|
|   | `Score: <n>` updates in the HUD top bar after each correct answer |
|   | A "+N" popup floats up briefly above the score counter when scoring |
|   | Final score on GameOverScene matches the HUD's last value |
|   | 14 correct → 1 star · 17 correct → 2 stars · 19 correct → 3 stars (per `config.round.starThresholds`) |
|   | Less than 14 correct → "Round Done — Try Again?" headline (yellow), `passed: false` |
|   | 14 or more correct → "Round Complete!" headline (green), `passed: true` |

## High score

| ✓ | Check |
|---|---|
|   | First round on a (math, speed) combo → "★ New High Score! ★" badge appears on GameOverScene (any score > 0 qualifies) |
|   | Play another round on the same combo with a HIGHER score → badge appears |
|   | Play another round with a LOWER or equal score → badge does NOT appear |
|   | Play on a DIFFERENT (math, speed) combo → behaves as first-round-on-that-combo |
|   | Reload the page → high scores reset (sessionful by design) |

## Navigation in/out of GameScene

| ✓ | Check |
|---|---|
|   | Menu → GameSelect → Difficulty → Start → GameScene loads cleanly |
|   | GameOver → "Play Again" → GameScene starts a fresh round on the same difficulty |
|   | GameOver → "Change Difficulty" → DifficultyScene preserves nothing weird |
|   | GameOver → "Main Menu" → returns home; from there, a fresh round works |
|   | If you spam-click "Play Again" the round restarts cleanly (no stuck wave from the previous round) |

## Keyboard accessibility

| ✓ | Check |
|---|---|
|   | Tab on every menu scene cycles through buttons (skipping disabled ones) |
|   | Shift+Tab cycles backwards |
|   | Enter / Space activates the focused button |
|   | The blue keyboard-focus ring is visually distinct from the amber selected ring on the same button |
|   | Difficulty selection works keyboard-only end to end (Tab to a math, Enter, Tab to a speed, Enter, Tab to Start, Enter) |

## HUD and visuals

| ✓ | Check |
|---|---|
|   | Top bar shows `Score: <n>` (left), prompt `<a> + <b> = ?` (center), `Q: <i>/<total>` (right) |
|   | Prompt updates at the start of each new question |
|   | Q-counter increments correctly (1/20 → 2/20 → … → 20/20) |
|   | Attribution footer is visible along the bottom of every interactive scene (Menu, GameSelect, Difficulty, Game, GameOver) |
|   | Source-URL link in the footer opens in a new tab |

## Telemetry (open browser devtools console)

| ✓ | Check |
|---|---|
|   | `RoundStarted` event with `mathId` and `speed` props at the start |
|   | `QuestionStarted` event for each of the 20 questions |
|   | `QuestionEnded` events with `wasCorrect` and `usedWrongShot` |
|   | `RoundEnded` event at end with `roundScore`, `roundCorrectCount`, `passed` |
|   | `HighScoreSaved` event after the GameOverScene save settles |

## Performance

| ✓ | Check |
|---|---|
|   | Frame rate stays above ~50fps during normal play (Chrome DevTools FPS meter) |
|   | No console errors during a full round |
|   | Memory in DevTools doesn't grow noticeably across 5 back-to-back rounds (entities cleaned up) |

## Audio (sprint 0.5.2)

| ✓ | Check |
|---|---|
|   | Click Start on Menu, then start a round. Pressing **Space**, clicking the canvas, or tapping the canvas (touch) all produce a fire sound |
|   | Volume is moderate — putting headphones on and starting the game does NOT result in a blast of sound |
|   | Click the **mute icon** (top-right of HUD bar, just left of the Pause icon) — speaker shape gains a red diagonal slash, sound stops |
|   | Click mute again — slash disappears, sound returns |
|   | Mute icon shows hand cursor on hover; hover tints the background (matches the Pause icon affordance) |
|   | Mute persists across **page refresh** (mute → reload → still muted; visually the slash is on from first paint) |
|   | Mute persists across **round restart** (mute → finish or quit round → start new round → still muted) |
|   | Pause overlay still gates fire input — open the pause overlay and press Space; no sound plays (carryover from 0.5.1) |
|   | First-load behavior: open the app in a fresh tab, press fire on Menu — no sound (audio not initialized yet); click Start, then go through to the round, fire — sound plays. (This verifies the iOS Safari first-interaction guard works.) |
|   | Browser DevTools console shows no warnings about missing audio keys or playback errors during a normal round |

## Pause + Escape (sprint 0.5.1)

| ✓ | Check |
|---|---|
|   | Start a round, press **Esc** → pause overlay appears with "Paused" title, Resume + Quit-to-Menu buttons |
|   | While paused, **aliens stop descending** — they hold at their exact Y positions, no drift |
|   | While paused, the **question countdown / hero motion freezes** — no time pressure accrues |
|   | While paused, **fire input is dropped** — Space and clicks do not produce projectiles |
|   | Press **Esc** while paused → overlay closes, gameplay resumes from exactly where it left off (no snap) |
|   | Click the **Pause icon button** (top-right of HUD bar) → same pause flow as Esc |
|   | While paused, click **Resume** button → same as Esc-to-resume |
|   | While paused, click **Quit to Menu** → returns to MenuScene; the round score is NOT saved (Q: counter resets next round; no new high-score entry recorded for this combo) |
|   | Pause for ~30 seconds, then resume → round continues normally, no auto-fail / timeout penalty |
|   | Mash Esc + Pause-button repeatedly → only ONE pause overlay ever appears (no stacking) |
|   | After resume, wrong-shot speed penalty still works (try a wrong answer) |
|   | After resume, the question counter still increments correctly through to round end |
|   | Tab on PauseOverlay cycles Resume → Quit; Enter activates the focused button |
|   | Esc on **DifficultyScene** → returns to GameSelectScene |
|   | Esc on **GameSelectScene** → returns to MenuScene |
|   | Esc on **MenuScene** → no-op (top of stack) |
|   | Esc on **GameOverScene** → returns to MenuScene (matches the existing "Main Menu" button) |
|   | Navigate Menu → GameSelect → Difficulty → back via Esc 3+ times — no Esc handler accumulation (each scene's listener cleans up on shutdown) |
|   | Console shows `GamePaused` / `GameResumed` events with `mathId`, `speed`, `questionIndex` |
|   | After Quit-to-Menu, console shows `RoundAbandoned` with `mathId`, `speed`, `questionsCompleted` |

---

## Logging the run

```
Date: ____-__-__
Build: <commit SHA from BUILD_HASH or `git rev-parse --short HEAD`>
Browser / OS: ____
Device: ____  (desktop / phone / tablet)

Pass:    __ / ___
Fail:    __  (note items below)
Skipped: __  (note items below)

Notes:
- ...
```
