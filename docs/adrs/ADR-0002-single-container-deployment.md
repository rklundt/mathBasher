# ADR-0002: Single-container deployment with Express server

**Status:** Accepted (2026-05-08)

## Context

The user's other project (`almost-adult`) originally considered a separate .NET API alongside a Vite SPA, then dropped that for a single Node.js + Express container. mathBasher faces the same choice from a clean slate. Options:

1. **Static SPA only**, hosted on Azure Static Web Apps or a CDN. No server.
2. **SPA + .NET API** as separate containers/services.
3. **SPA + Node Express** in a single container.

The game needs:

- A health endpoint for container probes
- A future API surface for high scores (Phase 3) and possibly other endpoints (telemetry config, dynamic content)
- A way to inject runtime config (App Insights connection string, source URL) without baking secrets into the bundle

## Decision

**Single Docker container running an Express server.** Express serves the Vite-built static assets in production, exposes `/health`, and hosts a `/server/routes/` folder for future API endpoints. Deployed to Azure App Service for Containers.

## Consequences

- **Pro:** One container, one deployment, one CI pipeline. No coordination between two services.
- **Pro:** TypeScript end-to-end. Shared types possible between server and browser without translation.
- **Pro:** One Application Insights resource captures both browser and server events, distinguished by `cloudRoleName`.
- **Pro:** When v2 needs an API, we add a route file — no new service to provision.
- **Con:** A single container scales as a unit. If gameplay traffic explodes but the API stays small, we still scale both.
- **Con:** No edge caching for static assets unless we add a CDN in front (deferred; not needed at MVP scale).
- **Future:** If a .NET microservice is ever needed (e.g. for integration with existing .NET infrastructure), it can be added later as a sibling container without disrupting this one.
