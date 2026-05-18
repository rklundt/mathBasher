# mathBasher — Developer Guide

A high-level orientation to the project for engineers and tech leads. Read this first; the code and inline comments are the source of truth for detail.

---

## Dev environment setup

Get from a fresh clone to a running app in under five minutes.

### 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | 20.0.0 or newer | LTS recommended; verify with `node --version` |
| **pnpm** | 9.x (project pins `9.15.0`) | Install via Corepack (preferred) or globally via npm |
| **Git** | any recent | for cloning |
| **Docker** | 24+ (optional) | only needed if you want to build the production image locally |

#### Install pnpm via Corepack (preferred — bundled with Node 20)

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm --version          # should print 9.15.0
```

#### Or install pnpm globally via npm

```bash
npm install -g pnpm@9.15.0
pnpm --version
```

### 2. Clone and install

```bash
git clone https://github.com/rklundt/mathBasher.git
cd mathBasher
pnpm install
```

The install is **fully self-contained** — both `node_modules/` and the pnpm content store (`.pnpm-store/`) live inside the project root, gitignored and dockerignored. Cloning to a USB stick or a brand-new machine produces an identical install regardless of any pre-existing global pnpm cache.

> 📦 **First install is large (~2.3GB on disk).** Phaser ships its full source in the npm package, which dominates the size. The production Docker image is unaffected — only `dist/` and `server/dist/` reach the runtime stage. See "Build, run, test" below for production builds.

### 3. Run the app

```bash
pnpm dev                 # Vite dev server with HMR (default http://localhost:5173)
```

Open the printed URL. You should see the Phaser canvas with `mathBasher` centered on a deep-space background and the AGPL §7(b) attribution footer along the bottom edge.

### 4. (Optional) Configure `.env`

The app runs fine without an `.env` file — defaults work for local development. You only need one if you want to override the public source URL shown in the attribution footer or wire Application Insights locally:

```bash
# macOS / Linux
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Then edit `.env` to set:
- `VITE_SOURCE_URL` — the public URL of this repo for the in-app attribution link (default placeholder is intentionally invalid so misconfigured deploys surface immediately)
- `APPINSIGHTS_CONNECTION_STRING` — optional; without it, telemetry falls back to console logging
- `PORT` — only relevant for `pnpm start` (production-style server); defaults to 8080
- `BUILD_HASH` — set by CI; locally defaults to `dev`

### 5. Run the test suite

```bash
pnpm typecheck           # tsc strict-mode check (client + server), no emit
pnpm test                # Vitest suite once
pnpm test:watch          # Vitest watch mode for tight iteration
```

### 6. Production-style local run (optional)

```bash
pnpm build               # builds client (Vite -> dist/) AND server (tsc -> server/dist/)
pnpm start               # node serves both on http://localhost:8080
```

The Express server reads `PORT` from env (default 8080), binds `0.0.0.0`, exposes `/health` for container probes, and handles SIGTERM/SIGINT gracefully. Try `PORT=9000 pnpm start` to confirm the env-port contract works end-to-end.

### 7. (Optional) Build the Docker image

```bash
docker build -t mathbasher .
docker run --rm -p 8080:8080 mathbasher
```

Multi-stage build using `node:20-alpine` for both stages. Final image runs as the non-root `node` user, exposes port 8080, and includes a `HEALTHCHECK` against `/health`. Ships `LICENSE`, `NOTICE`, `README.md` for AGPL distribution compliance. Should weigh in well under 200MB.

### Common first-run gotchas

| Symptom | Likely cause | Fix |
|---|---|---|
| `EADDRINUSE` on port 8080 from `pnpm start` | another process on 8080 | `PORT=9000 pnpm start` (the server logs a friendly message and the new port) |
| `pnpm: command not found` | Corepack not enabled OR no global install | re-run the Corepack steps in §1 |
| Vite dev server picks a random port instead of 5173 | `strictPort: true` should prevent this — likely 5173 already in use | kill the process holding 5173 |
| `cp` not found on Windows | git-bash isn't always on PATH | use `Copy-Item .env.example .env` in PowerShell |
| Install pulls down 2.3GB | normal — Phaser is large (see size note above) | be patient on first install |

---

## What this project is

A **browser-based math game for kids**, modeled on the arcade-shooter feel of the classic *Math Blaster*. Aliens descend from the top of the screen carrying possible answers; the player times a fire button to hit the right one before the aliens reach the hero. It runs in any modern browser, is mobile-friendly in landscape, and is built so that **adding a new math difficulty or a new game mode means adding files, not changing the engine**.

## Core principles

1. **Configurable, not hard-coded.** Every gameplay number (descent speed, scoring multiplier, pass threshold, fire cooldown) lives in one config file. Balancing the game is editing numbers, not hunting through code.
2. **Modular by interface boundary.** The math engine, score store, audio manager, and rendering layer are separated by clear TypeScript interfaces. New math types = new generator file. New score backend = new `IScoreStore` implementation.
3. **Mobile-first.** Layouts assume landscape phone before they assume desktop. Touch controls are first-class.
4. **Kid-friendly feedback.** Wrong answers don't end the round. The hero respawns instantly. Round-level pass/fail is fair (70%) and clear.
5. **Polished without custom art.** Free CC0 sprite packs (Kenney.nl) plus the rendering engine's built-in particle/tween/shader effects.
6. **Future-proofed for accounts.** Session-only high scores in v1, behind an interface that supports a real backend later.

## What it is NOT

- Not a curriculum or learning management system
- Not a homework tracker or grade book
- Not a substitute for classroom math instruction
- Not a behavior management tool
- Not a place that shames wrong answers

---

## Architecture at a glance

```
+----------------------------------------------------------+
|  Browser (Vite-built static bundle)                      |
|                                                          |
|   +-----------+   +----------+   +---------+   +-----+   |
|   |  scenes   |<->| entities |<->| systems |<->| UI  |   |
|   +-----------+   +----------+   +---------+   +-----+   |
|        |                                                 |
|        v                                                 |
|   +-----------+   +----------+   +-----------+           |
|   |   math    |   | services |   |   core    |           |
|   | (pure TS) |   | (pure TS)|   | (config + |           |
|   +-----------+   +----------+   |telemetry +|           |
|                                  | constants)|           |
|                                  +-----------+           |
+--------------------|-------------------------------------+
                     |  HTTP
                     v
+----------------------------------------------------------+
|  Express server (Node 20)                                |
|                                                          |
|  - Serves /dist as static                                |
|  - GET /health for container probes                      |
|  - Future: API routes for persisted scores, accounts     |
+----------------------------------------------------------+
                     |
                     v  (production only)
+----------------------------------------------------------+
|  Single Linux container -> Azure App Service             |
|  (multi-stage Docker build, runs as non-root)            |
+----------------------------------------------------------+
```

Single repo, single deployable. The browser side and the server side share the same TypeScript toolchain and a single `package.json`.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Build | Vite + TypeScript (strict, project references) | Fast HMR; strict typing matches the team's .NET background |
| Rendering | Phaser 3 | 2D arcade-game framework; scene system, sprites, input, scaling, audio all in one |
| UI | All Phaser scenes (no React) | One engine to reason about; consistent feel mobile↔desktop |
| State (cross-scene) | Plain TS singleton modules | No state library needed at this scale |
| Math | Pure TypeScript modules | No Phaser imports — unit-testable in isolation |
| Server | Express on Node 20 (ESM) | Tiny stub today; ready for API routes when accounts ship |
| Tests | Vitest | Co-located `*.test.ts` files; seeded RNGs for determinism |
| Container | Multi-stage Docker, `node:20-alpine` | Lean runtime, runs as non-root user |
| Deployment target | Azure App Service for Containers (Linux) | Mature, slot-swap blue/green, free managed TLS |
| Package manager | **pnpm 9** (Corepack-pinned) | Fast, deterministic, lockfile-enforced |

See `docs/adrs/` for the reasoning behind each major decision.

---

## Project layout (what lives where)

```
mathBasher/
├── README.md            run-locally instructions, license summary
├── DeveloperGuide.md    this file
├── LICENSE              GNU Affero General Public License v3
├── NOTICE               attribution clauses + AGPL §7(b) UI requirement
├── COMMERCIAL.md        commercial-license inquiry process
├── CONTRIBUTING.md      contribution workflow (CLA mechanism pending)
├── CODE_OF_CONDUCT.md   Contributor Covenant 2.1
├── SECURITY.md          vulnerability reporting flow
├── VERSIONS.md          changelog (Keep-a-Changelog format)
│
├── package.json         single package.json for client + server
├── pnpm-lock.yaml       deterministic dep tree (committed)
├── .npmrc               pnpm config: hoisted layout + LOCAL store
├── tsconfig.*.json      project-references split: app, server, node
├── vite.config.ts       Vite build settings (incl. @/* path alias)
├── vitest.config.ts     test runner config (node env, @ alias mirrored)
├── Dockerfile           multi-stage build for Azure deployment
├── .dockerignore        keeps secrets/internal artifacts out of image
├── .env.example         documents PORT, BUILD_HASH, APPINSIGHTS, SOURCE_URL
│
├── index.html           Vite entry HTML (splash overlay + canvas mount)
│
├── src/                 BROWSER-SIDE TYPESCRIPT
│   ├── main.ts          thin entry; wires splash click handler → calls bootGame()
│   ├── main.test.ts     static contract tests: main.ts has no Phaser import; boot.ts has no top-level Phaser.Game
│   ├── app/             top-of-graph orchestration (composes core + services + game/scenes)
│   │   └── boot.ts      bootGame() — constructs Phaser.Game inside the splash gesture
│   ├── game/            rendering layer (the only folder that imports phaser)
│   │   ├── scenes/      Boot, Menu, GameSelect, Difficulty, Game, Hud, GameOver, PauseOverlay,
│   │   │                Settings, Attribution, Background (parallax stars + nebula behind everything)
│   │   │                (sceneSetup.ts — shared lifecycle helper for owning scenes)
│   │   ├── entities/    Hero, Alien, Projectile (sprites with animation state)
│   │   ├── systems/     WaveSystem, InputSystem, HitSystem, waveKinematics (own state, no rendering)
│   │   │                (waveKinematics is pure — has __tests__/ alongside)
│   │   ├── services/    Phaser-coupled services (pure facades live in /src/services/)
│   │   │   └── PhaserAudioManager.ts  scene-bound audio playback + loop tracking
│   │   └── ui/          PlaceholderButton, IconButton, KeyboardNavigator, EscBackHandler,
│   │                    TouchFireButton (on-screen fire btn for touch devices),
│   │                    MenuLayout (+ pure menuLayoutGeometry.ts), typography, uiPalette
│   ├── math/            PURE TS — math content (no DOM, no engine imports)
│   │   ├── types.ts             Question and QuestionGenerator interfaces
│   │   ├── distractors.ts       distractor-picking helpers
│   │   ├── registry.ts          map of MathId -> generator (real or stub)
│   │   └── generators/          one file per math difficulty
│   │       └── addTo10.ts
│   ├── services/        PURE TS — cross-cutting concerns (no engine imports)
│   │   ├── IScoreStore.ts        interface for high-score backends (ScoreEntry, ScoreFilter)
│   │   ├── SessionScoreStore.ts  in-memory implementation (v1; session-only by design)
│   │   ├── scoreStoreFactory.ts  createScoreStore() — single call site for which store to use
│   │   ├── ScoreCalculator.ts    round scoring logic (per-question outcomes -> score, stars, pass)
│   │   ├── AudioManager.ts       audio facade — pure TS, mute persistence, volume cap
│   │   ├── audioManagerFactory.ts createAudioManager() — single instance per page
│   │   └── Settings.ts           cross-scene selection state
│   └── core/            shared building blocks (other folders depend on this)
│       ├── config.ts            *the* gameplay tuning knobs (ALL of them)
│       ├── telemetry.ts         _th.logToAi(...) helper, console fallback
│       ├── attribution.ts       AGPL §7(b) UI text — single source of truth
│       ├── sceneKeys.ts         scene identifier constants
│       ├── audioKeys.ts         audio asset keys + sfxPath() URL helper + AUDIO_MANIFEST
│       ├── spriteKeys.ts        sprite asset keys per-kind (alien batches, hero ships,
│       │                        UI 9-slice, particles, bg) + SPRITE_MANIFEST + tier picker
│       └── SCALE.md             canvas scaling strategy doc (FIT + 1280×720 + landscape lock)
│
├── public/              static assets served as-is by Vite
│   └── assets/          CREDITS.md attribution ledger
│       ├── audio/       shipped MP3s (sfx/, music/, midground/) — see scripts/audio/
│       └── sprites/     shipped PNGs/WebPs by kind (aliens/{128,192}/, hero/, ui/, particles/, bg/)
│                        — see scripts/sprites/
│
├── scripts/             developer tooling (NOT shipped, NOT bundled)
│   ├── audio/                   audio processing (encode, probe)
│   │   ├── encode.mjs           one-pass trim + loudnorm + MP3 encode
│   │   └── probe.mjs            inspect a file (duration, channels, peak/mean dB)
│   └── sprites/                 sprite processing (single-PNG + video-extract pipelines)
│       ├── process.mjs          one-pass resize + palette + strip metadata + PNG re-encode
│       ├── probe.mjs            inspect a sprite file (dimensions, alpha, format, metadata)
│       └── extract-from-video.mjs  video → per-cell WebP spritesheets (R×C grid extraction)
│
├── .audio-source/       gitignored — raw audio (WAV/FLAC) + working cuts
│   └── README.md        the only tracked file in here
│
├── .sprite-source/      gitignored — raw sprite inputs (Kenney packs, Midjourney outputs)
│   ├── README.md        the only tracked file in here
│   └── working/         (gitignored too) — preview HTMLs + verify-grid intermediates
│
├── server/              EXPRESS SERVER for production
│   ├── src/
│   │   ├── index.ts             bootstraps Express; PORT-from-env, /health, SIGTERM
│   │   ├── telemetry.ts         server-side _th, mirrors browser shape
│   │   └── routes/
│   │       └── health.ts        GET /health (sub-100ms, no async work)
│   └── dist/                    compiled output (not committed)
│
├── dist/                Vite client build output (not committed)
│
├── docs/
│   └── adrs/            Architecture Decision Records
│       ├── README.md            ADR index + format
│       └── ADR-XXXX-*.md        one ADR per significant decision
│
└── .github/             repo metadata GitHub recognizes
    └── (workflow files added when CI/CD lands)
```

### Folder discipline (enforced)

- **`src/game/`** — the only folder that imports `phaser`. Visual concerns only.
- **`src/math/`** — pure TypeScript. No Phaser, no DOM, no `window`.
- **`src/services/`** — pure TypeScript. No Phaser. May read `localStorage`.
- **`src/core/`** — types and `config.ts`. No imports from `/game`, `/math`, or `/services` (it's at the bottom of the dependency arrow).
- **`server/`** — Express server. No imports from `/src/game`. May import from `/src/math` and `/src/services` if pure.

These boundaries are checked at every code review. Adding a Phaser import to `/src/math/` is a hard violation.

---

## Conventions you'll see throughout

### The central config file

`src/core/config.ts` is the single source of every gameplay knob:

```ts
config.round.questionsPerRound        // 20
config.round.passingCorrect           // 14
config.round.starThresholds           // [14, 17, 19]
config.scoring.basePerCorrect         // 100
config.scoring.afterWrongShotMultiplier // 0.5
config.scoring.mathDifficulty['add-to-10']  // 1.0 multiplier
config.scoring.speed.medium.descentPxPerSec // 60
config.hero.runSpeedPxPerSec          // 220
config.hero.fireCooldownMs            // 200
config.layout.targetLanes             // 4
```

**Code reads from `config`. Magic numbers in code are flagged at review.** Adding a new math type is a new key in `config.scoring.mathDifficulty` plus a new generator file — no engine changes.

### Telemetry pattern

Every meaningful action goes through one helper:

```ts
const dict: Record<string, string> = {};
dict['gameId'] = 'alien-shoot';
dict['mathId'] = 'add-to-10';
_th.logToAi('RoundStarted', SeverityLevel.Information, dict);
```

Browser and server use the same shape (different `cloudRoleName`). The helper falls back to structured `console.log` in dev when no Application Insights connection string is configured. Reserved property names are documented in `src/core/telemetry.ts`.

### Method-level entry/exit logging

Non-trivial functions log `Started` and `Completed` at the start and end of their work, with the same dict on both:

```ts
function startRound(mathId: string, speed: SpeedKey): void {
  const dict = { mathId, speed };
  _th.logToAi('startRound Started', SeverityLevel.Information, dict);
  // ... work ...
  _th.logToAi('startRound Completed', SeverityLevel.Information, dict);
}
```

### License header on every source file

```ts
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md
```

(HTML and shell files use the comment syntax of their host language.)

### Naming

- Classes / scenes: PascalCase (`GameScene`, `Hero`, `WaveSystem`)
- Value modules: camelCase (`addTo10.ts`, `distractors.ts`)
- Tests: co-located `*.test.ts` next to the source
- Scenes carry a `static readonly key` so other code refers to them by typed constant, not stringly typed

---

## Build, run, test — quick reference

(Full setup is in [Dev environment setup](#dev-environment-setup) at the top.)

| Command | What it does |
|---|---|
| `pnpm install` | Install deps into local `node_modules` and `.pnpm-store` |
| `pnpm dev` | Vite dev server with HMR (default `http://localhost:5173`) |
| `pnpm build` | Build client (Vite → `dist/`) and server (tsc → `server/dist/`) |
| `pnpm start` | Run the Express server against the built assets (port 8080 by default) |
| `pnpm test` | Run the Vitest suite once |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:coverage` | Vitest with v8 coverage; HTML report at `coverage/index.html` |
| `pnpm typecheck` | tsc strict-mode check, no emit (client + server) |
| `pnpm audio:encode <in> <out> [--kind sfx\|music] [--no-trim]` | Encode raw audio (WAV/FLAC) → properly trimmed, loudness-normalized, metadata-stripped MP3. SFX profile = 96 kbps mono; music = 160 kbps stereo. |
| `pnpm audio:probe <file>` | Inspect an audio file: duration, sample rate, channels, mean/peak dB. Use to sanity-check encode output. |

---

## Audio

mathBasher ships only **MP3** in `public/assets/audio/`, organized into three folders by kind:

| Kind | Folder | What lives here | Encoder profile | Volume slider |
|---|---|---|---|---|
| `sfx` | `public/assets/audio/sfx/` | One-shot effects (fire, hit, click) | 96 kbps mono, -16 LUFS, trim ON | sfx (default 70%) |
| `midground` | `public/assets/audio/midground/` | Atmospheric LOOPS that sit under SFX (skittering, ambient hum) | 96 kbps mono, -22 LUFS, trim **OFF** by default (loop boundaries) | midground (default 40%) |
| `music` | `public/assets/audio/music/` | Full musical loops/tracks (menu music, gameplay loops) | 160 kbps stereo, -18 LUFS, trim ON | music (default 50%) |

Every shipped file goes through `pnpm audio:encode --kind <sfx|midground|music>`, which runs one ffmpeg pass that:

1. (For sfx + music; not midground) trims leading + trailing silence
2. Loudness-normalizes to the kind's EBU R128 target (with -1.5 dBTP shared true-peak ceiling — kid-safe, never blast-loud)
3. Strips ALL metadata (no leaked generator names, prompts, or timestamps)
4. Brick-wall limits peaks (alimiter `level=disabled`, limit 0.7 ≈ -3.1 dBFS, gives ~1.6 dB MP3-reconstruction headroom)
5. Encodes to the kind's MP3 profile

Per-kind volumes (0–100%) plus the master mute toggle are controlled from **SettingsScene** (reachable from MenuScene and from PauseOverlay). Volumes persist to `localStorage` per kind. Mute overrides every slider.

The ffmpeg binary is supplied by the `ffmpeg-static` devDependency (no manual install needed; `pnpm install` provisions it; see [ADR-0008](docs/adrs/ADR-0008-ffmpeg-static-as-dev-dependency.md) for the supply-chain reasoning and the `pnpm.onlyBuiltDependencies` allowlist that guards postinstall scripts).

### Workflow

```
1. Drop raw audio in .audio-source/raw/<topic>/<name>.wav   (gitignored)
2. pnpm audio:probe .audio-source/raw/<topic>/<name>.wav    (sanity-check input)
3. pnpm audio:encode .audio-source/raw/<topic>/<name>.wav public/assets/audio/sfx/<name>.mp3
4. pnpm audio:probe public/assets/audio/sfx/<name>.mp3      (verify output is in spec)
5. Add a CREDITS.md entry for the new file (license, source, attribution)
6. Commit the .mp3 and the CREDITS.md edit
```

The raw WAV in `.audio-source/raw/` stays on disk locally for re-processing but never enters git (the `.gitignore` patterns `.audio-source/*` plus `*.wav`/`*.aif`/`*.aiff`/`*.flac` keep raw audio out of the repo regardless of where it sits).

### When NOT to use the script

- **The file is already an MP3 at the right profile, normalized, trimmed, and metadata-stripped.** Then yes, drop it directly into `public/assets/audio/<kind>/`. In practice, this almost never happens — generator outputs almost always benefit from at least the encode + normalize + strip-metadata pass.

---

## Asset scoping (lazy per-game loading)

Added in sprint 2.1.6. Boot transfer used to be ~5.5 MB because BootScene loaded every asset the game might ever need before the splash dismissed. With multiple game modes that didn't scale — each new mode (2.2 Number Climb, future) compounded the boot load even though no single play session uses all of it.

Now each asset declares a **scope** that says when it should be loaded:

| Scope | Loaded when | Examples |
|---|---|---|
| `'eager'` | `BootScene.preload` | Splash bg, UI 9-slice, parallax stars, nebula bg |
| `'always'` | `BootScene.preload` (semantic distinction from eager — "every game uses this") | Hit/wrong SFX, button-click, fire SFX |
| `'game:alien-shoot'` | First time the player picks Alien Shoot | 45 alien spritesheets, speeder hero ships |
| `'game:asteroid-field'` | First time the player picks Asteroid Field | 8 asteroid rocks, 3 asteroid-hero ships, `loop-3` music, `timeout-fail-1` SFX |

The scope taxonomy lives in `src/core/assetScope.ts`. The `AssetScope` type uses a TypeScript template literal (`'eager' | 'always' | `game:${GameId}``), so adding a new GameId automatically widens the scope union — TypeScript flags any switch that forgets to handle the new game mode.

### How to add a new per-game asset

1. Add the file under `public/assets/...` via the audio / sprite pipeline.
2. Add the key to the appropriate `Keys` const (e.g. `MusicKeys.Loop4: 'loop-4'`).
3. In the manifest (`SPRITE_MANIFEST` / `AUDIO_MANIFEST`), tag the entry's `scope` field — `'eager'` for shared assets, `'game:<id>'` for per-game.
4. For audio, the per-key scope resolver is `audioScopeFor(key)` in `audioKeys.ts` — add a row there if your asset is per-game.
5. Run `pnpm dev`. First pick of the relevant game loads the new asset with a brief progress bar; subsequent picks are instant (Phaser cache hits).

### How to add a new game mode

Adding a third game (e.g. 2.2 Number Climb) requires:

1. Extend `GameId` in `src/services/Settings.ts`: `'alien-shoot' | 'asteroid-field' | 'number-climb'`. TypeScript exhaustiveness on `Record<GameId, ...>` will now flag every existing map (GAME_BG_MAP, GAME_MUSIC_MAP) that doesn't handle the new value.
2. Map the new game's bg + music in those records.
3. The new scene's `preload()` calls `loadGameBundle(this, this.gameId)` + `attachLoadingOverlay({ scene: this, caption: 'Loading Number Climb…' })`. Mirrors the pattern in `GameScene.preload()` / `AsteroidFieldScene.preload()`.
4. Tag the new game's assets with `'game:number-climb'` scope in the manifests.

That's it — boot load stays at ~2 MB regardless of how many games exist.

### Loader-error handling

Phaser's `loaderror` event (one per failed file — network blip, 404, CORS) is wired in `LoadingOverlay`. Behavior:

- Each failure logs an `AssetLoader.fileError` telemetry event at `Error` severity with the failed key + URL in the `reason` field.
- When the loader settles, if any files failed, a "Trouble loading. Tap to retry." overlay appears. Tapping restarts the scene; Phaser's cache keeps successful loads, so only the failed files re-fetch.

---

## License model

mathBasher is **dual-licensed**:

1. **GNU Affero General Public License v3 or later (AGPL-3.0-or-later)** — the default. Anyone may use, modify, and redistribute under the AGPL terms, **including** the AGPL §7(b) requirement that the running app prominently display the project's attribution notice with a link to the corresponding source.
2. **Commercial license** — available from the copyright holder. Waives both the AGPL copyleft AND the §7(b) UI attribution requirement. See `COMMERCIAL.md` for the inquiry process.

The single source of truth for the UI attribution text is `src/core/attribution.ts`. The `AttributionScene` (added when the scene-flow layer lands) reads from there and renders the four-line block as a persistent footer on every interactive scene. The source URL is read from the `VITE_SOURCE_URL` environment variable at build time.

A deliberately invalid placeholder URL (`https://example.invalid/mathbasher`) is used when the env var is unset, so a misconfigured deployment surfaces immediately as a broken link.

---

## Where to look for what

| Question | Read |
|---|---|
| What is this project? | This file (top), README.md |
| How do I run it? | README.md "Run locally" |
| Where do gameplay numbers come from? | `src/core/config.ts` |
| How do I add a new math difficulty? | New file in `src/math/generators/`, register in `src/math/registry.ts`, add multiplier to `config.ts` |
| How do I add a new scene? | `src/game/scenes/<Name>Scene.ts`, register key in `src/core/sceneKeys.ts`, add to scene array in `src/main.ts` |
| What's the deployment target? | `docs/adrs/ADR-0007-azure-app-service-for-containers.md` |
| Why no React? | `docs/adrs/ADR-0001-tech-stack.md` |
| Why AGPL+commercial? | `docs/adrs/ADR-0004-agpl-commercial-dual-license.md` |
| Why is sprint id the version? | `docs/adrs/ADR-0005-sprint-id-as-version.md` |
| What runs in production? | `Dockerfile` build stage, `server/src/index.ts` runtime |
| What's the test strategy? | Pure modules in `/math` and `/services` get Vitest tests; gameplay code is verified by manual playtest. Generators inject an RNG (`rng?: () => number`) so tests pin determinism by passing a seeded sequence — see `src/test-utils/mulberry32.ts` |
| How do I add a new scene? | New file in `src/game/scenes/<Name>Scene.ts` extending `Phaser.Scene`; register its key in `src/core/sceneKeys.ts`; add the class to the scene array in `src/main.ts`. Scenes that should render on top of others (HUD, overlays, attribution) are registered LAST. |
| Where does the cross-scene round selection live? | `src/services/Settings.ts` — module-level singleton with `setMathId`/`setSpeed`/`isReady`. Scenes read on `create`. |
| Where is the AGPL §7(b) attribution display implemented? | `src/game/scenes/AttributionScene.ts` (the persistent parallel scene) reads from `src/core/attribution.ts` (the single source of truth for the four-line text). The scene is launched once by BootScene and never stopped. |
| How does a question round play out? | `src/game/scenes/GameScene.ts` is the round loop: `startNextQuestion()` calls into the math registry to get a `Question`, `WaveSystem.spawnWave(q)` creates one alien per lane carrying the choices, `update(dt)` advances the hero/aliens/projectile, `HitSystem.findHit(...)` runs every frame against the active projectile. Branches: correct shot → record + advance, wrong shot → `WaveSystem.applyWrongShotPenalty()` and continue, alien reaches hero → record `wasCorrect: false` and advance. After 20 questions, `endRound()` transitions to GameOverScene. |
| Where is the wrong-shot speed penalty? | `src/game/systems/WaveSystem.ts#applyWrongShotPenalty` — idempotent, boosts every live alien to `config.scoring.speed[speed].penaltyPxPerSec`. Also flags `usedWrongShot: true` for `ScoreCalculator` so the eventual correct answer awards half points. |
| Where is the per-frame collision check? | `src/game/systems/HitSystem.ts#findHit(projectile, aliens)` — pure helper using AABB intersect. No Phaser physics body needed at this scale (one projectile vs four aliens). Returns the hit alien or `null`. |
| How is fire input wired? | `src/game/systems/InputSystem.ts` listens for keyboard Space, mouse pointerdown, and touch pointerdown — all converge into a single `'fire'` callback gated by `config.hero.fireCooldownMs`. The on-screen TouchFireButton (mobile sprint) calls `InputSystem.fire()` directly to bypass the canvas-wide pointer listener. |
| How are scores shared across rounds? | `src/services/scoreStoreFactory.ts` memoizes a single `IScoreStore` instance per page. `src/main.ts` calls `createScoreStore()` once at app boot to initialize it; `GameOverScene` calls `getScoreStore()` and gets the same one — so `bestForCombo()` reflects scores from earlier rounds in the same session. |
| How is the test strategy split? | Vitest covers pure logic (`src/math/`, `src/services/`); Phaser-coupled gameplay code is verified by the manual playtest in `src/game/PLAYTEST.md`. Run that checklist before every gameplay-touching sprint closes. |
| How is scoring computed? | `src/services/ScoreCalculator.ts` — construct with `(mathId, speed)`, feed it per-question outcomes via `recordOutcome()`, then read `score` / `correctCount` / `passed` / `stars` getters at round end. All multipliers come from `src/core/config.ts`. |
| How do I add a new score backend? | Implement `IScoreStore` (in `src/services/`), then change the single line in `src/services/scoreStoreFactory.ts` to return your new instance. No game code changes. |
| How does pause / Esc / Quit-to-Menu work mid-round? | Esc and the on-screen Pause icon (top-right of `HudScene`) both call into `HudScene.openPauseOverlay()`, which calls `GameScene.pause()` (freezes WaveSystem, gates InputSystem fire, pauses tweens, pauses HudScene) and launches `PauseOverlay` (parallel scene). Resume and Quit-to-Menu callbacks are passed in via `init` data. Quit fires `RoundAbandoned` telemetry and routes to `MenuScene` without saving the score. |
| Where is the Esc back-stack on menu scenes? | `src/game/ui/EscBackHandler.ts#wireEscBack(scene, onBack)` — small helper that registers a `keydown-ESC` handler with paired cleanup on `shutdown` + `destroy`. Used by `GameSelectScene` (→ Menu), `DifficultyScene` (→ GameSelect), `GameOverScene` (→ Menu). MenuScene is the top of the stack — Esc is intentionally not bound there. |
| Where is the pause-aware kinematics math? | `src/game/systems/waveKinematics.ts` — pure module exporting `advanceY(currentY, dt, speedPxPerSec)` and `simulatePauseAwareAdvance(...)`. Used by `Alien.advance` for production motion, and by `src/game/systems/__tests__/waveKinematics.test.ts` for verifying that pause freezes Y and resume continues from the same position with no drift. |
| How do I prepare a new audio file? | See the **Audio** section above. Short version: drop raw WAV in `.audio-source/raw/<topic>/`, run `pnpm audio:encode <in> public/assets/audio/sfx/<name>.mp3`, run `pnpm audio:probe` on both ends to sanity-check, add a `public/assets/CREDITS.md` line. The encoder lives at `scripts/audio/encode.mjs`; the supply-chain reasoning for `ffmpeg-static` is in [ADR-0008](docs/adrs/ADR-0008-ffmpeg-static-as-dev-dependency.md). |
| How does audio playback flow at runtime? | `BootScene.preload` loads each MP3 into Phaser's audio cache by key (`AudioKeys.Fire1`, `MidgroundKeys.Skittering1`, `MusicKeys.Loop1`, etc.). On the user's first `Start` click in `MenuScene`, `getAudioManager().init(scene)` binds the singleton to a Phaser scene (must happen inside a user-gesture handler — iOS Safari blocks WebAudioContext creation outside one). One-shot SFX use `audio.play(key, kind)` — defaults to `'sfx'` kind, multiplied by the kind's slider value. Loops use `audio.playLoop(key, kind)` returning a handle the caller passes to `stopLoop` later. Missing keys log a Warning and return silently — never throw into the gameplay loop. |
| Where does the mute + per-kind volume state live? | `AudioManager` (the pure facade) holds in-memory copies of `muted` and three per-kind volumes (`sfx` / `midground` / `music`). Each is persisted to `localStorage` under the keys `mathbasher.audio.muted`, `mathbasher.audio.volume.sfx`, `mathbasher.audio.volume.midground`, `mathbasher.audio.volume.music`. Read at AudioManager construction (in `main.ts` at app boot), written on every `setMuted` / `setVolume` call. Defaults if storage is empty: `DEFAULT_VOLUMES = { sfx: 70, midground: 40, music: 50 }`. The HUD mute icon (`HudScene.createMuteButton`) reads `audio.isMuted()`; SettingsScene reads `audio.getVolume(kind)` per row. |
| How does the mute-master rule work? | When `isMuted()` is true, `effectiveVolume01(kind)` returns 0 regardless of slider position. Sliders themselves are NOT auto-zeroed on mute — they keep their pre-mute values. Mute applies live to active loops too: `onMuteChanged` walks every tracked loop and re-applies its effective volume (drops to 0 muted, restores to slider value unmuted). Loops keep PLAYING through mute (no hard stop+restart cycle), they just go silent. |
| How does live volume reactivity work? | When SettingsScene calls `audio.setVolume(kind, n)`, the `onVolumeChanged` hook fires. `PhaserAudioManager` overrides it to walk every active loop OF THAT KIND and call `setVolume(effectiveVolume01)` on the underlying Phaser `Sound`. Other kinds' loops are untouched. Net effect: the kid moving a slider mid-round hears the change immediately; no stop+restart click. |
| Where does the loop API live? | `AudioManager.playLoop(key, kind): LoopHandle` / `stopLoop(handle)` / `pauseAllLoops()` / `resumeAllLoops()`. `LoopHandle = string` (the asset key). Base class is no-op stubs; `PhaserAudioManager` tracks active loops in `Map<key, {kind, sound}>`. One loop per key — calling `playLoop` on an already-looping key returns the existing handle. `GameScene.create()` starts the music + skittering loops; `GameScene.cleanup()` stops them. `GameScene.pause()` / `resume()` call `pauseAllLoops` / `resumeAllLoops` for in-round freeze. |
| How is SettingsScene reached from two entry points? | SettingsScene is a parallel scene launched (not started) with `init({ onBack })`. The caller supplies the close behavior. From **MenuScene**, the Settings button calls `this.scene.launch(SceneKeys.Settings, { onBack: () => this.scene.stop(SceneKeys.Settings) })` — Menu was never stopped, so it reappears underneath when Settings closes. From **PauseOverlay** the same pattern, but the pause overlay stays underneath; gameplay stays paused (only the explicit Resume button resumes). SettingsScene knows nothing about its caller — it just calls `onBack` when done. Esc on SettingsScene also calls `onBack` via the existing `wireEscBack` helper. |
| Why is AudioManager split into two files? | Folder discipline. `src/services/AudioManager.ts` is the pure-TS facade (no Phaser import) — unit-testable, callable from anywhere. `src/game/services/PhaserAudioManager.ts` is the Phaser-coupled implementation that actually drives WebAudio + tracks loops. `src/services/audioManagerFactory.ts` returns the concrete subclass while exposing the pure facade type, same pattern as `IScoreStore` / `SessionScoreStore` / `scoreStoreFactory`. |
| Why does the audio init happen in MenuScene, not BootScene? | iOS Safari blocks `WebAudioContext` creation/resumption outside a user-gesture handler. `init()` from BootScene works on Chrome and Firefox but silently fails on iOS, leaving the kid pressing fire forever in silence. Wiring `init()` to the first Start-button click is the canonical fix. Asset preload is fine in BootScene (no audio context needed); only the live binding has to happen inside a gesture. (As of v0.5.4 the click-to-start splash provides an even earlier user-gesture moment, but MenuScene's `init()` call stays as defense-in-depth.) |
| How does the boot sequence work? | The page loads `index.html` which renders a splash overlay (`<div id="splash">` with title + Tap-to-play button). `src/main.ts` runs at module load but ONLY wires the splash button's click handler — `Phaser.Game` construction is deferred. On click, the `startGame()` function constructs the AudioManager singleton, then `new Phaser.Game(...)` (this is when the AudioContext is created, inside a user-gesture context — eliminates the browser's `AudioContext was prevented from starting automatically` warning), then hides the splash. BootScene then runs for ~250ms (no title text — splash already showed it), launches AttributionScene in parallel, transitions to MenuScene. A static contract test in `src/main.test.ts` enforces that `new Phaser.Game(` never appears at top level. |
| Where do button click sounds play? | `PlaceholderButton.playClickSfx()` calls `getAudioManager().play(SfxKeys.ButtonClick1, 'sfx')` from BOTH the pointerdown handler AND the `activate()` keyboard path. The two HUD icon buttons (Pause + Mute) are not PlaceholderButtons but inline the same call from their pointerdown + activate paths. Disabled buttons skip the sound (the click handler short-circuits). Volume rides on the SFX slider; master mute silences. Edge case: clicking the Mute icon to UNMUTE produces no click sound (audio is muted at the moment of activation); the visual state change is the confirmation. |
| What's the `?autostart` URL param? | Dev convenience. `http://localhost:5173/?autostart` skips the splash and boots Phaser directly — same code path as the click handler, just triggered immediately on page load. Saves a click on every HMR reload during heavy iteration. Production users never see this param. |
| Where does Phaser get constructed? | `src/app/boot.ts` exports `bootGame()`, called from `src/main.ts` inside the splash button's click handler (or via `?autostart`). `main.ts` itself does NOT import Phaser — that contract is enforced by a static test in `main.test.ts`. The pre-0.5.5 model put the construction directly in `main.ts`; the boot logic was extracted into its own module so future Phase 1 mobile concerns (orientation gate, asset-preload progress bar, WebAudio fallback) can land in one focused file. |
| Where do button colors live? | `src/game/ui/uiPalette.ts` — all button-state hex constants (`SLATE_BG`, `SLATE_HOVER`, `BORDER_GREY`, `FOCUS_BLUE`, `SELECTED_AMBER`, `DISABLED_BG`, plus the warm-amber `MUTE_ICON_BG`/`MUTE_ICON_HOVER` for the HUD mute toggle). `PlaceholderButton`, `IconButton`, and the splash `index.html` CSS all reference these values; CSS is hand-synced (the splash loads before any TS module). A "make all controls higher-contrast for outdoor phone use" change is a 1-file edit. |
| Where do text styles live? | `src/game/ui/typography.ts` — `FONT_FAMILY` constant + named `TEXT_*` color constants + a `text(scene, x, y, str, kind)` helper that picks size + color + weight from a vocabulary of 12 named `TextKind`s (`title`, `h2`, `h3`, `body`, `subtitle`, `prompt`, `accent`, `success`, `warning`, `stars`, `sectionLabel`, `bodyMuted`). Scenes use the helper; one-off sizes inline `{ fontFamily: FONT_FAMILY, ... }` and reference the named color constants. The `'system-ui, sans-serif'` literal appears nowhere outside this file. |
| How do I add a new menu screen? | Extend `Phaser.Scene`, call `setupScene(this)` as the FIRST line of `create()` (logs Started + binds AudioManager + registers shutdown listener for Completed), then use `stackButtons(scene, { centerY, items: [{ label, onClick, kind }] })` from `MenuLayout.ts` to build the button stack. Pass the returned buttons to `new KeyboardNavigator(this, buttons)`. Use `wireEscBack(this, () => this.scene.start(SceneKeys.X))` for Esc back-stack. Register the scene class in `src/app/boot.ts`'s scene array (NOT in `main.ts` anymore) and add its key to `src/core/sceneKeys.ts`. |
| Where do I add a new audio asset? | One line in `src/core/audioKeys.ts` — add the key to `SfxKeys` (or `MidgroundKeys` / `MusicKeys`). The `AUDIO_MANIFEST` const at the bottom of the same file derives URLs programmatically, and `BootScene.preload` iterates the manifest with no per-kind branching. Adding a new sound is a 1-file change; BootScene needs zero edits. |
| How does the canvas scale to different viewports? | `Phaser.Scale.FIT` mode against a fixed 1280×720 (16:9) design canvas — letterboxes anything off-ratio. The page CSS in `index.html` paints body + html in `#0b1020` (matches in-game backdrop) so letterbox bands look intentional. Configured in `src/app/boot.ts` (`scale: { mode: FIT, parent: 'game', expandParent: true, width: 1280, height: 720 }`). Full rationale + when-to-revisit guidance in [`src/core/SCALE.md`](src/core/SCALE.md). RESIZE was deliberately rejected — every entity, HUD position, and gameplay tuning constant is anchored to design-space coordinates; switching to RESIZE would require per-scene layout recomputation for no real win on a fixed-aspect arcade game. |
| How does the portrait-rotate prompt work on phones? | Pure DOM, no Phaser. `index.html` declares `<div id="rotate-overlay">` with the rotate prompt + a CSS-only animated phone glyph. A media query (`@media (orientation: portrait) and (max-width: 900px)`) toggles `display: flex`. The 900px max-width gates it to phone-sized viewports — a desktop user resizing into a portrait window pose isn't pestered. When the kid rotates back to landscape the media query stops matching, the overlay disappears, and `boot.ts` registers an `orientationchange` listener that calls `game.scale.refresh()` belt-and-braces in case a quirky mobile browser (older iOS Safari) doesn't fire a paired resize event. |
| Where does the on-screen FIRE button live? | `src/game/ui/TouchFireButton.ts` — a circular amber button anchored bottom-right, sized for one-handed thumb use in landscape (80px diameter visual + ~108px hit area). Constructed in `GameScene.create`. Visibility gated by touch detection: hidden when `navigator.maxTouchPoints === 0` AND no `touchstart` has ever fired on the page; shown if either flips (so a Surface / Chromebook with both keyboard and touch always gets the button after the first touch). Pointer-down stops event propagation so the canvas-wide tap-to-fire listener in `InputSystem` doesn't double-count, then calls `InputSystem.fire()` (the cooldown still applies — same code path as Space / mouse-click). Positioned ABOVE the AttributionScene footer with 8px clearance — the §7(b) attribution must always remain visible per the AGPL contract. |
| Where does touch input enter the game? | `src/game/systems/InputSystem.ts` is the single funnel. Three input pathways converge: (1) keyboard Space, (2) canvas-wide pointerdown (mouse or touch), (3) `TouchFireButton.onFire` calling `InputSystem.fire()` programmatically. All three pass through the same cooldown gate (`config.hero.fireCooldownMs`). InputSystem is instantiated in `GameScene.create` and destroyed on scene shutdown — it doesn't listen during menus, so a Tab/Enter on a menu button never fires a shot. |
| Where do I add a new sprite asset? | `src/core/spriteKeys.ts` — for **non-alien** kinds (hero/ui/particle/bg/projectile), add the basename to the relevant `*SpriteKeys` const object (e.g. `HeroSpriteKeys.Speeder4 = 'speeder-4'`). `SPRITE_MANIFEST` derives + BootScene auto-preloads. For **alien** batches (multi-frame video extracts), add a row to `ALIEN_SPRITE_BATCHES` (`{ prefix: 'alienN', rows, cols }`) and `ALIEN_SPRITE_KEYS` derives. The shipping pipeline lives in `scripts/sprites/process.mjs` (single PNG) or `scripts/sprites/extract-from-video.mjs` (video grid). Drop raw inputs in `.sprite-source/raw/`. |
| How do I prepare a new sprite file? | `pnpm sprite:process --kind <kind> --name <basename> .sprite-source/raw/<file.png>` for a single PNG (resizes per-kind, palette-quantizes, strips metadata, writes to `public/assets/sprites/<kind-folder>/<basename>.png`). For a video grid: `pnpm sprite:extract --rows R --cols C --margin auto --name-prefix <prefix> .sprite-source/raw/<file.mp4>` (see the sprite-pipeline workflow doc for the V1-V9 interactive flow with verify-grid pause-points). Per-kind size caps + paletting decisions documented in `process.mjs` PROFILES. Supply-chain reasoning for the `sharp` dependency in [ADR-0009](docs/adrs/ADR-0009-sharp-as-dev-dependency.md). |
| Why are alien sprites two-tier? | [ADR-0010](docs/adrs/ADR-0010-sprite-tier-strategy.md) — 128px (phone/tablet) + 192px (desktop/retina). `pickSpriteTier(viewportWidth, devicePixelRatio)` in `src/core/spriteKeys.ts` picks ONE tier at boot from viewport × DPR. Aliens-only; other kinds (hero, ui, etc.) ship single-resolution per their `process.mjs` PROFILE because there's only one of them on screen at a time and the byte savings of tiering aren't worth the loader complexity. |
| Where does the parallax background live? | `src/game/scenes/BackgroundScene.ts` — peer scene launched from BootScene, persists for the page lifetime like AttributionScene. Renders a static `BgSpriteKeys.Nebula` base layer + 3 layers of parallax stars (small/medium/large from particle pack `star_03/05/07`) scrolling downward at different speeds + a bottom-gradient darkening for hero contrast. All scenes (Menu, Game, GameOver, etc.) overlay on top of this one. |
| Why do alien rider sprites have a dark plate behind them? | The alien sprites were extracted against a `#0b1020` matched background (option-C decision from sprint 0.6.3) — their edge pixels and inherent translucency are tinted toward `#0b1020`. Without a matched-color plate behind them, the parallax nebula bleeds through the alien bodies, making them look ghostly. The plate (in `Alien.ts` constructor, between chassis and rider sprite in z-order) is 5 stacked rounded rectangles with feathered alpha — opaque core where the alien body sits, soft feathered top where there's no alien content. Restores the matched-bg compositing context. |
| How does hit feedback work in-game? | Three layered effects on each correct/wrong hit, all in `GameScene.handleHit`: (1) particle burst — `light_01` green-tinted for correct, `spark_05` red-tinted for wrong, additive blend, ~12-15 particles, ~350-400ms lifespan; (2) screen flash (correct only — `cameras.main.flash(120, 34, 197, 94)`); (3) screen shake (wrong only — `cameras.main.shake(150, 0.005)`); (4) one of 3 random SFX variants per outcome via `pickRandomHitCorrectSfx` / `pickRandomHitWrongSfx` from `audioKeys.ts`. Score popup ("+125") spawns at the hit alien's position via the `correctHit` event listened by HudScene. |
| What font does the game use? | Baloo 2 (Google Fonts), loaded via `<link>` in `index.html` with `display=swap` to avoid FOIT. Set as the front of the `FONT_FAMILY` chain in `src/game/ui/typography.ts` with `system-ui, -apple-system, sans-serif` as fallbacks. Every Phaser text element references `FONT_FAMILY` via the `text(...)` helper or inline style — one constant change propagates the font everywhere. |
| What's coming next? | `VERSIONS.md` `[Unreleased]` section |

---

## License

This guide is part of mathBasher and is licensed under the same terms — AGPL-3.0-or-later with the §7(b) UI attribution requirement, or under a separate commercial license. See `LICENSE`, `NOTICE`, and `COMMERCIAL.md`.
