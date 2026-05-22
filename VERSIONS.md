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

_Nothing yet._

## [2.2.1] - 2026-05-22 — Post-Climb cleanup, UX polish, WebP migration, cross-game scoring true-up

A catch-all sprint paying down the sprint 2.2 audit's should-fix items plus the cross-game scoring/round-size true-up. 12 stories across four buckets:

- **Kid-UX hints** — a session-once "One more try!" mulligan banner + a floating "−3s" timer popup; an "Out of time!" banner before the timer-out fall-off; the Number Climb difficulty subtitle now shows the floor count; hero-jump delay tuned 300 → 200 ms for snappier tap response.
- **Config + code cleanup** — Climb entity dimensions lifted into `config.numberClimb.{hero,rung,frame}`; dead code removed; the `pickRung` decision logic extracted to a pure, fully-tested `resolveRungPick`.
- **WebP migration** — `scripts/sprites/process.mjs` gained a `--format` flag; 39 background + hero + asteroid assets migrated PNG → WebP, cutting the background payload ~9.5 MB → ~1.0 MB.
- **Cross-game true-up** — Alien Shoot + Asteroid Field rounds normalized 20 → 12 questions (matching Number Climb); cross-game max-score parity verified and locked with tests.
- **Six-reviewer audit fixes** — a false-positive-Warning fix in the Climb input cooldown, a shared banner-legibility treatment over busy floor art, and documentation/credits accuracy.

## [2.2.0] - 2026-05-21 — Number Climb (ships as "Space Escape!")

- **Number Climb** — third game mode. A burning-space-station escape arcade: kid climbs 12 floors picking the correct-answer rung at each floor, dodging a cumulative timer + a one-mulligan-per-floor cap. Difficulty controls rung count (2/3/4); Speed controls the cumulative timer budget (250s / 180s / 120s). Stars are height-based, not correct-count.
  - Floor visuals: random "room" bg images per round (no repeat within a round) inside a black picture-frame with nebula bleed-through on the sides; next-floor preview at 25% alpha; fixed "fire" image on the ground floor; fixed "escape" image at 2× height on the top floor with a spaceship overlay that blasts off with a smoke trail on win. "Escaped Safe!" banner fires at 75% of the ship-blast and holds for 1s before GameOver.
  - Cross-game improvements landed in this sprint: math-prompt font bumped 24px → 42px (was visually smaller than the answer numbers — fixed in `typography.ts` + `hudBarHeightPx`); HUD progress dots + Q-counter now read round size from `RoundController` so any future non-20-question mode works without HUD edits; `GameOverScene` "Correct: N/total" denominator dynamic the same way.
  - Display name flipped: "Number Climb" → "Space Escape!" in `GameSelectScene` + `LoadingScene`. Internal `'number-climb'` GameId / `SceneKeys.NumberClimb` / telemetry events / file names stay verbatim for App Insights query continuity.
  - Adds ADR-0011 conformance: every step of the 12-step "how to add a new game mode" checklist hit.

## [2.1.9] - 2026-05-18 — Pre-2.2 refactor + per-game midground audio

Six-story sprint paying down debt that accumulated across 2.1 → 2.1.8 before sprint 2.2 (Number Climb) locks in three-way duplication. Also fixes the long-standing "Asteroid Field plays Alien Shoot's hero-skittering loop" mismatch with a per-game midground.

### Story 1 — `GameSceneLifecycle` helper
GameScene + AsteroidFieldScene shared ~150 lines of game-mode-agnostic boilerplate (audio loops, HUD launch, telemetry, pause/resume, endRound → SessionTotalScore → GameOver transition, defensive `Settings.setGameId`). Extracted to `src/game/services/GameSceneLifecycle.ts` (composition, not inheritance — matches `RoundController` precedent). Per-scene `pause()`/`resume()` now reads as "subsystem pause + lifecycle.pause()" instead of inline 15-line boilerplate.

### Story 2 — LoadingScene cruft cleanup
Removed redundant `loadGameBundle` + `attachLoadingOverlay` calls from `GameScene.preload()` and `AsteroidFieldScene.preload()` (both `preload()` methods deleted entirely). `LoadingScene` (sprint 2.1.8) already warms the cache before either game scene mounts.

### Story 3 — ADR-0011: Per-game-mode dispatch
New `docs/adrs/ADR-0011-per-game-mode-dispatch.md` codifies the `Record<GameId, X>` map pattern from sprints 2.1 → 2.1.8 (GAME_BG_MAP, GAME_MUSIC_MAP, GAME_MIDGROUND_MAP, audioScopeFor, per-entry asset scopes). Includes a 12-step "how to add a new game mode" checklist so 2.2 Number Climb is mechanical.

### Story 4 — `createObservable<T>()` helper
Settings.ts had two near-identical observable fields hand-rolled (`gameId`, `imageAsteroidsEnabled`). Extracted to `src/services/observable.ts` — 50 lines, 3 functions, 12 unit tests. Settings.ts refactored to consume it; behavior unchanged.

### Story 5 — `.sprints/` publicly visible
Removed `.sprints/` from `.gitignore`. SPRINT-PLAN.md back-filled with rows for 2.1.5, 2.1.6, 2.1.8, 2.1.9. DeveloperGuide.md "Where to look for what" gained pointers to sprint files + ADR-0011.

### Story 6 — Per-game midground audio
- New asset: `public/assets/audio/midground/space-noises-1.mp3` (ElevenLabs, 6s mono loop, encoded with `--no-trim`).
- `MidgroundKeys.SpaceNoises1` + new `GAME_MIDGROUND_MAP: Record<GameId, MidgroundKey>` (parallels `GAME_MUSIC_MAP`). Alien Shoot keeps Skittering1; Asteroid Field gets SpaceNoises1.
- `audioScopeFor` extended for the new asset (`'game:asteroid-field'` scope → lazy-loads).
- GameSceneLifecycle + GameScene death-anim restart both read `GAME_MIDGROUND_MAP[gameId]`.
- Fixed the v2.1.8 mismatch where Asteroid Field was playing Alien Shoot's hero-running loop despite having no skittering-hero gameplay.
- CREDITS.md: new "Asteroid Field midground" subsection.

### Tests + verification
- 313 tests passing across 30 files (was 301 across 29). 12 new tests in `observable.test.ts`.
- Both games play identically to v2.1.8 except for the Asteroid Field midground swap (intentional).

### Operational impact
- Smaller game-scene files; less duplication.
- 2.2 author follows ADR-0011's 12-step checklist instead of inferring patterns from 6 file reads.
- One new asset shipped (~71 KB midground MP3). No new deps. No CI / Dockerfile / IaC changes.

## [2.1.8] - 2026-05-17 — Loading-bar visibility (boot + per-game scene)

Playtest of v2.1.6 surfaced two perception issues — both about loading-bar VISIBILITY between user-tap and on-screen-content, not actual load time. Both fixed.

### Story 1: Splash → menu DOM loading bar

The "Tap to play" splash dismissed immediately on click, leaving a visible blank-canvas moment while Phaser constructed + ran BootScene preload (the ~2 MB post-2.1.6 boot bundle). The Phaser-based bar inside `BootScene.preload` couldn't bridge the gap because the Phaser canvas hadn't painted its first frame yet.

Moved the boot loading bar into the DOM (`index.html` + `boot.ts`):
- New `#splash-loading` markup inside the existing splash overlay; revealed when `#splash` gets `.loading-active` (CSS swaps the "Tap to play" button → bar in place).
- `boot.ts` exposes `window.__mbBootHooks = { onProgress, onComplete }` for BootScene to drive; `BootScene.preload` wires Phaser's loader events to those hooks.
- `MIN_DISPLAY_MS = 500` floor so fast loads still flash a coherent "bar appeared, filled, dismissed" beat instead of a single-frame disappearance.
- Removed the now-redundant `attachLoadingOverlay` call from `BootScene.preload`.

### Story 2: Per-game scene-transition loading bar (LoadingScene)

The Phaser-based per-game loading bar (`AsteroidFieldScene.preload` / `GameScene.preload` calling `attachLoadingOverlay`) didn't paint visibly during the scene transition — Phaser's mid-session scene-transition timing means the new scene's canvas doesn't render its first frame until `create()` runs, by which point the loader is already done. The kid saw DifficultyScene → ~1-2 second freeze → game suddenly running. Reads as a hang.

Added a dedicated `LoadingScene` intermediate:
- New `src/game/scenes/LoadingScene.ts` — runs `loadGameBundle(this, gameId)` + `attachLoadingOverlay({ caption: 'Loading <mode>…' })` in its own preload + transitions to the target game scene on create.
- `DifficultyScene` now calls `scene.start(SceneKeys.Loading, { targetSceneKey, gameId })` instead of starting the target game scene directly.
- `SceneKeys.Loading = 'loading'` added.
- LoadingScene registered in `boot.ts` between Difficulty and the game scenes (matching render order).
- Cache-hit case: cached re-loads short-circuit cleanly via `attachLoadingOverlay`'s `totalToLoad === 0` guard; LoadingScene's `create` fires immediately for an instant transition.

### What didn't change
- Asset loading itself (sprint 2.1.6's `loadGameBundle` + `loadGameBundle` + scope partition stay exactly as-is). This sprint is pure perception/UX.
- The Phaser-based `attachLoadingOverlay` helper stays (LoadingScene uses it). It's just no longer called from inside game scenes' own preloads — the redundant call there could be removed in a future cleanup but is harmless (LoadingScene queues + loads first; the game scene's preload runs with `totalToLoad === 0`).
- Game scenes' `preload()` calls to `loadGameBundle` were KEPT as a safety net for any direct-entry path (deep link, Play Again from GameOver — the latter is currently always a cache-hit anyway).
- No new assets shipped; no new dependencies.

### Tests + verification
- 301 tests passing (unchanged from v2.1.6 — sprint adds scene wiring, no new logic to test in isolation).
- Manual playtest: tap → bar appears within ~50ms (DOM paint, no Phaser) → bar fills smoothly → dismisses cleanly to menu → first per-game pick shows the bar via LoadingScene → second pick is instant.

## [2.1.6] - 2026-05-17 — Lazy per-game asset loading

Each asset declares a scope (`eager` / `always` / `game:<gameId>`); per-game assets defer to the first time the player picks that mode. Phaser's texture cache makes subsequent picks instant. Boot transfer drops from ~5.5 MB to ~2 MB (~64%); adding a third game mode (2.2 Number Climb) no longer compounds the boot load.

### New abstractions
- `src/core/assetScope.ts` — `AssetScope` template-literal union over `GameId` + `isBootScope` / `isGameScope` predicates. Pure, unit-tested (7 tests).
- `src/game/services/assetLoader.ts` — `loadGameBundle(scene, gameId)` queues per-game-scoped manifest entries; `shouldLoadAtBoot(entry)` is BootScene's symmetric filter.
- `src/game/services/alienAnims.ts` — doubly-idempotent `createAlienAnims(scene)` (guards on `anims.exists` AND `textures.exists`) so the helper is safe from any scene at any time.
- `src/game/ui/LoadingOverlay.ts` — extracted from BootScene's inline progress bar. Short-circuits when nothing's queued; renders a thin amber bar + "Loading…" label. On loader errors, telemetry fires + a "Trouble loading — Tap or press Space to retry" overlay restarts the scene (Phaser cache means only failed files re-fetch). WCAG 2.1.1 keyboard-accessible.

### Manifest scope additions
- `SPRITE_MANIFEST` + `AUDIO_MANIFEST` entries gained a required `scope` field.
- `ALIEN_SPRITE_SCOPE` module value for the alien-spritesheet pool (separate from SPRITE_MANIFEST due to tier-aware webp loading).
- Asteroid-Field-only assets re-scoped to `'game:asteroid-field'`: 8 asteroid rocks + 3 asteroid-hero ships + `loop-3.mp3` + `timeout-fail-1.mp3`.
- Alien-Shoot-only assets re-scoped to `'game:alien-shoot'`: 45 alien spritesheets + 3 speeder hero ships.
- Asteroid-belt bg stays `eager` (1.1 MB one-time cost vs. BackgroundScene swap-race complexity).

### Scene wiring
- `GameScene.preload()` + `AsteroidFieldScene.preload()` both call `loadGameBundle(this, this.gameId)` + `attachLoadingOverlay`. Idempotent — re-entering a previously-played game has nothing to load and the overlay short-circuits.
- `GameScene.create()` calls `createAlienAnims(this)` so the 45 alien animation registrations happen AFTER the spritesheets load (post-preload).
- `BootScene` refactored to filter manifest loops by `shouldLoadAtBoot`; alien-anim registration moved out to the shared helper.

### Sprite-tier memoization
- New `getCachedSpriteTier()` caches the boot-time `pickSpriteTier(window.innerWidth, window.devicePixelRatio)` result so per-game preloads pick the same tier as boot (ADR-0010 D4 one-tier-per-session invariant).
- `_resetCachedSpriteTier()` test-only escape hatch.

### Loader-error handling
- Per-file `AssetLoader.fileError` telemetry at Error severity (carries failed type/key/src in `reason`).
- Per-retry `AssetLoader.retry` telemetry at Information severity (carries failed-file count for ops visibility).
- User-facing copy hides the count ("Trouble loading" — no number); the kid-actionable verb is the retry button only.

### Tests + validation
- 301 tests passing across 29 files (was 286 across 27). 15 new tests: 7 in `assetScope.test.ts`, 5 in `LoadingOverlay.test.ts`, 3 in `spriteKeys.test.ts` (memoization contract).
- Pre-merge code review passed across 2 audit iterations (verdict: APPROVED with the 1 must-fix + all 7 minor items addressed before close).
- DeveloperGuide.md gained a new "Asset scoping (lazy per-game loading)" section.

### Operational impact
- Boot transfer: ~5.5 MB → ~2 MB (positive DevOps signal — lower cold-start latency, reduced egress per session).
- Total bytes per session roughly unchanged — distribution shifts from "one big boot fetch" to "boot + N per-game-pick fetches."
- No new dependencies. No CI / Dockerfile / IaC changes. No new shipped assets (sprint reorganizes loading of existing assets only).

## [2.1.5] - 2026-05-17 — Per-game backgrounds + per-game music + session-total score

Each game mode now has its own audio-visual identity, and the HUD shows a cumulative session score in addition to the per-round score.

### Per-game backgrounds (Story 1)
- New asset: `public/assets/sprites/bg/asteroid-belt.png` (Midjourney, 1280×717 RGB, brightness 0.6 matching the nebula recipe so both backgrounds feel like a coherent visual family)
- `BgSpriteKeys.AsteroidBelt` added
- `GAME_BG_MAP: Record<GameId, BgSpriteKey>` in `src/core/spriteKeys.ts` — central per-game-mode mapping. TypeScript exhaustiveness check forces future game-mode additions to map a backdrop
- `Settings.onGameIdChange(listener) => unsubscribe` observer added (mirrors `onImageAsteroidsChange` pattern). `setGameId` fires listeners on real changes (idempotence guard)
- `BackgroundScene` holds the backdrop image as a field, picks the initial texture from `GAME_BG_MAP[gameId]`, subscribes to gameId changes to swap the texture live. Re-calls `setDisplaySize` after `setTexture` (Phaser quirk)

### Per-game music (Story 2)
- New asset: `public/assets/audio/music/loop-3.mp3` (ElevenLabs, 30s stereo loop, 160 kbps, encoded with `--no-trim` to preserve clean loop boundaries)
- `MusicKeys.Loop3` added
- `GAME_MUSIC_MAP: Record<GameId, MusicKey>` parallels `GAME_BG_MAP`. Each game scene reads its music key from the map at `create` time instead of hard-coding `MusicKeys.Loop1`. Unlike the bg map (consumed by the persistent `BackgroundScene` via observer), the music map is read directly by each game scene since they already know their own gameId
- Mapping: `alien-shoot` → Loop1 (unchanged), `asteroid-field` → Loop3 (new)

### Session-total score in HUD (Story 3)
- New module `src/services/SessionTotalScore.ts` — in-memory `get()` / `add(delta)` / `reset()` accumulator + `getLastDisplayed()` / `markDisplayedAs(n)` for HUD count-up animation. Page reload resets (intentional; session-bounded by design)
- HUD top-left now shows TWO labels side-by-side: "This round: N" + "This visit: M". The visit label's x-position re-flows after every round-score update so growing scores never cause overlap
- HUD on mount: animates the visit total from "what the player last saw" up to the current value over 700ms (`Quad.Out` ease). No animation when nothing changed (first round, page reload, mid-round re-paint)
- Each game scene's `endRound()` calls `SessionTotalScore.add(roundController.score)` BEFORE the GameOver transition. Quit-to-menu mid-round does NOT contribute (partial round score isn't earned yet)
- High-score storage unchanged — still based on single-round score

### Tests + validation
- 286 tests passing across 27 files (was 267 across 25). 9 new SessionTotalScore tests
- Pre-merge code review passed across 2 audit iterations (verdict: APPROVED with all minor items addressed before close)
- No breaking changes — Alien Shoot behaves identically, no localStorage or score-store migration

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
