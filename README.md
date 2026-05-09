# mathBasher

A browser-based math game for kids. Aliens descend from the top of the screen carrying possible answers to a math problem; you fire at the right one before they reach the hero.

Mobile-friendly (landscape on phones), zero-install. New game modes and new math types are added by adding files, not by changing the engine.

## Prerequisites

- **Node.js 20+** (see `package.json#engines`)
- **pnpm 9+** (the project pins `pnpm@9.15.0` via `package.json#packageManager`)

The fastest way to get pnpm is via Corepack (bundled with Node 20):

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

Or install globally with npm:

```bash
npm install -g pnpm@9.15.0
```

## Run locally

```bash
pnpm install
pnpm dev                   # Vite dev server with HMR
```

Then open the URL Vite prints (typically `http://localhost:5173`).

`.env` is **optional** — defaults work out of the box. Copy `.env.example` only if you want to override `VITE_SOURCE_URL` (the source link the in-app attribution footer points to) or wire Application Insights locally:

```bash
# macOS / Linux
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

For a production-style local run (Express serving the built assets):

```bash
pnpm build                 # builds client (Vite) + server (tsc)
pnpm start                 # listens on http://localhost:8080
```

## Project structure

```
src/              browser-side TypeScript (Vite)
  game/          Phaser scenes, entities, systems, UI
  math/          question generators (pure TS, no Phaser)
  services/      score store, audio manager, settings (no Phaser)
  core/          config, telemetry, attribution, shared types
public/           static assets served as-is by Vite (CREDITS.md lives here)
server/           Express server for production container
  src/           server source
  dist/          compiled output
docs/             reference documents (ADRs)
dist/             Vite client build output
LICENSE           GNU Affero General Public License v3 (see also COMMERCIAL.md)
NOTICE            attribution and third-party notices
```

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Vite dev server with HMR |
| `pnpm build` | Production build (client + server) |
| `pnpm start` | Run the Express server against the built assets |
| `pnpm test` | Run the unit test suite |
| `pnpm typecheck` | TypeScript strict-mode check, no emit |

## Contributing

Contributions are not yet open — the Contributor License Agreement (CLA) mechanism that the dual-license model requires is not in place yet. See [CONTRIBUTING.md](CONTRIBUTING.md) for the planned workflow.

Bug reports and security disclosures are welcome regardless. Security issues: see [SECURITY.md](SECURITY.md). All project participation follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Copyright 2026 Ray Klundt.

mathBasher is **dual-licensed**:

1. **GNU Affero General Public License v3 or later (AGPL-3.0-or-later)** — see [LICENSE](LICENSE) and [NOTICE](NOTICE)
2. **Commercial license** — see [COMMERCIAL.md](COMMERCIAL.md)

Under the AGPL option:

- You may use, modify, and redistribute mathBasher provided you publish the source of any modifications you distribute or run as a network service (AGPL Section 13)
- Any user-facing interface containing mathBasher MUST prominently display the attribution notice in [NOTICE](NOTICE) ("mathBasher © 2026 Ray Klundt — AGPL-3.0 — Source: <link>")
- Removal of the UI attribution and the AGPL copyleft requirement is permitted ONLY under a separate commercial license

If you want a closed-source deployment, a private SaaS without source disclosure, or a clean attribution-free interface, contact **rayklundt (at) Outlook (dot) com** for a commercial license. See [COMMERCIAL.md](COMMERCIAL.md).
