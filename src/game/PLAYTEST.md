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

Open the URL Vite prints (typically `http://localhost:5183`). Click through
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

## Settings (sprint 0.5.3)

| ✓ | Check |
|---|---|
|   | From MenuScene, click **Settings** → SettingsScene appears with three rows: **Sound effects**, **Background ambience**, **Music**. Each shows a label, `−` button, percent value, `+` button. Defaults on first load: sfx 70%, midground 40%, music 50%. |
|   | Click `+` on Sound effects → percent goes 70% → 80%; in next round, fire-1.mp3 plays louder |
|   | Click `−` on Sound effects repeatedly until 0% → `−` button enters disabled visual state at 0; fire is silent in next round |
|   | Click `+` repeatedly until 100% → `+` button enters disabled visual state at 100 |
|   | Set sfx back to 70%; mute via HUD icon → fire still silent (master mute overrides slider) |
|   | Unmute → fire returns at the slider value |
|   | Tab through all controls in Settings; visible blue focus ring on the focused button; Enter/Space activates |
|   | **Esc** on SettingsScene returns to caller (closes Settings, MenuScene reappears) |
|   | Click **Back** button → same as Esc |
|   | From MenuScene → Start a round → Esc to pause → click **Settings** on the pause overlay → SettingsScene appears LAYERED ON TOP of the pause overlay; gameplay stays paused |
|   | From paused Settings, click Back → SettingsScene closes, PauseOverlay reappears, gameplay still paused |
|   | From paused Settings, press Esc → same as Back |
|   | Volumes persist across **page refresh** (set sfx to 30%, reload, open Settings → still 30%) |
|   | Volumes persist across **round restart** (Game Over → Play Again → adjust mid-round → still applied next round) |

## Active gameplay loops (sprint 0.5.3)

| ✓ | Check |
|---|---|
|   | Start a round → background music (`loop-1.mp3`) plays from the moment the round begins |
|   | Same start → skittering loop (`skittering-1.mp3`) plays continuously while the hero moves |
|   | Hero death (let aliens reach the hero) → skittering stops; music continues |
|   | Next wave starts after death anim → skittering resumes |
|   | Pause via Esc or HUD button → BOTH loops freeze (no audio drift during pause) |
|   | Resume → both loops continue from where they froze |
|   | Quit to Menu from PauseOverlay → both loops stop cleanly (no music bleeding into MenuScene) |
|   | Round complete (20 questions answered) → both loops stop cleanly during transition to GameOverScene |
|   | Adjust music slider during gameplay (Esc → Settings → music − or +) → music volume changes IMMEDIATELY (no need to restart the round) |
|   | Adjust midground slider during gameplay → skittering volume changes immediately |
|   | Mute toggle during gameplay → both loops drop to silent; unmute restores them at their slider levels (no restart click) |
|   | Browser DevTools console: `BootScene PreloadedSfx` log shows `reason: '4'` in v0.5.3 / `'5'` in v0.5.4+ (the four/five preloaded keys: fire-1, fire-2, skittering-1, loop-1, button-click-1) |
|   | No "key missing" or "not initialized" warnings during a normal round play |

## Mobile + responsive (sprint 0.6)

This sprint adds the mobile playability layer: 16:9 letterboxed scaling, a portrait-rotate prompt for phones, and an on-screen FIRE button for touch. Run a sweep across multiple viewports + a real phone if possible.

### Story 5 — Viewport spot-check (Chrome DevTools device toolbar)

For each viewport: confirm no clipping of hero/aliens, no off-canvas text, fire button reachable with thumb in landscape, prompt readable, AttributionScene footer visible and not overlapping the fire button, no JS console errors.

| ✓ | Viewport | Resolution | Notes |
|---|---|---|---|
|   | iPhone SE landscape | 667×375 | Tightest mobile aspect; verify the portrait overlay does NOT show in landscape |
|   | iPhone 14 Pro landscape | 852×393 | Modern phone aspect; safe-area check matters here |
|   | iPad Mini landscape | 1024×768 | 4:3 tablet — letterboxing on left/right is expected |
|   | Pixel 7 landscape | 915×412 | Android comparison |
|   | 1280×720 desktop | exact design canvas — should fill perfectly with no letterboxing |
|   | 1920×1080 desktop | 16:9 — uniform 1.5× scale, full canvas |
|   | Ultra-wide 21:9 | 2560×1080 | Vertical letterboxing on top/bottom is expected |
|   | iPhone SE PORTRAIT | 375×667 | Rotate-overlay should appear ("Please rotate your device"); flipping back to landscape dismisses it cleanly |

### Story 6 — Performance sanity (Chrome DevTools Performance / CPU throttle)

| ✓ | Check |
|---|---|
|   | Frame rate stays above ~50 fps during a full Add-to-10 / Fast round on an unthrottled machine |
|   | With Chrome's CPU 4× slowdown active (proxies a mid-tier Android), frame rate stays above ~30 fps and gameplay remains playable (aliens still descend smoothly, fire isn't laggy) |
|   | No console warnings about object pooling, texture limits, or audio context state |
|   | Memory profile across a full 5-round session shows no obvious leak (heap settles after garbage collection between rounds) |

### Sprint-0.6 functional checks

| ✓ | Check |
|---|---|
|   | **Touch fire button visible**: on a touchscreen Chromebook / Surface / phone in landscape, a circular amber FIRE button is anchored bottom-right above the attribution footer with at least 8px clearance. Hit area is generous (a sloppy thumb tap registers). |
|   | **Touch fire button hidden on mouse-only desktop**: opening the page on a mouse-only laptop hides the button by default. If you simulate a touch event in DevTools (Sensors → Touch: Force enabled), the button appears for the rest of the session. |
|   | **Press visual**: pressing the FIRE button shrinks it slightly + bumps opacity to 100% on `pointerdown`; releasing restores normal. No tween lag. |
|   | **No double-fire**: tapping the fire button does NOT also trigger the canvas-wide tap-to-fire listener (cooldown wouldn't allow both anyway, but verify the button's own click is the only one that registers — telemetry should show one fire event per tap, not two). |
|   | **Tap-anywhere-on-canvas still fires**: tapping the empty space of the game canvas (not on the fire button) still triggers a shot — the carry-over from sprint 0.5 is preserved. |
|   | **No-fire on menu buttons**: clicking PlaceholderButtons in MenuScene / GameSelect / Difficulty / GameOver / Pause / Settings does NOT fire a shot. InputSystem only listens during GameScene. |
|   | **Portrait overlay on phone**: load the page on a real phone in portrait — the rotate prompt covers everything (above the splash, above the canvas). Rotating to landscape dismisses it within ~1 second. The animated phone-glyph icon visibly suggests the rotation motion. |
|   | **Orientation flip mid-round**: start a round on a phone in landscape, rotate to portrait — overlay appears (game keeps running underneath but isn't visible). Rotate back to landscape — game resumes visible play; canvas re-fits to the new viewport (no zero-size frame, no clipping). |
|   | **Letterboxing on off-ratio**: at iPad Mini 4:3 (1024×768), the canvas is centered horizontally with `#0b1020` bands on left + right. On an ultra-wide 21:9, bands appear on top + bottom. Bands match the in-game backdrop color so they read as intentional. |
|   | **AttributionScene footer always visible**: at every viewport, the four-line attribution footer is visible at the bottom of the canvas. The TouchFireButton sits above it, never overlapping. |
|   | **Desktop play unchanged**: on a 1920×1080 desktop, mouse + Space keyboard play feels identical to v0.5.5. No fire button shown (no touch). |

## Refactor pass + 10% speed bump (sprint 0.5.5)

This sprint is **internal-only refactor + a one-knob tuning change** — no new features. Run a quick visual + behavioral sweep to confirm nothing regressed.

| ✓ | Check |
|---|---|
|   | **Speed tuning history**: sprint 0.5.5 applied two +10% bumps (originally felt sluggish), sprint 0.6 playtest pulled back -15% (final pass for the blaster wasn't possible when the kid paused to think). Net cumulative effect is ~3% above the v0.5.4 baseline — effectively neutral. Current values in `src/core/config.ts`: slow 41 px/s, medium 62 px/s, fast 93 px/s descent. The game should feel like there's enough time to think + take a second pass on the blaster at every tier. |
|   | First-button-click in every owning scene plays SFX (regression check from 0.5.4 follow-up — re-verify after sprint 0.5.5's `setupScene` migration): Menu Start, GameSelect Alien-Shoot, Difficulty math tile, GameOver Play-Again all chirp on first click. |
|   | **Visual rhythm (Story D drift)** — MenuScene's three-button stack (Start, High Scores, Settings) looks intentional. Settings button is now narrower than Start + High Scores (200×56 vs 280×64) to read as the secondary action. PauseOverlay (Resume / Settings / Quit) shows the same primary/secondary hierarchy. GameOverScene's Play-Again button is wider (280) than Change-Difficulty + Main-Menu (200). If any of these look "wrong" rather than "intentional," flag for revisit — pre-refactor, all menu buttons were uniform width. |
|   | HUD Pause icon click → pause overlay, audible click. HUD Mute icon click → 🔊 ↔ 🔇 emoji flips immediately on click; click sound plays going UNMUTED → MUTED, silent going the other way (audio is muted at moment of activation; visual flip is the confirmation). |
|   | Settings volume sliders still work; live-update mid-round still works (slider drag while a loop is playing changes loudness instantly). |
|   | Browser DevTools Console — no warnings, no missing-key errors, no `AudioContext was prevented from starting automatically`, no React/Phaser dev-mode complaints. |
|   | Telemetry log stream — `<sceneKey> Started` and `<sceneKey> Completed` events fire for every scene transition. Note: `Completed` now fires on shutdown (not at end of `create()`) — this is a deliberate standardization in 0.5.5; if querying App Insights, expect `Completed` to arrive whenever the user actually leaves the scene, not immediately after Started. |
|   | DifficultyScene empty-state branch (only triggered if every math generator is stubbed — not reachable in practice today): if you can manually trigger it, the "No math types available yet" copy renders 28px bold amber (was 24px non-bold pre-refactor — minor cosmetic drift, intentional). |

## Click-to-start splash + button-click SFX (sprint 0.5.4)

| ✓ | Check |
|---|---|
|   | On page load, a splash overlay appears with the **mathBasher** title, "Math, but with aliens." subtitle, and a **Tap to play** button |
|   | The Phaser canvas is NOT visible behind the splash (or is covered by it — splash fills the viewport with `#0b1020`) |
|   | Console does NOT show `An AudioContext was prevented from starting automatically` warning |
|   | The Tap-to-play button is visibly large (≥ 56×56 effective click target on touch) and shows a hover state on mouse |
|   | Tab + Enter on the splash button activates it (autofocus puts focus on it on load) |
|   | Click → splash disappears, BootScene's brief blank-slate render appears (~250ms), then MenuScene loads |
|   | After dismissing splash, the canvas is fully interactive |
|   | **Button-click SFX**: clicking ANY PlaceholderButton (Start, High Scores, Settings, Back, Difficulty tiles, Speed tiles, Pause overlay buttons, Settings −/+/Back buttons, Game Over Play Again / Change Difficulty / Main Menu) plays the `button-click-1.mp3` sound |
|   | **First click in every scene plays SFX** (regression check from 0.5.4 follow-up): Menu Start → audible; first Alien Shoot tile click in GameSelect → audible; first math-tile click in Difficulty → audible; first Play Again click in Game Over → audible. The bug we are guarding against was the pointerdown SFX firing before the scene re-bound to the AudioManager and silently dropping. |
|   | Keyboard activation (Enter or Space when focused) on any button also plays the click sound |
|   | Disabled buttons (Coming-soon math tiles, the − button at 0% volume, the + button at 100%) do NOT play the click sound |
|   | HUD **Pause icon** click plays the click sound |
|   | HUD **Mute icon** click plays the click sound when going UNMUTED → MUTED (audible confirmation); going MUTED → UNMUTED is silent (mute is still in effect at the moment of activation; visual state change is the confirmation) |
|   | Volume of the click sound responds to the **Sound effects** slider in Settings |
|   | Master mute silences click sound |
|   | Console shows `SplashStarted` event when the splash button is clicked |
|   | Dev shortcut: opening the page with `?autostart` (e.g. `http://localhost:5183/?autostart`) skips the splash — game loads directly |

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
