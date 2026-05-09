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

- Sprint 0.2 in planning. Will deliver the math engine: `Question` / `QuestionGenerator` interfaces, the first generator (Add to 10), shared distractor strategies, generator registry, and Vitest unit tests.

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
