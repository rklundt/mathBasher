# ADR-0004: Dual license (AGPL-3.0-or-later + Commercial) with §7(b) UI attribution

**Status:** Accepted (2026-05-08), supersedes a brief earlier consideration of Apache 2.0. Amended 2026-10-04 (attribution display mechanism — see Amendment below).

## Context

The user wants the strongest standard mechanism to enforce attribution on any reuse, modification, fork, or redeployment of mathBasher, with an option for downstream consumers to buy a private/no-attribution license.

Options surveyed:

- **Apache 2.0** — strongest standard attribution, but permissive (forks can stay closed-source). User wanted stronger.
- **GPL v3** — copyleft. Forces forks to be open-source. Doesn't catch SaaS use.
- **AGPL v3** — copyleft + closes the SaaS loophole (network use triggers source-disclosure). Strongest copyleft available as a standard license.
- **Custom "must display credit in UI" clause** — possible under AGPL §7(b) as an additional permitted term ("preservation of specified reasonable legal notices or author attributions").
- **Source-available (BSL, SSPL, Elastic 2.0)** — non-OSI; trades off open-source positioning.

Dual-licensing pattern (AGPL + commercial) is well-established (Sentry, Plausible, Mattermost, etc.).

## Decision

mathBasher is dual-licensed:

1. **AGPL-3.0-or-later** as the default. Plus an additional term under AGPL §7(b) requiring the running app to prominently display a UI attribution notice (`mathBasher © Ray Klundt — AGPL-3.0 — Source: <link>`) on every interactive scene.
2. **Commercial license** available from Ray Klundt (rayklundt (at) Outlook (dot) com) that waives both the AGPL copyleft AND the UI attribution requirement, scoped per-licensee.

`LICENSE`, `NOTICE`, `COMMERCIAL.md`, and `README.md` document this. The UI attribution display is enforced architecturally via `src/core/attribution.ts` + an always-on `AttributionScene`.

## Consequences

- **Pro:** Maximum legal grounds for attribution and source disclosure on reuse.
- **Pro:** Commercial path provides revenue option without compromising the OSS posture.
- **Pro:** UI attribution is hard to "accidentally remove" — it's a single source of truth in a constants file, displayed by a dedicated scene, and is a hard requirement at every sprint-close architecture review.
- **Con:** AGPL is unloved by enterprise. Volume of casual contributions and forks will be lower than under MIT/Apache. This is by design — push commercial users toward the paid license.
- **Con:** Dual-licensing requires a CLA from any third-party contributor (so the copyright holder retains the right to relicense their work commercially). Until `CONTRIBUTING.md` + CLA mechanism exists, third-party contributions must be refused.
- **Con:** Adds documentation complexity (LICENSE + NOTICE + COMMERCIAL + the §7(b) clause framing). Mitigated by the `AttributionScene` being a single always-on parallel scene reading from one constants module.
- **Future:** If pricing terms or commercial license templates are needed, they're drafted with a lawyer; ADR-0004 doesn't try to specify them.

## Amendment (2026-10-04, sprint 2.5.2) — attribution display mechanism

The decision above is unchanged; only **how** the §7(b) notice is displayed changed. The notice moved out of the Phaser canvas (the always-on `AttributionScene`, now deleted) into a DOM footer:

- Markup + CSS: `#app-footer` in `index.html`. Filled at page load by `mountAttributionFooter()` (`src/game/ui/domAttributionFooter.ts`), still from the single source of truth `src/core/attribution.ts`.
- Layout: the page is a column the height of the visible viewport — the game canvas fills the space and the footer sits in flow directly beneath it. So the notice stays above a phone's URL bar, no game element can cover it (or sit under its Source link), and it is stacked above the boot splash so it shows from first paint.
- It wraps to a second line on narrow screens instead of truncating (NOTICE §7(b)(b)).
- The source link (NOTICE §7(b)(c), AGPL §13) is built by CI per deployment, pinned to the exact commit deployed (`.../tree/<short-sha>`).
- Guarded by `src/attributionFooter.test.ts` (markup present, mounted at load, no truncation CSS, text sourced from `attribution.ts`).

Why: in-canvas, the footer scaled with the FIT canvas and sat at the canvas bottom — which on phones fell partly behind the browser's URL bar. A DOM footer laid out below the canvas keeps it fully visible and legible on every device. The "hard to accidentally remove" property above now rests on the contract test plus the architecture review, rather than on a dedicated scene.
