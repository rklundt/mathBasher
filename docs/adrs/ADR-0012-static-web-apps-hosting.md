# ADR-0012: Azure Static Web Apps hosting; Express server kept but not deployed

**Status:** Accepted (2026-10-15). Records decisions made in sprints 2.3 and 2.5.2.
**Supersedes:** [ADR-0002](ADR-0002-single-container-deployment.md) and [ADR-0007](ADR-0007-azure-app-service-for-containers.md) for current hosting. Both stay as the plan for a future backend.

## Context

ADR-0002 chose an Express server in a single container, and ADR-0007 put that container on Azure App Service. Both assumed the game would soon need a server: an API for high scores, runtime config such as an App Insights connection string, and a health probe for App Service.

As built, the game is a 100% static Vite SPA. Nothing needs a server today:

- Scores and settings live in the browser.
- Build-time config is inlined by Vite (`VITE_SOURCE_URL` for the AGPL §13 source link).
- Telemetry falls back to the console.

An always-on App Service plan, plus a container registry, would cost money every month for a server that only hands out files.

## Decision

1. **Host on Azure Static Web Apps, Free tier,** with two apps, one per environment. Pushes to `development` deploy the dev app; pushes to `main` deploy the prod app. The Free tier binds a custom domain only to an app's production environment, so each environment gets its own app rather than a preview environment of one. DNS is on Cloudflare.
2. **The build runs on GitHub's runner,** and only the built `dist/` is uploaded (`skip_app_build`). No code of ours runs on Azure.
3. **Headers and routing live in `public/staticwebapp.config.json`:** cache tiers, the Content-Security-Policy and other security headers, and the SPA fallback.
4. **Keep the Express server (`server/`) and the `Dockerfile` in the repo, but not in the deploy.** They are the starting point if a backend is needed. To keep them runnable, CI typechecks and builds the server on every pull request, and `pnpm start` serves the built game locally the way the container would.

## Consequences

- **Pro:** No monthly hosting cost. Global edge serving, managed TLS, and push-to-deploy with no servers to patch.
- **Pro:** Less to secure. There is no server-side attack surface. The deploy tokens live in GitHub Environments, one per app.
- **Con:** No server-side runtime config. Anything the browser needs is baked in at build time, so a config change means a rebuild and redeploy.
- **Con:** Headers are static. The CSP can't be nonce-based, so allowed sources are listed by host.
- **Con:** The dormant server can drift. CI building it and `pnpm start` working are the guard. The server finds the built site from the app root (the folder holding `package.json`), not from a fixed relative path, so it works both in the repo and in the container (`/app`).
- **Revisit when** the game needs server-side state (shared high scores, accounts) or runtime secrets. Options, cheapest first:
  - Static Web Apps managed Functions, as an API next to the static site.
  - The ADR-0002/0007 path, with Express on App Service.

  That choice gets its own ADR.
