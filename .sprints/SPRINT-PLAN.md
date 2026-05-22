# Sprint Plan

The full catalog of mathBasher sprints. One line per sprint, status updated by `/close-sprint`.

## Sprint 0 — Project skeleton (planning + setup)

| ID | Title | Status | Blocks |
| --- | --- | --- | --- |
| 0 | Project skeleton (license, conventions, sprint scaffolding, repo hygiene, ADRs) | Closed (2026-05-08) | everything |

## Foundation (the playable MVP)

| ID | Title | Status | Blocks |
| --- | --- | --- | --- |
| [0.1](foundation/0.1-scaffold.md) | Scaffold (Vite + TS + Phaser, folder layout, central config, telemetry stub) | Closed (2026-05-09) | everything |
| [0.2](foundation/0.2-math-engine.md) | Math engine (QuestionGenerator interface, Add-to-10, distractors, registry, tests) | Closed (2026-05-09) | 0.5 |
| [0.3](foundation/0.3-score-store.md) | Score store + scoring (IScoreStore, SessionScoreStore, ScoreCalculator, tests) | Closed (2026-05-09) | 0.5 |
| [0.4](foundation/0.4-scene-flow.md) | Scene flow (Boot → Menu → GameSelect → Difficulty → Game → GameOver, placeholder UI) | Closed (2026-05-09) | 0.5 |
| [0.5](foundation/0.5-gameplay-core.md) | Gameplay core (hero, wave, descent, fire, hit detection, wrong-shot penalty, full round) | Closed (2026-05-09) | 0.5.1 |
| [0.5.1](foundation/0.5.1-pause-and-escape.md) | Pause + escape (Esc key, on-screen Pause button, PauseOverlay scene, Quit-to-menu, Esc back-stack on menus) | Closed (2026-05-09) | 0.5.2 |
| [0.5.2](foundation/0.5.2-first-audio.md) | First audio (AudioManager facade + Phaser impl, BootScene preload, fire-1 SFX wired to InputSystem, mute toggle with localStorage persistence, iOS first-interaction init) | Closed (2026-05-09) | 0.5.3 |
| [0.5.3](foundation/0.5.3-audio-content-and-settings.md) | Audio content batch + Settings screen + first loops wired (5 MP3s + encoder midground kind, three-kind volume controls reachable from Menu and PauseOverlay, `loop-1` music + `skittering-1` hero-movement wired with full pause/mute/live-volume integration) | Closed (2026-05-10) | 0.5.4 |
| [0.5.4](foundation/0.5.4-click-to-start-splash.md) | Click-to-start splash + button-click SFX (defer Phaser construction to a user-gesture splash overlay to eliminate the AudioContext warning + iOS first-gesture handling; wire `button-click-1.mp3` to every PlaceholderButton + HUD icon activation through the existing AudioManager `play(key, 'sfx')` path) | Closed (2026-05-09) | 0.5.5 |
| [0.5.5](foundation/0.5.5-refactor-pass.md) | Refactor pass + speed bump (setupScene + IconButton + boot.ts split + MenuLayout + AUDIO_MANIFEST + typography/palette + fossil-comment cleanup + type-cast tightening + late-add Story I: +21% cumulative descent-rate bump on alien-shoot) | Closed (2026-05-09) | 0.6 |
| [0.6](foundation/0.6-mobile-responsive.md) | Mobile + responsive (FIT scaling + 1280×720 design canvas + SCALE.md doc · portrait-rotate overlay with kid-friendly copy · TouchFireButton with config-lifted constants · InputSystem carve-out · 8-viewport spot-check · perf sanity · DeveloperGuide.md updates · late-add Story 8: -15% speed re-tune pulling back the v0.5.5 over-correction) | Closed (2026-05-10) | 0.6.1 |
| [0.6.1](foundation/0.6.1-sprite-prep.md) | Sprite prep (single-PNG pipeline via sharp + per-kind profiles · `.sprite-source/` workspace mirroring `.audio-source/` · video-to-spritesheet extractor with verify-grid + auto-margin + soft-alpha + cross-frame consistency restore · sprite-pipeline SKILL.md interactive workflow · ADR-0009) | Closed (2026-05-10) | 0.6.2 |
| [0.6.2](foundation/0.6.2-sprint-0.7-decisions.md) | Sprint 0.7 decisions (ADR-0010 sprite tier strategy: 128/192 dual-tier + subfolder layout + 12 fps default · color decontamination "unmatting" pass in extract pipeline · production-quality re-extract of all 5 alien-video batches as the sprint 0.7 candidate pool) | Closed (2026-05-10) | 0.6.3 |
| [0.6.3](foundation/0.6.3-further-sprint-0.7-prep.md) | Further sprint 0.7 prep (random animated rider sprites per falling block from 45-key pool · shooter speed +15% · 1-second pre-fall jiggle · loading bar in BootScene · data-driven sprite-batch registry · variable-frame-count robustness · add-to-10 uniform answer distribution fix · all 5 alien videos processed at option-C dark-bg matched defaults) | Closed (2026-05-12) | 0.7 |
| [0.7](foundation/0.7-art-polish.md) | Art + polish (CC0 + Midjourney sprite/audio assets · BackgroundScene parallax + nebula · hero re-skin with 3 round-robin speeders + engine glow + smoke death · particle hit-feedback + screen flash/shake + 6 random SFX · projectile glow capsule + muzzle flash · alien rider plate compositing · Baloo 2 typography · GameOverScene polish · HUD score-popup-at-alien + dot progress · MenuScene mute icon · AttributionScene hover · ADR-0010 sprite tier strategy · DeveloperGuide.md update · P2 cleanup grab-bag) | Closed (2026-05-14) | 0.7.5 |
| [0.7.5](foundation/0.7.5-mobile-speed-tuning.md) | Mobile + speed tuning (mobile font bump +20% across all text · shooter speed bumped twice for cumulative +37.5% in-sprint = 1.58× v0.5 baseline · typography consolidated to single `typography.ts` STYLES registry with 14 new TextKinds + `textStyle()` helper · `ButtonClicked` telemetry across PlaceholderButton + TouchFireButton via shared `buttonTelemetry.ts` module · DifficultyScene layout polish: subtitle wordWrap + 220×100 tiles + 32px-bold sectionLabel headings · music gain halved via `KIND_ATTENUATION` table) | Closed (2026-05-15) | — |

When 0.1 through 0.7 are Closed, the MVP is shippable.

## Phase 1 — additional math types (after foundation)

Each is a small sprint: add a generator file, register it, add its multiplier to `config.scoring.mathDifficulty`, add a tile in `GameSelectScene`. No engine changes.

| ID | Title | Status |
| --- | --- | --- |
| [1.1](phase-1/1.1-math-generators-batch.md) | Phase 1 math generators batch — Add to 20 + Subtract within 10/20 + Multiply 10×10 + Multiply 12×12 + DifficultyScene 2-row layout reflow + near-miss multiplication distractors + anti-repeat sliding window + chassis +25% widening for aim + Hero flip-direction inversion + HudScene round-2 dot fix + sprite pipeline `--flop` CLI flag (bundled per user direction; one branch, one PR, one tag) | Closed (2026-05-16) |
| 1.2 | Subtract within 10 — DELIVERED IN 1.1 | bundled |
| 1.3 | Subtract within 20 — DELIVERED IN 1.1 | bundled |
| 1.4 | Multiplication tables — split per user direction into Multiply 10×10 + Multiply 12×12, both DELIVERED IN 1.1 | bundled |
| [1.5](phase-1/1.5-division-and-mixed-batch.md) | Phase 1 division + mixed batch — Divide 10×10 + Divide 12×12 + Mixed Math (random from all 8 others, via dependency-injection picker) + DifficultyScene 3-row layout for 9 tiles + lifted tile dimensions to config + deleted dead `description` field + write-once `setMixedDelegate` with HMR-safe escape hatch + zero reviewer-name leaks in committed source (bundled per user direction; mirrors the 1.1 bundle shape) | Closed (2026-05-16) |
| 1.6 | Mixed (random pick from selected operations) — DELIVERED IN 1.5 as "Mixed Math" (all-implemented; multi-select UI deferred) | bundled |

## Phase 2 — additional game modes (after phase 1)

| ID | Title | Status |
| --- | --- | --- |
| [2.1](phase-2/2.1-asteroid-field.md) | Asteroid Field — answers float in random 2D positions, hero rotates + aims, reuses all 9 Phase 1 math types | Closed (2026-05-17) |
| [2.1.5](phase-2/2.1.5-per-game-bg-and-music.md) | Per-game backgrounds + per-game music + session-total score in HUD (3 stories, audit APPROVED, v2.1.5) | Closed (2026-05-17) |
| [2.1.6](phase-2/2.1.6-lazy-asset-loading.md) | Lazy per-game asset loading (AssetScope + LoadingOverlay + assetLoader + alienAnims; boot transfer ~5.5 MB → ~2 MB) | Closed (2026-05-17) |
| [2.1.8](phase-2/2.1.8-loading-bar-visibility.md) | Loading-bar visibility — DOM splash bar (post-tap → menu) + LoadingScene intermediate (DifficultyScene → game scene) | Closed (2026-05-17) |
| [2.1.9](phase-2/2.1.9-pre-2.2-refactor-and-per-game-midground.md) | Pre-2.2 refactor (GameSceneLifecycle helper + createObservable + ADR-0011 + .sprints/ public) + per-game midground audio for Asteroid Field | Closed (2026-05-18) |
| [2.2](phase-2/2.2-number-climb.md) | "Number Climb" (ships as "Space Escape!") — climbing platformer with answer rungs, 12 floors, escape-the-burning-station theme | Closed (2026-05-21) |
| [2.2.1](phase-2/2.2.1-post-climb-cleanup.md) | Post-Climb cleanup, UX polish, WebP migration, and cross-game scoring true-up — 14 stories: kid-UX hints, config lift, dead-code cleanup, pickRung test coverage, WebP migration, splash-screen redesign, arcade modes → 12 questions, cross-game max-score calibration, Phaser-chunk cache headers. Absorbed the former sprints 2.3 + 3.5-story-7a. | In Progress (started 2026-05-22) |
| [2.2.2](phase-2/2.2.2-fraction-math-types.md) | Fraction math types — "Add Fractions" + "Subtract Fractions", available in all three games, content scales by difficulty (Easy = like fractions, Medium = mixed numbers, Hard = unlike fractions). First math types with non-integer answers; first generators that vary output by the Speed setting. | Planned |

## Phase 3 — backend + accounts

| ID | Title | Status |
| --- | --- | --- |
| 3.1 | Express API for high scores (`POST /scores`, `GET /scores/top`) | Planned |
| 3.2 | `ApiScoreStore` implementation, swap at boot | Planned |
| 3.3 | Account login (Microsoft / Google OAuth) | Planned |
| 3.4 | Profile / per-user history | Planned |
| [3.5](phase-3/3.5-azure-deployment.md) | Azure deployment (Bicep infra, GitHub Actions, App Service for Containers, custom domain, App Insights, runbook) | Planned |

## Phase 4 — audio

| ID | Title | Status |
| --- | --- | --- |
| 4.1 | Audio engine (Howler or Phaser sound), settings (mute, volume) | Planned |
| 4.2 | UI sounds (menu, button, transition) | Planned |
| 4.3 | Game sounds (fire, correct, wrong, alien-land) | Planned |
| 4.4 | Background music (menu loop, gameplay loop) | Planned |
