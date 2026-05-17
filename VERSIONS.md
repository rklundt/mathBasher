# Versions

mathBasher uses **sprint id as version**: every closed sprint produces a release whose version equals its sprint id.

| Sprint | npm version | Notes |
| --- | --- | --- |
| `0.1` | `0.1.0` | Foundation scaffold |
| `0.2` | `0.2.0` | Math engine |
| ... | ... | ... |
| `0.7` | `0.7.0` | Foundation complete = MVP candidate |
| (cut MVP) | `1.0.0` | First publicly-tagged release after 0.7 closes (optional ceremonial bump) |
| `1.1` | `1.1.0` | First Phase 1 sprint (e.g. Add to 20) |
| `1.2` | `1.2.0` | ... |

Patch level (third digit) is reserved for hotfixes within a closed sprint. For example, a CSS regression fix shipping after `0.4.0` closes but before `0.5.0` opens is `0.4.1`.

## Conventions

- `package.json#version` is bumped to match the sprint id when a sprint Closes
- A new entry is prepended to the changelog below in the same commit
- Both updates land as part of the sprint-close workflow (not the human's job to remember by hand)
- Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) loosely — categories used as needed

## Changelog

<!-- New entries go ABOVE this comment, newest first. -->

## [Unreleased]

- **Sprint 2.2 next** — Number Climb (climbing platformer with answer rungs). Inherits the `RoundController` + `GameSceneContract` pattern established in 2.1 so the third game mode lands cleanly on top of the shared lifecycle.
- **Then Phase 3** — backend + accounts (Express API for high scores, ApiScoreStore, OAuth, Azure deployment via Bicep).

## [2.1.0] - 2026-05-17 — Asteroid Field game mode + image-variant rocks + Settings tabs

Second game mode ships. "Pick a Game" tile now lights up; picking Asteroid Field + a math type + a speed launches a free-aim, free-position variant: 4 asteroids drift in 2D (straight / bounce / elliptical-orbit physics randomly per question), the hero sits centered and rotates to aim, the player fires in the facing direction, and a per-question countdown enforces time pressure (25s/18s/12s for Slow/Medium/Fast). All 9 Phase 1 math types work in the new mode unchanged.

### Architecture
- **`RoundController` (composition helper)** extracted from `GameScene` — owns question loop, anti-repeat sliding window, score, round-state transitions. Phaser-free + unit-tested (9 tests). Both `GameScene` (Alien Shoot) and the new `AsteroidFieldScene` consume it.
- **`GameSceneContract` interface** keeps `HudScene` ignorant of which mode is running; HUD events route through the contract.
- **`Settings.GameId` union** widened to `'alien-shoot' | 'asteroid-field'`. `GameOverScene` Play Again now routes back to the source game (was hardcoded to Alien Shoot — Play Again from an asteroid round would have bounced to the wrong mode).
- **`orbitMath.ts` pure helpers** (`computeOrbitParams`, `pointOnEllipse`) — 10 isolated unit tests covering elliptical-orbit geometry that was re-tuned three times during playtest.

### Gameplay
- Aim controls: mouse position on desktop, drag-left + tap-right + on-screen FIRE button on touch, arrow-rotate + Space on keyboard.
- Wrong-shot penalty: half points on that question + 3-second countdown deduction + visible "-3s" floater above the hit asteroid (so the time penalty reads as a discrete event rather than a silent countdown jump).
- Timeout fail: per-question countdown reaching 0 plays new `timeout-fail-1.mp3` SFX + red flash + camera shake.
- First-round hint banner ("Drag to aim • Tap or press FIRE to shoot") shows once per session at the top of the playfield, autofades after 4s.

### Visuals
- **3 Midjourney-generated hero ships** for Asteroid Field (`asteroid-hero-1/2/3.png`) — round-robin per round. Cockpit dot + engine vent trail overlays preserved on top of the sprite.
- **8 Midjourney-generated asteroid rocks** (`asteroid-1.png` through `asteroid-8.png`) — uniform-random pick per asteroid spawned. Real-time in-place visual swap when toggling Settings → Game → Asteroid Images.
- **Procedural polygon fallback** preserved as the rollback path (toggle defaults to ON; user can switch back live).
- **Vertical tabbed Settings UI** (Sound / Game). Game tab only appears when the current game has at least one game-specific setting (Asteroid Field today).
- **New `ToggleSwitch` UI component** — pill-shaped track with sliding thumb, WCAG-compliant contrast, implements `Focusable` so it slots into KeyboardNavigator.

### Audio
- `timeout-fail-1.mp3` SFX added (ElevenLabs-generated, processed through `pnpm audio:encode` at SFX profile).

### Telemetry
- All new events carry `gameId: 'asteroid-field'` alongside the existing `mathId` + `speed` props. App Insights can now break round-completion by game mode.

### Configuration
- New `config.asteroidField.{speed, asteroidsPerWave, minSpawnDistancePx, asteroidRadiusPx, asteroidScaleMin/Max, enabledPhysicsModes, projectileSpeedPxPerSec, wrongShotCountdownPenaltySec, heroRotationRadPerSec, visual, hero, projectile}` block.
- New `config.layout.hudBarHeightPx` consumed by both HudScene + AsteroidFieldScene (single source of truth for the HUD ribbon height).

### Tests
- 277 tests passing across 26 files (was 267 across 25). 10 new tests in `orbitMath.test.ts`; 9 in `RoundController.test.ts`; 9 in `AsteroidHitSystem.test.ts`.

### No breaking changes
- Alien Shoot behaves identically to v0.7.5 (same score, same events, same timing). Existing localStorage settings + score store entries preserved. No migration needed.

## [0.5.3] - 2026-05-10 — Audio content batch + Settings screen + first loops wired

A round actually feels like a game now. Background music + the hero's "skittering" movement loop play under the action; pressing fire still produces a sample-aligned SFX; a Settings screen exposes per-kind volume controls reachable from both the title screen and the in-round pause overlay; and 5 new audio assets ship across all three audio kinds (sfx / midground / music). The encoder + AudioManager + SettingsScene + GameScene wire-ups all pull together for a coherent first audio experience.

### Added — Audio content + encoder
- **Encoder gains a third `midground` kind** for atmospheric loops — 96 kbps mono at -22 LUFS (6 dB quieter than sfx so it sits underneath), silence-trim OFF by default to preserve loop boundaries (trimming a loop file can chop into a non-zero-crossing sample and click at the loop boundary). New `--trim` CLI flag complements the existing `--no-trim` for explicit override of per-kind defaults. The `--kind` validator now accepts `sfx | midground | music` and rejects any other value.
- **5 new shipped MP3s** in three new folders:
  - sfx: `bloop-1.mp3` (9.5 KB, available but unwired this sprint)
  - midground: `skittering-1.mp3` (35.5 KB, wired) + `skittering-2.mp3` (47.4 KB, available)
  - music: `loop-1.mp3` (587 KB, wired) + `loop-2.mp3` (587 KB, available)
- All produced via the established `pnpm audio:encode` pipeline. ElevenLabs source, covered by the existing `Generated assets / Game Audio` CREDITS entry — no new CREDITS rows needed since the generator is unchanged.

### Added — AudioManager per-kind volumes + loop API
- **`AudioKind = 'sfx' | 'midground' | 'music'`** type union plus exported `AUDIO_KINDS` (slider order) and `DEFAULT_VOLUMES` map (sfx 70 / midground 40 / music 50).
- **Per-kind volume API**: `getVolume(kind)` / `setVolume(kind, percent)` with clamping, persistence to localStorage (one key per kind), and defensive fallback for corrupted/non-numeric/out-of-range values.
- **Loop API**: `playLoop(key, kind): LoopHandle` / `stopLoop(handle)` / `pauseAllLoops()` / `resumeAllLoops()`. `LoopHandle = string` (the asset key). `Map<key, {kind, sound}>` enforces one-loop-per-key naturally.
- **Live volume reactivity**: `onVolumeChanged(kind, percent)` hook walks every active loop OF THAT KIND and applies the new effective volume. The kid moving a slider mid-round hears the change immediately, no restart click.
- **Master mute**: when muted, `effectiveVolume01(kind)` returns 0 for every kind; loops keep PLAYING at 0 volume (no jarring stop+restart on mute). Sliders preserve their pre-mute values.

### Added — SettingsScene + entry points
- **`src/game/scenes/SettingsScene.ts`** — three stepped `−`/`+` volume controls per kind (10% increments). Reads `audio.getVolume(kind)` every render — no local mirror that could drift. Boundaries (0% / 100%) disable the matching button via PlaceholderButton's existing disabled state. Tab + Enter navigation (no Space activation; see HudScene note below). Esc closes via `wireEscBack`.
- **MenuScene Settings button** — launches SettingsScene parallel; Menu remains active underneath; `onBack` closes the scene.
- **PauseOverlay Settings button** — same pattern; SettingsScene stacks on top of PauseOverlay; gameplay stays paused throughout.

### Added — gameplay loop wire-ups
- **`loop-1.mp3` as gameplay background music** — `audio.playLoop(MusicKeys.Loop1, 'music')` in `GameScene.create()`; `audio.stopLoop(MusicKeys.Loop1)` in cleanup. Volume tracks the music slider live.
- **`skittering-1.mp3` as the hero's continuous movement loop** — starts in `create()`, stops during the death animation (`handleTimeout`), restarts in `afterQuestion` (no-op if already running). Volume tracks the midground slider live.
- **GameScene.pause/resume extended** to call `audio.pauseAllLoops()` / `audio.resumeAllLoops()` — both loops freeze in place during the pause overlay, resume cleanly on Esc-to-resume.
- **GameScene.cleanup also stops SettingsScene** if active (e.g. quit-to-menu while Settings was open from PauseOverlay).

### Added — audioKeys.ts taxonomy
- Three flat const objects with parallel naming: `SfxKeys`, `MidgroundKeys`, `MusicKeys` (plus type-level `SfxKey`, `MidgroundKey`, `MusicKey` and unified `AudioKey`). Three matching path helpers: `sfxPath`, `midgroundPath`, `musicPath`. Mirrors the `sceneKeys.ts` convention.

### Added — tests
- 24 new pure-TS tests in `AudioManager.test.ts` covering: per-kind defaults, persistence, clamping, corrupted-storage fallback, master mute interaction, hook firing, loop API contract (handle stability, idempotent stop, no-throws on empty manager), `AUDIO_KINDS` slider order, all defaults ≤ 80 ("never blast-loud" rule).
- After in-flight policy change (mute is no longer persisted), tests now codify the load-bearing rule "STARTS UNMUTED EVEN IF STORAGE HAS A LEFTOVER `'true'` VALUE".
- Test count: 70 → 93.

### Fixed — real bugs caught during the sprint
- **Space key was double-handled**. HudScene runs in parallel with GameScene during a round; both have keyboard listeners. `GameScene.InputSystem` listened for Space → fire; `HudScene.KeyboardNavigator` listened for Space → activate the focused control (the Mute icon, the first tab stop). Phaser dispatched the same Space keydown to both scenes, so every fire press also toggled mute multiple times (key auto-repeat amplified to 4-6 toggles). Audible alternating fire + flickering loops. Diagnostic logging on the AudioManager confirmed the root cause; fix added an `activateOnSpace` flag to `KeyboardNavigator` (default true; HudScene opts out), keeping Tab + Enter for WCAG 2.1.1 keyboard accessibility.
- **Encoder filter ORDER was wrong for quiet inputs** — the chain was `trim → limiter → loudnorm`. With a quiet source (mean -39 dB), the limiter's -3.1 dB cap was a no-op (peaks already below it) and loudnorm's 23 dB boost pushed peaks past the -1.5 dBTP ceiling unchecked. Reordered to `trim → loudnorm → limiter` (with `level=disabled` from sprint 0.5.2 still set) so the limiter is the FINAL brick-wall safety net catching whatever loudnorm overshoots.

### Changed — UX policy
- **Mute is now session-scoped, not persisted across page reloads**. Per user direction after a previous bug accidentally persisted muted=true and made the next session mysteriously silent: "do not mute by default. period." Volumes still persist (those are kid preferences); mute resets to OFF on every page refresh. The constructor scrubs any leftover stored mute value as a one-time migration. Mute toggle still works WITHIN a session.
- **HUD mute icon switched to Unicode emoji** — the composed-from-rectangles speaker glyph didn't read as a speaker. Replaced with `🔊` (unmuted) / `🔇` (muted) Unicode emoji rendered as a Phaser Text. Universally recognized; OS provides the rendering.
- **SettingsScene label "Background ambience" → "Background sounds"** — plainer English for younger readers.

### Notes
- All six review agents passed at wrap-up. Two should-fix items folded in (PauseOverlay Esc routing guard; AudioManager naming consistency). Five nice-to-haves applied (rename `AudioKeys` → `SfxKeys`, BootScene preload count derived from list, SettingsScene warns on missing onBack, kid-friendlier label, future-account-prep storage comment).
- Test count: 70 → 93. Bundle stays at ~1.5 MB JS (audio is loaded async by Phaser, not bundled).
- New telemetry events: `AudioManager.setVolume`, `MenuScene.SettingsOpened`, `PauseOverlay.SettingsOpened`, `SettingsScene Started`/`Completed`. Two new reserved property names in telemetry-core: none added (sprint reused `from` and `reason`).
- `button-click-1.mp3` was processed via the audio pipeline during the sprint window but kept untracked — sprint 0.5.4 picks it up to wire to button activations across the project.

## [0.5.2] - 2026-05-09 — First audio (fire SFX + audio infrastructure)

mathBasher's first sound. `fire-1.mp3` plays on every shot (Space, mouse, touch — all converge through InputSystem). A mute toggle on the HUD silences the game in one click and persists across rounds and page refreshes via localStorage. Default volume is moderate (0.6, never 100% — kid-safe by policy: a kid putting on headphones and starting the game must not be blasted). iOS Safari's WebAudio first-gesture requirement is handled by binding the AudioManager to a scene inside MenuScene's first Start click rather than at boot. The sprint also establishes the audio infrastructure pattern (pure facade in `/services/`, Phaser-coupled implementation in `/game/services/`, factory singleton, asset-key constants module mirroring `sceneKeys.ts`) so later audio work — wrong-shot SFX, music, etc. — drops in cleanly.

### Added
- **`src/services/AudioManager.ts`** — pure-TS audio facade. Mute persistence to localStorage with a pluggable storage backend (tests pass an in-memory mock). `DEFAULT_VOLUME = 0.6` enforced at the `play()` callsite — callers cannot override.
- **`src/game/services/PhaserAudioManager.ts`** — extends the facade. Holds a scene reference, plays loaded sounds via `scene.sound.play`. Missing keys log Warning and return silently — fire loop must NOT crash on asset miss.
- **`src/services/audioManagerFactory.ts`** — memoized singleton. Mirrors `scoreStoreFactory`. Returns the concrete `PhaserAudioManager` while exposing the pure facade type so callers can't reach Phaser specifics.
- **`src/core/audioKeys.ts`** — typed string-key registry for every loadable audio asset, mirrors `sceneKeys.ts`. `sfxPath()` helper builds `/assets/audio/sfx/<key>.mp3` URLs.
- **BootScene preload** — loads `fire-1` and `fire-2` into Phaser's audio cache (`fire-2` reserved for a future alt-fire feature).
- **MenuScene first-click init** — calls `getAudioManager().init(this)` inside the Start button's `onClick` so WebAudioContext is created inside a user-gesture handler (iOS Safari requirement).
- **GameScene fire wire-up** — `handleFire()` plays `Fire1` BEFORE spawning the projectile so audio is sample-aligned with the visual fire.
- **HudScene mute toggle** — speaker icon (with red diagonal slash + 60% alpha dim when muted) anchored just left of the existing Pause icon. 44×44 hit area (Apple HIG min). Visually distinct from Pause: warm-amber-tinted background (vs Pause's pure slate), 24px gap. Pure Phaser shapes, no image asset required.
- **HUD icons keyboard-accessible** (WCAG 2.1.1) — Tab/Shift+Tab cycles Mute → Pause → Mute, Enter/Space activates the focused icon, blue 3px focus ring matches PlaceholderButton's focus convention. `KeyboardNavigator` widened to accept any `Focusable` instead of the concrete `PlaceholderButton` type.

### Tests (56 → 70, +14)
- **AudioManager**: mute persistence to/from storage, idempotent `setMuted`, `play()` on missing key is a silent no-op, `DEFAULT_VOLUME` ≤ 0.7 (codifies the "never blast-loud" anti-pattern rule)
- **audioManagerFactory**: same-instance contract, `getAudioManager` alias matches `createAudioManager`, `_resetForTests` returns a fresh instance for test isolation

Pure-TS tests with no phaser import (per the project's test-layer rule).

### Tooling fixes (in-sprint)
- **Encoder pipeline filter ORDER** (`scripts/audio/encode.mjs`) — fixed a real bug discovered while running the audio-pipeline skill on a quiet input. The chain was `trim → limiter → loudnorm`; for very quiet inputs (mean -39 dB), loudnorm's 23 dB boost pushed peaks past the -1.5 dBTP ceiling unchecked. Reordered to `trim → loudnorm → limiter` (with `level=disabled` from v0.5.1 still set) — limiter is now the FINAL brick-wall safety net.
- **Probe metadata-leak detection** (`scripts/audio/probe.mjs`, prior PR) — surfaces any `Metadata:` block in the output so future leaks get caught at verification, not after-the-fact.

### Notes
- All six review agents passed. Two should-fix items folded in at wrap-up (HUD icon keyboard accessibility + visual distinction between Mute and Pause).
- Real bug caught while writing tests: Node 20+ ships `globalThis.localStorage` as an empty stub without methods (reserved for the experimental `--localstorage-file` flag); `resolveDefaultStorage()` now verifies methods are functions before trusting the binding.
- New telemetry events: `AudioManager.setMuted`, `AudioManager.play.notInitialized`, `AudioManager.play.keyMissing`, `BootScene PreloadedSfx`. All carry only fixed-string `reason` values — zero PII.
- Bundle stays ~1.5 MB (audio is loaded async by Phaser, not bundled into the JS).

## [0.5.1] - 2026-05-09 — Pause + Escape (in-round escape route)

A round used to be all-or-nothing — once started, the only way out was to finish or close the tab. v0.5.1 adds a clean in-round pause via Esc or an on-screen Pause icon, with a Resume / Quit-to-Menu overlay, and an Esc back-stack on every menu screen. Quitting abandons the round (no score saved) and emits a distinct `RoundAbandoned` telemetry event.

### Added
- **`src/game/scenes/PauseOverlay.ts`** — new parallel scene. Translucent backdrop, centered "Paused" title, `Resume` and `Quit to Menu` `PlaceholderButton`s, full keyboard nav (Tab/Enter/Space) via the existing `KeyboardNavigator`. Esc on the overlay routes to Resume so a single Esc round-trips the pause without hunting for the button. Registered in `main.ts` BEFORE `AttributionScene` so the AGPL §7(b) attribution footer stays visible while paused.
- **`src/game/ui/EscBackHandler.ts`** — small helper exporting `wireEscBack(scene, onBack)`. Registers a `keydown-ESC` handler with paired cleanup on BOTH `shutdown` and `destroy` so listeners don't accumulate across navigation. Wired into `GameSelectScene` (→ Menu), `DifficultyScene` (→ GameSelect), `GameOverScene` (→ Menu). `MenuScene` is the top of the stack — Esc intentionally not bound there.
- **`src/game/systems/waveKinematics.ts`** — pure module exporting `advanceY(currentY, dt, speedPxPerSec)` (used by `Alien.advance`) and `simulatePauseAwareAdvance(...)` (used by the new tests). Phaser-free so it tests at the right layer.
- **`src/game/systems/__tests__/waveKinematics.test.ts`** — 9 new tests verifying that paused frames don't advance Y, resume continues from the same Y with no snap or drift, and total advance is identical regardless of where pauses are inserted.
- **HudScene Pause icon** — 44×44 monochrome two-bar icon anchored top-right, `useHandCursor: true`, hand-cursor on hover. Bg-rectangle is the interactive surface (per the prior PlaceholderButton dead-zone lesson). Counter shifted left to make room.
- **GameScene pause API**: `pause()` / `resume()` / `isPaused()` / `quitToMenu()` / `getQuestionsCompleted()`. `pause()` freezes WaveSystem (early-return on its update), gates InputSystem fire (Space/click silently dropped), pauses scene-scoped tweens via `tweens.pauseAll()`, and pauses HudScene via `scene.pause`. `resume()` reverses each. Round state preserved exactly. No auto-fail timeout — pause is not a stealth difficulty mechanic. Idempotent.
- **Telemetry**: new events `GamePaused`, `GameResumed` (carry `mathId`, `speed`, `questionIndex`), and `RoundAbandoned` (carries `mathId`, `speed`, `questionsCompleted`). Two new reserved property names added to the central `TelemetryPropName` union: `from` and `questionsCompleted`.
- **`src/game/PLAYTEST.md`** — 21-row "Pause + Escape" section covering the keyboard, mouse, and touch entry points; the freeze-resume preservation contract; the back-stack on menu scenes; and the new telemetry events.
- **DeveloperGuide.md** — project layout reflects new files; three new "Where to look for what" rows for pause/Esc/Quit flow, the Esc back-stack helper, and pause-aware kinematics.
- **`src/services/ScoreCalculator.test.ts`** — new pause-invariance test that injects a real 5-minute time-gap (via `vi.useFakeTimers()` + `vi.advanceTimersByTime`) between `recordOutcome` calls. Codifies the contract that scoring is timing-independent — a future `Date.now()`-based bonus would now actually break the test instead of passing as a property restatement.

### Changed
- **`src/game/entities/Alien.ts`** — `advance(dt)` now calls `waveKinematics.advanceY` instead of inlining the math, so production motion and the pause tests share one implementation. Pause is enforced at the WaveSystem layer (its `update()` early-returns when paused), not inside Alien.
- **`src/game/scenes/HudScene.ts`** — added a single `getGameScene()` accessor that wraps the `as GameScene | null` cast, so the four call sites for pause/resume/quit/bind read as typed code instead of scattering casts.

### Notes
- All six review agents passed (InfoSec / Senior Dev / Support / DevOps / Architect / Legal). Two should-fix items folded in at wrap-up (real time-gap in the pause-invariance test; `getGameScene` accessor in HudScene). Zero must-fix items.
- Test count: 45 → **56** (+11). New file count: 4.
- iOS Safari audio gotcha (audio blocked until first user interaction) flagged in audio-format guidance for sprint 4 — not a 0.5.1 deliverable.
- Bundle still ~1.5MB / ~340KB gzipped (Phaser-dominated).

## [0.5.0.1] - 2026-05-09 — Hotfix: DifficultyScene default selections

Tagged with a 4-part version (not strict semver) so the hotfix doesn't collide with the upcoming sprint 0.5.1 (Pause + Escape). `package.json#version` stays at `0.5.0` since npm requires 3-part semver; only the git tag and GitHub release carry `v0.5.0.1`.

### Fixed
- **`src/game/scenes/DifficultyScene.ts`** — Start button stayed disabled even though "Add to 10" appeared selected. The blue keyboard-focus ring on the first tab stop and the amber "selected" ring on a previously-chosen speed look the same to a casual user, but internally `Settings.mathId` was `null`. Scene now auto-selects the first implemented math type (currently Add to 10) and Medium speed on entry if either is unset. Existing selections are preserved across navigation.
- **`VERSIONS.md`** — the v0.5.0 entry's description of the leak scanner ironically used the literal trigger words from its own pattern. Rephrased to "development-tooling vocabulary" so a fresh leak scan stays clean.

### Notes
- Tagging convention: hotfixes that ship after a closed sprint but before its successor ship as `vX.Y.Z.N` (4-part) when the standard `vX.Y.Z+1` patch slot is reserved for an upcoming named sprint. Future hotfixes follow the same rule.

## [0.5.0] - 2026-05-09 — Gameplay core (mathBasher is now a game)

The release where mathBasher actually plays. Hero auto-runs across the bottom; four aliens descend each round with answers on their faces; player fires (Space / mouse click / touch tap) at the correct one before the aliens reach the hero. Wrong shot triggers a visible speed penalty. A full 20-question round ends with a score saved to the score store and a `★` rating on GameOverScene, with "New high score!" detected and surfaced.

### Added
- **`src/game/entities/Hero.ts`** — auto-running placeholder hero (~48×64 amber rectangle with a direction notch), bouncing between safe-area bounds at `config.hero.runSpeedPxPerSec`. `playHitAnim()` (alpha flash) and `playDeathAnim(onComplete)` (~400ms drop+shake). The chassis is named `chassis`, not `body`, to avoid colliding with Phaser's reserved physics-body field.
- **`src/game/entities/Alien.ts`** — placeholder rounded panel (~80×60) carrying a centered answer number. `static WIDTH`/`HEIGHT` exposed for HitSystem. `playExplodeAnim(correct, onDone)` with green/red tint by outcome; `playFadeOut` for surviving aliens after a correct hit.
- **`src/game/entities/Projectile.ts`** — upward-moving ellipse fired by the hero. Speed from `config.hero.projectileSpeedPxPerSec` (added to central config this sprint). `bounds()` returns an instance-scoped scratch rectangle mutated in place to avoid per-frame allocations.
- **`src/game/systems/WaveSystem.ts`** — owns the 4-alien wave and descent. `spawnWave(question)` creates the alien set with the correct answer placed in a random lane, recorded internally so `isCorrectLane(lane)` resolves later. `update(dt)` advances all live aliens and returns `'reached-hero'` when contact is made. `applyWrongShotPenalty()` boosts every live alien to `penaltyPxPerSec` for the rest of the wave. Wrong-shot penalty is idempotent — a second wrong shot in the same wave doesn't re-boost.
- **`src/game/systems/HitSystem.ts`** — pure AABB collision helper. Module-scoped scratch `Rectangle` mutated via `setTo(...)`; collision sizes pulled from `Alien.WIDTH`/`Alien.HEIGHT` statics, not magic numbers.
- **`src/game/systems/InputSystem.ts`** — three input pathways converging into one `'fire'` event: `Space` keydown, mouse pointerdown, touch pointerdown. Cooldown gate from `config.hero.fireCooldownMs`. Auto-cleans on scene shutdown (and on explicit `destroy()`).
- **`src/game/scenes/GameScene.ts`** wired to actual gameplay: reads `Settings.round`, instantiates Hero/WaveSystem/HitSystem/InputSystem/ScoreCalculator, runs the 20-question round loop, emits `'questionStarted'` / `'questionEnded'` for HudScene, transitions to GameOverScene with the final result. Defensive defaults if Settings is empty.
- **`src/game/scenes/HudScene.ts`** wired to real GameScene events: prompt and question counter update on `'questionStarted'`; score updates and "+N" floating popup on `'questionEnded'`. **Pulls** the in-flight question from GameScene on bind to tolerate Phaser's async parallel-scene launch (otherwise Q1 would render the placeholder until Q2 fires).
- **`src/game/scenes/GameOverScene.ts`** now saves the round to the shared score store (read `previousBest` BEFORE save, then check for new high score), guards post-await scene mutations with `this.scene.isActive()`, animates a "★ New High Score! ★" badge, and `Settings.set`s `mathId`/`speed` defensively before `Play Again` so a `Settings.reset()` later in the sprint can't strand the replay path.
- **`src/services/scoreStoreFactory.ts`** memoized at module scope; `createScoreStore()` is called once in `src/main.ts` at boot to materialize the singleton.
- **`scripts/check-tooling-leaks.sh`** — canonical leak scanner. Greps every git-tracked file for development-tooling vocabulary (internal tool names, role labels, in-repo slash commands) with a tight allow-list, exits non-zero on findings. Runnable as `bash scripts/check-tooling-leaks.sh` (full repo) or `--staged` (pre-commit).
- **`src/game/PLAYTEST.md`** — manual playtest checklist used to verify the round end-to-end across Slow / Medium / Fast.
- **DeveloperGuide.md** — six new "Where to look for what" rows for the gameplay layer.

### Changed
- **`src/game/ui/PlaceholderButton.ts`** — bug-fix pass during the sprint after the new game-entry path surfaced two real click-reliability issues:
  1. `pointerup` → `pointerdown` so the first click after a scene transition isn't dropped (Phaser's pointer-state tracking treats the first down/up as incomplete if the cursor was already over the target when the scene activated).
  2. Interactive surface moved from the Container to the bg `Rectangle` leaf to eliminate dead zones from text glyphs shadowing portions of the container's hit-test.
  3. `useHandCursor: true` so the cursor flips to a hand on hover.

### Telemetry
- New events: `RoundStarted`, `QuestionStarted`, `QuestionEnded`, `WrongShot`, `RoundEnded`, `HighScoreSaved`. All carry `mathId`, `speed` and the relevant gameplay context. Zero PII.

### Notes
- All six review agents passed (InfoSec / Senior Dev / Support / DevOps / Architect / Legal). Five "should-fix" items folded in at wrap-up; one ("first-time wrong-shot tooltip") deferred to the art-polish milestone.
- Test count unchanged at 45 across 5 files — gameplay code is Phaser-coupled and verified by manual playtest, per the project's documented test-layer rule.
- Bundle still ~1.5MB / ~340KB gzipped (Phaser-dominated).

## [0.4.0] - 2026-05-09 — Scene flow (first kid-facing UI)

The menu / scene-flow layer. **First release with visible interactive UI.** Navigation works end-to-end with placeholder buttons across Boot → Menu → GameSelect → Difficulty → Game (placeholder) → GameOver, with a persistent AGPL §7(b) attribution footer running in parallel over every interactive scene.

### Added
- **`src/core/sceneKeys.ts`** — typed string constants for all 8 scenes (Boot, Menu, GameSelect, Difficulty, Game, Hud, GameOver, Attribution).
- **`src/services/Settings.ts`** — module-level singleton holding the in-flight round selection (`gameId`, `mathId`, `speed`). API: `setGameId`/`setMathId`/`setSpeed`/`reset`/`isReady`/`round` (read-only snapshot). Each setter logs via `_th` with typed telemetry props.
- **`src/game/ui/PlaceholderButton.ts`** — reusable rounded-rectangle button with hover/selected/focused/disabled states. Hit area exactly matches the rectangle. Disabled buttons IGNORE pointer events AND keyboard activation. Subtitle text at 14px stays fully opaque even when the button is disabled (WCAG 1.4.3 compliance).
- **`src/game/ui/KeyboardNavigator.ts`** — scene-scoped focus manager. Tab/Shift+Tab cycles through buttons (skipping disabled), Enter/Space activates the focused button. Distinct **blue** focus ring (3px) so keyboard focus is never confused with the **amber** selected ring. Listeners auto-cleaned on scene shutdown. Satisfies WCAG 2.1.1 (Keyboard).
- **`src/game/scenes/MenuScene.ts`** — title + subtitle + Start button (→ GameSelect) + High Scores button (auto-dismissing placeholder overlay with double-tap guard).
- **`src/game/scenes/GameSelectScene.ts`** — Alien Shoot tile (active) + Coming-soon tile (disabled) + Back button.
- **`src/game/scenes/DifficultyScene.ts`** — Math Type tiles gated on `getImplementedIds()` from the math registry; stub generators render disabled with their `description` ("Coming soon.") so a kid can never trigger a stub generator's throw. Speed tiles (Slow/Medium/Fast). Start button gated on `Settings.isReady()`. Defensive fallback if `getImplementedIds()` returns empty (no math types implemented anywhere): friendly message + Back button.
- **`src/game/scenes/GameScene.ts`** (placeholder) — shows the selected `mathId`/`speed`, launches HudScene in parallel (with double-launch guard), Quit button transitions to GameOverScene with a fake outcome. Real gameplay is the next milestone.
- **`src/game/scenes/HudScene.ts`** (placeholder, parallel) — translucent top bar with Score / prompt placeholder / Q-counter pulled from `config.round.questionsPerRound`.
- **`src/game/scenes/GameOverScene.ts`** — kid-friendly headline ('Round Complete!' / 'Round Done — Try Again?', never 'You failed'), score + correctCount + ★ row (filled vs outlined Unicode), three buttons (Play Again / Change Difficulty / Main Menu). Receives data via Phaser's `init(data)` mechanism.
- **`src/game/scenes/AttributionScene.ts`** — persistent parallel scene rendering the AGPL §7(b) attribution footer along the bottom of every non-Boot scene. Reads from `src/core/attribution.ts` (single source of truth). Source URL clickable, opens in a new tab with `noopener,noreferrer`. Never stopped — runs for the lifetime of the page.
- **`src/main.ts`** updated to register all 8 scenes (AttributionScene LAST so it renders on top of everything).
- **DeveloperGuide.md** updated: project layout block lists every new scene; "Where to look for what" gains rows for "How do I add a new scene?", "Where does cross-scene round selection live?", "Where is the AGPL §7(b) attribution display implemented?".

### Changed
- **`BootScene`** now transitions to MenuScene after an 800ms title flash (bumped from 400ms so a kid can actually read 'mathBasher' instead of seeing it flicker), launching AttributionScene in parallel before the transition.

### Notes
- **First kid-facing UI.** Visible buttons, copy, navigation. Accessibility was treated as in-scope for this sprint per the support-review feedback (keyboard nav, contrast, font sizes — not deferred to art polish).
- **No new tests** — gameplay/scene code is verified by manual playtest per the project's documented test strategy. Test count remains 45 across 5 files.
- The Vite production bundle is still ~1.5MB unminified / ~340KB gzipped (Phaser-dominated). Eight new scene files add trivial bytes.

## [0.3.0] - 2026-05-09 — Score store and scoring

The part of the system that **remembers how the player did**, plus the math that turns per-question outcomes into a final round score. After this release, sprint 0.5 (gameplay) has everything it needs to record results — no UI yet, but every back-end pipe is connected. Test count climbs from 25 to 45.

### Added
- **`src/services/IScoreStore.ts`** — `ScoreEntry` (one round result), `ScoreFilter` (combo lookup shape), and the `IScoreStore` interface (`save` / `top` / `bestForCombo`). All methods async-shaped so a future API-backed store is a drop-in replacement.
- **`src/services/SessionScoreStore.ts`** — in-memory implementation. Scores live in a single `ScoreEntry[]` field on the running browser tab and clear on page reload. Logs each `save`/`top` call via the typed telemetry helper.
- **`src/services/ScoreCalculator.ts`** — round-scoring math. Construct with `(mathId, speed)`, feed it per-question outcomes via `recordOutcome()`, then read `score` / `correctCount` / `passed` / `stars` getters at round end. Every multiplier and threshold comes from `src/core/config.ts` — no magic numbers.
- **`src/services/scoreStoreFactory.ts`** — `createScoreStore()` exports the single call site that decides which `IScoreStore` implementation gameplay code uses. Today returns a `SessionScoreStore`; the future Phase-3 `ApiScoreStore` is a one-file change here.
- **Tests:** 21 new tests (8 for `SessionScoreStore`, 13 for `ScoreCalculator`). `ScoreCalculator` tests are config-driven — re-tuning `config.round.starThresholds` or `config.scoring.afterWrongShotMultiplier` does not silently break the suite. Total now 5 test files, 45 tests.
- **DeveloperGuide.md** updated: project layout block lists the four new `src/services/*` files; "Where to look for what" gains rows for "How is scoring computed?" and "How do I add a new score backend?".

### Changed
- **`IScoreStore` docblock now carries forward-looking security notes for the future `ApiScoreStore`:** identity must NOT be a parameter (the API-backed store derives the acting user from server-side session state — never a caller-supplied id, prevents IDOR); client-supplied score values are advisory only when crossing the network (the API-backed store recomputes from `QuestionOutcome[]` server-side and stamps `achievedAt` itself, prevents client tampering). Comments only — no behavior change today, but the right threat model is locked in before the Phase-3 sprint inherits the interface.

### Notes
- Async signatures on `IScoreStore` are deliberate even though the v1 in-memory implementation is sync. Switching `Promise.resolve(...)` to real network requests later must NOT require changes to callers.
- No `localStorage`. No persistence. By design — persistence (across page reloads, even without an account) is a deliberate post-MVP decision.
- Wrap-fix items routed to future sprints (not in this release): sprint 0.4 acceptance now requires the `DifficultyScene` to gate tile selection on `getImplementedIds()` (so a kid can never trigger a stub generator's throw), and sprint 0.5's "save score" story now requires `createScoreStore()` to be called once at app boot rather than per-scene.

## [0.2.0] - 2026-05-09 — Math engine

The pure-TypeScript math content layer. After this release, the engine can produce `Question` objects (prompt + correct answer + 4 shuffled choices) for the Add-to-10 difficulty, with a registry that's ready to accept additional generators by adding files. First sprint with real test coverage in the repo (25 tests across 3 files).

### Added
- **`src/math/types.ts`** — `Question` and `QuestionGenerator` interfaces; `isStub` flag for placeholder generators; `defaultRng` re-exported for compatibility (it now lives in `src/math/rng.ts`).
- **`src/math/rng.ts`** — production RNG export (`Math.random` wrapped). Pulled out of `types.ts` so the types file holds only types.
- **`src/math/distractors.ts`** — `pickDistractors()` returns N distinct integers from `[min, max]` excluding `correct`; throws on impossible ranges. Defense-in-depth iteration cap + deterministic fill-from-pool fallback so adversarial / degenerate RNGs can't hang the loop. `shuffleAnswers()` Fisher-Yates with injectable RNG.
- **`src/math/generators/addTo10.ts`** — first real `QuestionGenerator`. `a` uniform in `[0, 10]`, `b` uniform in `[0, 10 - a]`, `correctAnswer = a + b`. Distractor count comes from `config.layout.targetLanes`.
- **`src/math/registry.ts`** — `Record<MathId, QuestionGenerator>` keyspace matched to `config.scoring.mathDifficulty`. Real `add-to-10` plus stubs for `add-to-20`, `sub-to-10`, `sub-to-20` that throw an actionable error on `.generate()`. `getGenerator(id)` and `getImplementedIds()` helpers.
- **`vitest.config.ts`** — `environment: 'node'`, includes `src/**` and `server/src/**`, `passWithNoTests: true`, v8 coverage, `@/*` alias mirrored from `vite.config.ts`.
- **`src/test-utils/mulberry32.ts`** — small seedable PRNG, test-only, used across all test files for deterministic randomness.
- **`pnpm test:coverage` script** + `@vitest/coverage-v8` devDep; HTML report at `coverage/index.html`.
- **`DeveloperGuide.md`** — high-level orientation file for engineers and tech leads. Project structure, conventions, build/run/test commands, license model, "where to look for what" navigation table. Top-of-file numbered Dev environment setup walkthrough plus a "Common first-run gotchas" troubleshooting table.
- **Tests:** 25 across `src/math/distractors.test.ts`, `src/math/generators/addTo10.test.ts`, `src/math/registry.test.ts` — including a 1000-sample seeded property test on the `addTo10` generator and explicit coverage of the defense-in-depth fallback path.

### Changed
- **Project-local pnpm install.** `.npmrc` now sets `store-dir=.pnpm-store` so the pnpm content store lives inside the project root rather than the user's home folder. Cloning to a USB stick or fresh machine produces an identical install regardless of any pre-existing global pnpm state.
- **`vite` upgraded** from `^5.2.0` to `^6.4.2`.
- **`vitest` upgraded** from `^1.5.0` to `^3.2.4` (plus matching `@vitest/coverage-v8`).
- **`pnpm.overrides`** added in `package.json` to dedupe transitive `vite` and `esbuild` to the patched lines (Vitest 3 still ships `vite@5.4.21` internally; override forces it to `^6.4.2`).
- **`@types/express`** pinned from `^5.0.0` to `^4.17.21` to match the actual `express ^4.19.2` runtime.
- **`Dockerfile`** runtime stage now also COPYs `LICENSE`, `NOTICE`, `README.md` for AGPL distribution compliance; previously had a duplicate `package.json` COPY (removed).
- **Express server** PORT validation: malformed values log a Warning and fall back to 8080 instead of allowing `NaN` to crash-loop the container. Friendly EADDRINUSE message + clean exit if the port is in use.
- **Shared telemetry core.** New `src/shared/telemetry-core.ts` holds the canonical `SeverityLevel` enum, `TelemetryHelper` interface, `TelemetryProps` / `TelemetryPropName` types, and `makeTelemetry(opts)` factory. Browser (`src/core/telemetry.ts`) and server (`server/src/telemetry.ts`) are now thin 8-line wrappers passing their `{appLayer, cloudRoleName}` context into the factory. ~50 lines of duplication eliminated; future App Insights SDK wiring lands once in the factory.
- **Typed telemetry property names.** Reserved property names (`gameId`, `mathId`, `speed`, etc.) are now codified as the `TelemetryPropName` TypeScript union in `src/shared/telemetry-core.ts`. IDE autocomplete suggests valid keys; object literals with typo'd keys fail typecheck.
- **Server build output path changed.** `tsconfig.server.json` now uses `rootDir: "."` so the server compiles shared modules alongside its own source. Output structure mirrors source: `pnpm start` and the Dockerfile `CMD` now invoke `server/dist/server/src/index.js` (was `server/dist/index.js`). Anyone wrapping `npm start` from outside this repo's `package.json` may need to update their command.

### Fixed
- **Two moderate dev-only CVEs cleared** (GHSA-4w7w-66w2-5vf9 Vite path traversal in dev server, GHSA-67mh-4wv8-2f99 esbuild dev server permissive CORS). Production runtime image was never affected. `pnpm audit` now reports zero vulnerabilities.
- **Vitest worker-cleanup hang on Windows** — Vitest 1.6 sometimes left worker threads alive after the test run completed, requiring manual termination. Vitest 3 handles this correctly.

### Notes
- Disk size after first install is ~2.3GB; Phaser ships its full source in the npm package. Production image is unaffected (only `dist/` and `server/dist/` reach the runtime stage).
- Community-standards files (`SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`) landed alongside the v0.0.0 baseline. They've been live throughout 0.1 and 0.2 but the formal release notes are recorded here for completeness.

## [0.1.0] - 2026-05-09 — Scaffold

The empty playable shell. After this release, `pnpm dev` shows a Phaser canvas with "mathBasher" centered, `pnpm start` (after `pnpm build`) serves the production bundle on port 8080 with `/health` returning 200, and `docker build .` produces an Azure-ready container image.

### Added
- **Build toolchain** — Vite + TypeScript (strict, project references), with `@/*` path alias to `src/`. Pinned to **pnpm 9.15.0** via Corepack.
- **Phaser 3** rendering layer; `BootScene` renders the project name on a 1280x720 design canvas with `Phaser.Scale.FIT` scaling.
- **Folder layout** — `src/{game,math,services,core}`, `public/assets/`, `server/src/{routes}`. Empty folders anchored by `.gitkeep`.
- **Central config** at `src/core/config.ts` — every gameplay knob (round, scoring, hero, layout, speed table, math difficulty multipliers) in one place. Derived `MathId` and `SpeedKey` types.
- **Telemetry helper** (`_th.logToAi(...)` with `SeverityLevel` enum) for both browser and server. `cloudRoleName` placeholders distinguish `MathBasher.Web` from `MathBasher.Server`. Console fallback when no App Insights connection string is configured.
- **Express server** — Node 20, ESM. Reads `PORT` from env (default 8080) with validation; binds `0.0.0.0`; mounts `/health` before static + SPA fallback; graceful SIGTERM/SIGINT with 30s grace; friendly EADDRINUSE handling.
- **Multi-stage Dockerfile** — `node:20-alpine` for both stages, `EXPOSE 8080`, runs as non-root `node` user, `HEALTHCHECK` probing `/health`. Runtime stage ships `LICENSE`, `NOTICE`, `README.md` for AGPL distribution compliance.
- **Hardened `.dockerignore`** — excludes secrets (`.env`, `*.pem`, `*.key`, `secrets/`, etc.), build artifacts, internal workspace, tests; explicit allowlist for public-facing files.
- **`.env.example`** documenting `PORT`, `BUILD_HASH`, `APPINSIGHTS_CONNECTION_STRING`, `VITE_SOURCE_URL`.
- **`src/core/attribution.ts`** — single source of truth for the AGPL §7(b) UI attribution text. Reads `VITE_SOURCE_URL` at build time with a deliberately invalid placeholder fallback so misconfigured deploys surface immediately.
- **SPDX `AGPL-3.0-or-later` header** on every new source file.
- **Repo polish** — README updated with prerequisites (Node 20+, pnpm 9+ via Corepack), run-locally + production-style steps, accurate flat-layout structure tree, and Windows + macOS/Linux commands for `.env` setup.

### Notes
- pnpm uses `node-linker=hoisted` (configured in `.npmrc`) for Windows compatibility — flat node_modules avoids pnpm's symlink/rename ENOENT issues on Windows file systems.
- The Vite production bundle is ~1.5MB unminified, ~340KB gzipped. Phaser is heavy; manual code-splitting deferred until it becomes a real concern.
- `@types/express` pinned to `^4.17.21` to match the actual `express ^4.19.2` runtime (avoids a future Express 5 / path-to-regexp v6 surprise).

## [0.0.0] - 2026-05-08 — Project skeleton

Initial planning and setup phase. No application code yet; this version establishes the project's legal, architectural, and process foundations.

### Added
- AGPL-3.0-or-later + Commercial dual license (`LICENSE`, `NOTICE`, `COMMERCIAL.md`)
- AGPL §7(b) UI attribution requirement, with architectural enforcement plan via a persistent `AttributionScene` (to be implemented in sprint 0.4)
- Project `README.md` and `VERSIONS.md`
- Third-party asset credits skeleton at `public/assets/CREDITS.md`
- Seven public Architecture Decision Records under `docs/adrs/`:
  - ADR-0001 Tech stack — Vite + TypeScript + Phaser 3
  - ADR-0002 Single-container deployment with Express server
  - ADR-0003 Single central config file for all gameplay tuning
  - ADR-0004 Dual license (AGPL + Commercial) with §7(b) UI attribution
  - ADR-0005 Sprint id is the release version
  - ADR-0006 Folder discipline (no Phaser in /math or /services)
  - ADR-0007 Azure App Service for Containers (over Container Apps)
- Repo hygiene: `.gitignore`, `.gitattributes` (LF normalization, binary marks), `.editorconfig`
- Initial directory structure for `public/assets/`
