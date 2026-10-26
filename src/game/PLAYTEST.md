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

For each viewport: confirm no clipping of hero/aliens, no off-canvas text, fire button reachable with thumb in landscape, prompt readable, attribution footer fully visible below the game (never truncated, never covering the fire button), no JS console errors.

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
|   | **Touch fire button visible**: on a touchscreen Chromebook / Surface / phone in landscape, a circular amber FIRE button is anchored bottom-right, fully inside the game canvas (the attribution footer is a separate strip below the canvas). Hit area is generous (a sloppy thumb tap registers). |
|   | **Touch fire button hidden on mouse-only desktop**: opening the page on a mouse-only laptop hides the button by default. If you simulate a touch event in DevTools (Sensors → Touch: Force enabled), the button appears for the rest of the session. |
|   | **Press visual**: pressing the FIRE button shrinks it slightly + bumps opacity to 100% on `pointerdown`; releasing restores normal. No tween lag. |
|   | **No double-fire**: tapping the fire button does NOT also trigger the canvas-wide tap-to-fire listener (cooldown wouldn't allow both anyway, but verify the button's own click is the only one that registers — telemetry should show one fire event per tap, not two). |
|   | **Tap-anywhere-on-canvas still fires**: tapping the empty space of the game canvas (not on the fire button) still triggers a shot — the carry-over from sprint 0.5 is preserved. |
|   | **No-fire on menu buttons**: clicking PlaceholderButtons in MenuScene / GameSelect / Difficulty / GameOver / Pause / Settings does NOT fire a shot. InputSystem only listens during GameScene. |
|   | **Portrait overlay on phone**: load the page on a real phone in portrait — the rotate prompt covers everything (above the splash, above the canvas). Rotating to landscape dismisses it within ~1 second. The animated phone-glyph icon visibly suggests the rotation motion. |
|   | **Orientation flip mid-round**: start a round on a phone in landscape, rotate to portrait — overlay appears (game keeps running underneath but isn't visible). Rotate back to landscape — game resumes visible play; canvas re-fits to the new viewport (no zero-size frame, no clipping). |
|   | **Letterboxing on off-ratio**: at iPad Mini 4:3 (1024×768), the canvas is centered horizontally with `#0b1020` bands on left + right. On an ultra-wide 21:9, bands appear on top + bottom. Bands match the in-game backdrop color so they read as intentional. |
|   | **Phone fullscreen**: on an Android phone, "Tap to play" switches the page to fullscreen (URL bar + status bar hidden) and the game grows to fill the height; the attribution footer is still visible at the bottom. On iPhone Safari nothing changes (no fullscreen support) and nothing breaks. On desktop it never goes fullscreen. The canvas is horizontally centered (equal side bars). After leaving fullscreen (back gesture), an amber "Full screen" button appears at the left of the footer; tapping it goes fullscreen again and the button disappears. The button never shows on desktop or iPhone Safari. |
|   | **Attribution footer always visible**: at every viewport the footer (product, copyright, license, Source link) sits in a strip directly BELOW the game canvas — visible on the splash too, never truncated (it wraps to two lines on narrow screens), and above the phone's URL bar whether the bar is shown or hidden. Nothing in the game (FIRE button, speeder, Back buttons) sits underneath it; tapping the lower edge of FIRE never opens the Source link. |
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

## Math-a-lotl (sprint 2.5.4)

Phone in landscape, then desktop.

- [ ] Game Select shows four tiles in a 2×2 grid; Math-a-lotl is bottom-right and opens the Difficulty screen with the underwater backdrop already showing.
- [ ] Difficulty reads **Easy / Medium / Hard** with "3 bubbles · 25s", "4 bubbles · 18s", "4 bubbles · 12s".
- [ ] Each wave's bubbles zip into view within about a second, then drift up at the difficulty's pace.
- [ ] The HUD countdown (⏱) shows under the problem; at zero "Out of time!" → the question is marked missed, no heart lost, next problem. A re-spawned wave (right bubble floated away) does not reset the countdown. Pause stops it.
- [ ] One axolotl per round; over several rounds you see all three colorways (pink, gold, lilac). No parallax stars over the water.
- [ ] The swim cycle (tail, gills, legs) plays while moving and slows when resting; the axolotl faces the way it swims and tilts its nose up / down.
- [ ] Q1 shows "👆 Tap a bubble!"; the hint disappears on the first tap.
- [ ] Tap the right bubble → the axolotl swims to it, pop sound + sparkle + happy face, next problem.
- [ ] Tap a wrong bubble → it wobble-pops, wrong sound, "Oops! Try again!", one Lives dot turns red, the problem stays. Solving it afterwards scores half points.
- [ ] The answer numbers are easy to read everywhere, including right under the surface (dark outline); fractions too.
- [ ] Tap a bubble high up, far from the axolotl → it waits just under the surface until she arrives (it does not float away mid-chase).
- [ ] Taps near the bottom edge never pick a bubble you can't see yet.
- [ ] Swimming PAST a wrong bubble on the way to the right one does not pop it.
- [ ] Let the right bubble float to the surface (without tapping it) → "Floated away! Try again!", no life lost, fresh bubbles for the same problem.
- [ ] Third wrong catch of the round → "Out of lives!" → Game Over.
- [ ] Let Q12 time out → "Out of time!" → Game Over, with the timeout sound playing once.
- [ ] Tap open water → the axolotl swims there and never leaves the water (not into the sky band, not below the floor).
- [ ] Keys 1–4 pick the visible bubbles left to right.
- [ ] Fractions (Add Fractions on Medium) fit inside the bubbles.
- [ ] Audio: music is quieter than the water ambience; a wrong catch plays an underwater "bloop" (one of three) a little louder than the right-catch pop. Mute and the volume sliders still work. Pause freezes the bubbles, the axolotl and the reef.
- [ ] Play Again replays Math-a-lotl (not another mode).

## Frog Splash (sprint 2.5.6)

Phone in landscape, then desktop.

- [ ] Game Select shows five tiles (third row centred: Frog Splash); the title clears the grid.
- [ ] Difficulty reads "2 lily pads · 25s", "3 lily pads · 18s", "4 lily pads · 12s" over a dimmed river backdrop.
- [ ] One frog per round; over several rounds you see green, blue and orange. It blinks while waiting.
- [ ] Q1 shows "👆 Tap the right lily pad!"; it goes away on the first hop.
- [ ] Rows drift in alternating directions; the active row shows numbers, the rows ahead are plain pads.
- [ ] Tap the right pad → crouch, leap along an arc (shadow on the water), land with a squash, "+points", the row stops, the camera follows up.
- [ ] Tap a wrong pad → it sinks, splash, "Splash! Try again!" (just "Splash!" on the last life), one Lives dot turns red; the frog pops back up on the last row (or the bank) and the SAME question returns with reshuffled pads and a fresh timer.
- [ ] Let the timer run out → the frog wobbles in place, "Out of time!", a life is lost, same question with fresh pads. On the last life "Out of time!" shows before "Out of lives!".
- [ ] Tap a pad the moment the frog pops back up after a splash → the frog stays fully visible through the hop and after.
- [ ] Third life lost → "Out of lives!" → Game Over (stars by rows crossed).
- [ ] Row 12 → the frog hops onto the far bank, its tongue catches the fly, a happy bounce, "You made it!" → Game Over with 3 stars.
- [ ] Rows wrap at the screen edge: a pad leaving one side is already coming in on the other. While split, its number shows once, whole, on the bigger half; tapping either half picks that pad, and the row slides it fully on screen before the frog lands.
- [ ] Eight pad looks mixed in each row (no look next to itself), slightly different sizes.
- [ ] Keys 1–4 pick the active row's pads left to right.
- [ ] Fractions fit on the pads; numbers are readable on every pad.
- [ ] Sounds: a hop on every leap (four variants), a ribbit on a right pad, a splash on a wrong one, a rib-bit slurp when the fly is caught. Music sits under the brook; the crickets are faint.
- [ ] Pause freezes the drift, the frog mid-hop, the timer and the fly.
- [ ] Play Again replays Frog Splash.

## Question mix + time per math type (sprint 2.5.7)

Any game mode — the math is shared.

- [ ] Difficulty screen: pick Add to 10, then Add Fractions — the time under each difficulty doubles (Asteroid Field labels them Slow / Medium / Fast; Space Escape shows its round timer as minutes and seconds from 2 min up — e.g. "3:00", "8:20", never rounded up; Alien Shoot shows no time).
- [ ] Fractions on Hard: visibly more time per question than before; Alien Shoot aliens fall more slowly on Multiply than on Add to 10.
- [ ] Add to 20, a full round: mostly answers 10–20, a mix of 8 + 7 and 13 + 5 kinds; at most one or two single-digit answers.
- [ ] Subtract within 20, a full round: answers all over 1–18; "− 10" and "= 10" rare; "− 0" / "x − x" almost never.
- [ ] Subtract within 10: few "− 0" or "x − x".
- [ ] Add / Subtract to 20: the wrong answers are near the right one; with a sum of 19 or 20 the right answer isn't always the biggest choice.

## Space Shooter (sprint 2.6)

Phone in landscape, then desktop.

- [ ] Game Select shows six tiles in three rows of two; Space Shooter is bottom right.
- [ ] Difficulty reads "3 ships · 25s", "4 ships · 18s", "5 ships · 12s" for Add to 10 (longer for harder math) over a dimmed cockpit backdrop.
- [ ] In game: the space view behind the window, the cockpit frame in front; the HUD readable over the cockpit top.
- [ ] Q1 shows "👆 Tap the ship with the right answer!" over the dashboard; it goes away on the first shot.
- [ ] Ships warp in (can't be shot until they're fully in), fly curvy paths, bounce off the window frame and each other, never go behind the cockpit frame — even a wide answer like "1 11/12" in a bottom corner stays whole.
- [ ] Every ship in a wave looks different; answers sit in the dark porthole. Fractions on Hard: mixed numbers ("1 11/12") sit on a dark display pill and read clearly.
- [ ] Tap the right ship → lasers from both bottom corners, explosion, "+points", the others warp away, next question.
- [ ] Tap a wrong ship → shield flash, "Shields up! Try again!", a Lives dot turns red, that ship warps away; the question stays. Tapping again right away does nothing until the shield flash ends (no second life lost).
- [ ] Let the timer run out → red bolts from the ships, cracks on the glass, red flash + shake, "Out of time! You got blasted!", a life lost, same question with fresh ships.
- [ ] Third life lost → "Out of lives!" → Game Over (stars by correct answers).
- [ ] Hard has 5 ships; keys 1–5 pick ships left to right.
- [ ] Taps on the cockpit around the window do nothing.
- [ ] Music plays (the new loop); lasers, hits, wrong and timeout sounds play.
- [ ] Pause freezes the ships, lasers and timer.
- [ ] Play Again replays Space Shooter.

## Fraction time + Change Game (sprint 2.6.1)

- [ ] Every timed game shows the same base times for Add to 10: 25s / 18s / 12s (Space Escape: "5:00 / 3:36 / 2:24 timer"). Alien Shoot shows no time.
- [ ] Difficulty screen with Add Fractions: times are 3× those (e.g. Frog Splash "2 lily pads · 75s / 54s / 36s").
- [ ] Easy + Add Fractions in Alien Shoot (aliens take ~48 s to fall) and Space Escape (15:00 run): does it feel calm or just slow / boring?
- [ ] Game Over (any game): Play Again on top; Change Difficulty · Change Game · Main Menu in a row below, clear of the "New High Score!" badge; keyboard Tab order is Play Again → Change Difficulty → Change Game → Main Menu.
- [ ] Change Game → Game Select; picking a game shows the same math type and difficulty still selected.

## Security headers (sprint 2.6.2)

Content-Security-Policy is new, so check it on real phones (dev site), not only desktop, before the release goes to production:
- [ ] iPhone Safari and an Android phone: the game loads, the title font is the game font (not a fallback), music and sound effects play after the first tap, fullscreen works.
- [ ] Desktop devtools console: no "Refused to load" / "Refused to connect" CSP errors from the game itself (one blocked inline script is expected: Cloudflare's injected bot-detection snippet, reported as an inline script refused by `script-src`).

## No-change check (sprints 2.6.3 + 2.6.4)

Code was moved and shared; nothing should look or sound different. Phone landscape, plus one tablet or desktop size, plus a hard reload. Compare with the production site (mathbasher.mykfam.com, still on the old code) at the same moments.

- [ ] **Frog Splash:**
  - The Q1 hint shows even though the camera starts scrolled, pulses, and goes on the first hop.
  - "Splash! Try again!" stays on screen on the far-left / far-right pads.
  - "Out of time!", "Out of lives!" and "You made it!" stay centred while the camera moves.
- [ ] **Math-a-lotl:**
  - The 240 × 64 hint sits below the waterline and stays up after an escaped bubble.
  - "Oops!" shows below a bubble near the surface and above one near the floor.
  - "Floated away!" holds, then fades without rising.
  - Banners hold as long as before.
  - A wrong catch costs one life; the last one ends the round; a timeout costs none.
  - The hint goes on the first tap; the right bubble after a wrong catch scores half.
- [ ] **Space Shooter:**
  - The long hint fits on a narrow phone above the dashboard with its darker backdrop.
  - "Out of time! You got blasted!" stays on one line.
  - "Shields up! Try again!" stays on screen over ships near the edges; the hint goes on the first tap.
- [ ] **Space Escape!:**
  - "Lost a life! Try again!", "Out of time!" and "Escaped Safe!" read clearly on the bright fire floor.
  - The first-life-lost hint shows once per tab.
  - A wrong pick still takes the −3s penalty, and the next correct pick scores half.
- [ ] **Asteroid Field:** all 8 rock images load (no missing-texture boxes), on a warm cache and a cold load. The aim hint and "Out of shots!" look the same. Settings → Asteroid Images still switches live.
- [ ] **All games:** the footer text and Source link are unchanged, and the fire button and touch areas haven't moved.

## Change Game in the pause menu (sprint 2.6.5)

- [ ] In each of the six games: Pause shows Resume, Settings, Change Game, Quit to Menu, all on screen (phone too).
- [ ] Change Game opens Game Select; pick another game and the math type and difficulty are the same as before.
- [ ] Quit to Menu still goes to the main menu. Music from the paused game stops in both cases.
- [ ] Keyboard: arrow / Tab through the four pause buttons, Enter on Change Game works; Esc still resumes.

## Penguin Slide + clearer mixed numbers (sprint 2.7)

Phone in landscape, then desktop.

- [ ] Game Select shows seven tiles: four on top, three below; Penguin Slide is bottom right. Keyboard order runs row by row.
- [ ] Difficulty reads "3 fish · 25s", "4 fish · 18s", "5 fish · 12s" for Add to 10 (longer for harder math) over a dimmed snowy hill; the text reads clearly.
- [ ] In game: a bright snowy hill, the igloo far away, one fish per lane, the penguin at the bottom in a lane ring. Q1 shows "👆 Tap the fish with the right answer!".
- [ ] The fish slide up toward the penguin as the timer runs; badges grow as they get closer and stay readable, fractions included. Fish colour never gives the answer away.
- [ ] Tap the right fish (or anywhere in its lane) → hop, gulp, sparkle, "+points", the other fish swim away, next question.
- [ ] Tap a wrong fish → it turns into a snowball, splat, the penguin spins, "Bonk! Try again!", a Lives dot turns red, same question with a fresh row. A quick second tap costs nothing.
- [ ] Let the timer run out → the penguin tumbles, "Out of time!", a life lost, same question with full time.
- [ ] Third life lost → "Out of lives!" → Game Over (not a pass).
- [ ] Answer all 12 → "Yummy!" on the last fish, the penguin slides to the igloo, "You made it!", Game Over.
- [ ] Keyboard: ← / → move the lane, Space grabs, 1–5 jump to a lane (4–5 do nothing on Easy); Space on Resume doesn't grab.
- [ ] Pause mid-row, mid-hop and mid-banner: everything freezes and resumes; Change Game keeps the math type and difficulty.
- [ ] Sounds: slides now and then and on lane changes, hops, four different gulps, three splats; none repeats back to back. Levels comfortable on headphones.
- [ ] All three penguins stand out on the snow.

**All games:**
- [ ] Add Fractions in each of the seven games: mixed numbers show a bigger whole number with a gap ("1 1/2", never "11/2"), on the answers and in the question. Long answers still fit their alien, rock, rung, bubble, pad, ship or fish.
- [ ] The score, question, timer and Lives labels, and the Game Over headline and score, have a dark outline; Penguin Slide's Game Over reads clearly on the snow.

## Bunny Garden (sprint 2.8)

Phone in landscape, then desktop.

- [ ] Game Select shows eight tiles, two rows of four; Bunny Garden is bottom right.
- [ ] Difficulty reads "3 holes · 25s", "4 holes · 18s", "5 holes · 12s" for Add to 10 (longer for harder math) over a dimmed garden; the text reads clearly.
- [ ] In game: the garden, a row of holes with a carrot in each and an answer sign above it, the bunny on the grass, the basket bottom left. Q1 shows "👆 Tap the carrot with the right answer!"; tapping the hint does nothing.
- [ ] The signs never move. The carrots sink slowly, faces still peeking, and their leaves shiver near the end; then they duck in.
- [ ] Tap the right carrot (or anywhere in its lane) → hop, pull, the carrot pops out and lands in the basket, "+points", next question.
- [ ] Tap a wrong hole → the carrot ducks, the mole peeks up and waves, the bunny's ears droop, "Oops! Try again!", a Lives dot turns red, same question with a fresh row.
- [ ] Let the carrots hide → "Out of time!", a life lost, same question with full time.
- [ ] Third life lost → "Out of lives!" → Game Over (not a pass).
- [ ] Twelve carrots → the bunny hops to the basket and cheers, "Basket full!", Game Over.
- [ ] Keyboard: ← / → hop between holes, Space pulls, 1–5 pull a hole (4–5 do nothing on Easy); Space on Resume doesn't pull.
- [ ] Pause mid-hop, mid-toss and mid-mole: everything freezes and resumes.
- [ ] Add Fractions on Hard: mixed numbers fit their signs at 5 holes.
- [ ] All three bunnies stand out (especially the white one on the light grass).

## Pick your challenge first (sprint 2.9.0)

Phone in landscape, then desktop.

- [ ] First Start after loading the page → "Pick your challenge!" with a Math tab and 11 challenges, each with "1x Points" … "4.5x Points!". Back (or Esc) → the Menu; Start opens the picker again.
- [ ] Pick a challenge → "Pick a game!" with "Challenge: … 🔄" at the top; focus starts on the first game, not the chip.
- [ ] The chip on Game Select → the picker → back to Game Select with the new challenge (the chip bounces).
- [ ] A game → "<Game>: how tough?" (Alien Shoot and Asteroid Field: "how fast?") with the chip, the game's own labels, and "Up to N points!" under each level. Space Escape also shows "12 floors per round".
- [ ] Add Fractions / Subtract Fractions: the levels add "Same bottoms", "Mixed numbers", "Different bottoms".
- [ ] The chip on Difficulty → the picker → back to Difficulty.
- [ ] Later in the visit, Menu → Start goes straight to Game Select. Reloading the page brings the picker back.
- [ ] Pause: Resume, then Settings · Change Challenge / Change Game · Quit to Menu, none overlapping "Paused".
- [ ] Pause → Change Challenge: the challenges open inside the card over the frozen game. Back, Esc or the same challenge → the pause buttons, the game still paused. A different challenge → this game's Difficulty with the new challenge (the round isn't scored).
- [ ] Game Over: Play Again, then Change Difficulty · Change Challenge / Change Game · Main Menu, clear of the stars and the "New High Score!" badge.
- [ ] Game Over → Change Challenge → the picker; a pick or Back → this game's Difficulty.
- [ ] All eight games still play every challenge as before; the scores are unchanged.

## My Scores (sprint 2.9.2)

Phone in landscape, then desktop.

- [ ] Menu shows Start · My Scores · Settings. My Scores with nothing saved: "No points yet today. Play a round!"; All-Time: "No scores yet. Play a round!".
- [ ] Play a round to Game Over, then another, quitting after a couple of right answers (try Quit to Menu, Change Game and Change Challenge). My Scores → Today: "Math: N points", the challenge row says "2 rounds, 1 ended early" and the points add up. The date shows under the total.
- [ ] The next round's top bar "This visit" includes the quit round's points.
- [ ] Leaving a round before answering anything adds no round.
- [ ] All-Time: the same rows plus earlier days, "Since <first day>", and the note about accounts above Back.
- [ ] Tap the Math row: it folds (▸) and opens again (▾); the choice stays while you go to the Menu and back.
- [ ] With more rows than fit: drag, mouse wheel and the arrow keys scroll only the list; the bar on the right moves. A drag that starts on the Math row scrolls without folding it. Taps above or below the list never fold a hidden row.
- [ ] Keyboard: Tab goes Today → All-Time → Math → Back (the Math row scrolls into view); Enter folds; Esc → Menu.
- [ ] Reload the page: My Scores still shows the points; "This visit" starts at 0.

## Finish Bonus and Perfect Round (sprint 2.10)

Phone in landscape, then desktop. Use Add to 10 · Easy (Finish +300, Perfect +300).

- [ ] Difficulty: "Up to 1,800 points!" on Easy (2,250 Medium, 2,700 Hard).
- [ ] Every game, a round played to the end with every answer right first try: the score counts up, then "Finish Bonus! +300" and "Perfect Round! +300" pop in (teal, each with a sound) and the score counts on. Stars and "New High Score!" come after, nothing overlapping.
- [ ] One miss or time-out (then right): Finish Bonus only.
- [ ] Alien Shoot / Asteroid Field with most answers wrong: "Round Done — Try Again?" with the Finish Bonus (owner's rule: reaching the end earns it). Check the pairing reads OK.
- [ ] Out of lives (Math-a-lotl, Space Shooter, Space Escape, Frog Splash, Penguin Slide, Bunny Garden) or Space Escape's timer: no bonus. Pause and Esc do nothing during "Out of lives!" and after the last answer.
- [ ] My Scores and the next round's "This visit" include the bonuses.

## Speed bonus (sprint 2.11)

Phone in landscape, then desktop. Add to 10 · Easy (25 s a question).

- [ ] Difficulty: "Up to 2,400 points!" on Easy.
- [ ] Every game: a right answer within about 4 s shows "+150" and "⚡⚡⚡ <cheer>" under it; within about 7½ s, "+130 ⚡⚡"; within about 11 s, "+110 ⚡"; after that, just "+100". The cheer changes each time and stays on screen near the edges.
- [ ] A right answer after a miss: the bonus on the halved points ("+75 ⚡⚡⚡").
- [ ] Math-a-lotl: the time only starts once a bubble is in view. Penguin Slide: from when the fish can be tapped. Space Escape: each floor timed on its own; a wrong pick's fall doesn't count.
- [ ] Game Over: "⚡ Speed Bonus! +N" pops in first, then Finish and Perfect Round, the score counting on; the row fits at Subtract Fractions · Hard. A slow perfect round still gets Perfect Round.

## Balance Scale (sprint 2.12)

Phone in landscape, then desktop.

- [ ] Game Select is a 3 × 3 grid with Balance Scale last; nothing overlaps the chip or Back.
- [ ] Difficulty: "3 / 4 / 5 weights · Ns" and "Up to N points!".
- [ ] The first sentence shows "👆 Tap the weight that makes both sides the same!" and the "?" bobs; the "?" side starts up.
- [ ] Right weight: it flies onto the "?", the beam swings level, the pillar smiles, the crowd cheers, "Balanced!", +points with ⚡; a stone fills (green ✓) and the duckling hops up. Next sentence: new animals, new scenery.
- [ ] Wrong weight: the scale tips the honest way, the pillar goes dizzy, the crowd says "Oh!", "Too big! Try a smaller one" (or smaller), a life lost; the weight hops back and the same sentence stays. Right after a miss: an amber stone.
- [ ] Easy never shows "17 = …"; Medium and Hard sometimes do. Try add, take away ("17 − ? = 12"), times, sharing ("? ÷ 4 = 6"), Mixed and both fraction challenges at every difficulty.
- [ ] Time out: "Out of time!", a life lost, same sentence. Out of lives: "Out of lives!" → Game Over.
- [ ] Twelve right: "All balanced!", the duckling at the flag, Game Over with the bonuses.
- [ ] Keys: 1–5 drop a weight; ← → move the blue ring, Space drops. Pause mid-swing and resume.
- [ ] The top bar has no progress dots or "Q: n/12" in this game, and shows whole points everywhere.

## Pair Pals (sprint 2.13)

Phone in landscape, then desktop.

- [ ] "Pick your challenge!": the Math and Puzzles tabs swap the buttons below in place. Puzzles shows Pair Pals and Pattern Train ("Coming soon": a tap wiggles it and says so).
- [ ] Pair Pals → Loading → "Pair Pals: pick your cards": five themes with a sample picture each, Easy / Medium / Hard ("6 pairs · 4 × 3"), the best line ("Your best: 9 turns · Can you do it in fewer?"). The picks are remembered after a reload. Back → the picker on Puzzles.
- [ ] The board: "Turns" and "Pairs" in the top bar, the theme's backdrop and a mascot on the left, "👆 Tap two cards to find a match!" until the first tap. Cards fit at every size (Hard 6 × 5 on a phone).
- [ ] First card: a flip and one of the tile-flip sounds. A match: both pop with a green ring that fades, they dim a little, sparkles, the mascot hops, a success sound. A miss: a tiny wiggle, a fail sound, both stay up about a second, then turn back; tapping any card during that turns them back at once.
- [ ] A face-up or matched card does nothing when tapped and costs no turn.
- [ ] The last pair: the cards wave, then "You did it!", "You found all N pairs in T turns!" and "Your first win!" / "New best!" / "Your best is B turns". Play Again deals new cards; Change Cards → setup; Menu.
- [ ] Pause (button or Esc): Resume · Settings · Change Cards · Quit to Menu; Esc resumes. Keys: arrows show and move a yellow ring, Space or Enter turns the card.
- [ ] Menu Start after Pair Pals opens its setup; after picking a math challenge, Game Select (with the space backdrop). Every math game, its Difficulty and Game Over unchanged.
- [ ] Each theme looks right (cute animals, desserts, dinosaurs, dragons, aliens), and Pair Pals' own music plays.

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
