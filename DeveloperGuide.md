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
├── index.html           Vite entry HTML (the canvas mounts here)
│
├── src/                 BROWSER-SIDE TYPESCRIPT
│   ├── main.ts          entry; instantiates the game
│   ├── game/            rendering layer (the only folder that imports phaser)
│   │   ├── scenes/      Boot, Menu, GameSelect, Difficulty, Game, Hud, GameOver, PauseOverlay, Attribution
│   │   ├── entities/    Hero, Alien, Projectile (sprites with animation state)
│   │   ├── systems/     WaveSystem, InputSystem, HitSystem, waveKinematics (own state, no rendering)
│   │   │                (waveKinematics is pure — has __tests__/ alongside)
│   │   ├── services/    Phaser-coupled services (pure facades live in /src/services/)
│   │   │   └── PhaserAudioManager.ts  scene-bound audio playback (extends AudioManager)
│   │   └── ui/          PlaceholderButton, KeyboardNavigator, EscBackHandler, TouchFireButton, etc.
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
│       └── audioKeys.ts         audio asset keys + sfxPath() URL helper
│
├── public/              static assets served as-is by Vite
│   └── assets/          (CREDITS.md attribution ledger; sprites added later)
│       └── audio/       shipped MP3s (sfx/, music/) — MP3 only, see scripts/audio/
│
├── scripts/             developer tooling (NOT shipped, NOT bundled)
│   ├── check-tooling-leaks.sh   leak scanner (CI + pre-commit)
│   └── audio/                   audio processing (encode, probe)
│       ├── encode.mjs           one-pass trim + loudnorm + MP3 encode
│       └── probe.mjs            inspect a file (duration, channels, peak/mean dB)
│
├── .audio-source/       gitignored — raw audio (WAV/FLAC) + working cuts
│   └── README.md        the only tracked file in here
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

mathBasher ships only **MP3** in `public/assets/audio/`. Every shipped file goes through `pnpm audio:encode`, which runs one ffmpeg pass that:

1. Trims leading + trailing silence (peak detection at -45 dB, 5 ms guard)
2. Loudness-normalizes to EBU R128 (-16 LUFS for SFX, -18 LUFS for music; -1.5 dBTP true-peak ceiling — kid-safe, never blast-loud)
3. Strips ALL metadata (no leaked generator names, prompts, or timestamps)
4. Encodes to the right MP3 profile for the kind

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
| How does audio playback flow at runtime? | `BootScene.preload` loads each MP3 into Phaser's audio cache by key (`AudioKeys.Fire1`, etc.). On the user's first `Start` click in `MenuScene`, `getAudioManager().init(scene)` binds the singleton to a Phaser scene (must happen inside a user-gesture handler — iOS Safari blocks WebAudioContext creation outside one). `GameScene.handleFire()` calls `audio.play(AudioKeys.Fire1)`; the manager checks mute state, looks up the cached buffer, and plays at the volume cap (`DEFAULT_VOLUME = 0.6`, never higher). Missing keys log a Warning and return silently — never throw into the gameplay loop. |
| Where does the mute state live? | `AudioManager.muted` (in-memory) is the single source of truth at runtime. It's persisted to `localStorage` under the key `mathbasher.audio.muted` ("true"/"false"); read at AudioManager construction (in `main.ts` at app boot), written on every `setMuted` call. The HUD mute icon (`HudScene.createMuteButton`) reads `audio.isMuted()` for its visual state and calls `audio.setMuted(...)` on click. |
| Why is AudioManager split into two files? | Folder discipline. `src/services/AudioManager.ts` is the pure-TS facade (no Phaser import) — unit-testable, callable from anywhere. `src/game/services/PhaserAudioManager.ts` is the Phaser-coupled implementation that actually drives WebAudio. `src/services/audioManagerFactory.ts` returns the concrete subclass while exposing the pure facade type, same pattern as `IScoreStore` / `SessionScoreStore` / `scoreStoreFactory`. |
| Why does the audio init happen in MenuScene, not BootScene? | iOS Safari blocks `WebAudioContext` creation/resumption outside a user-gesture handler. `init()` from BootScene works on Chrome and Firefox but silently fails on iOS, leaving the kid pressing fire forever in silence. Wiring `init()` to the first Start-button click is the canonical fix. Asset preload is fine in BootScene (no audio context needed); only the live binding has to happen inside a gesture. |
| What's coming next? | `VERSIONS.md` `[Unreleased]` section |

---

## License

This guide is part of mathBasher and is licensed under the same terms — AGPL-3.0-or-later with the §7(b) UI attribution requirement, or under a separate commercial license. See `LICENSE`, `NOTICE`, and `COMMERCIAL.md`.
