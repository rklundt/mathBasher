# Architecture Decision Records (ADRs)

This folder records significant architectural, legal, and operational decisions for mathBasher. Each ADR captures the **context** behind the decision, the **decision** itself, and the **consequences** that follow — so future contributors (and future-Ray) can understand why something is the way it is, not just what it is.

## Format

Standard "Michael Nygard" ADR format. Each file contains:

- **Title** — short noun phrase (e.g. "Single-container deployment")
- **Status** — Proposed / Accepted / Deprecated / Superseded by ADR-XXXX
- **Context** — what's the situation; what forces are at play
- **Decision** — what we're doing
- **Consequences** — what changes as a result; what we accept; what we now have to do

## Numbering

Files are numbered sequentially across the entire project: `ADR-XXXX-<short-kebab-title>.md`. Numbers are never reused; superseded ADRs stay in this folder with status changed to "Superseded by ADR-XXXX" and a back-link.

You may notice numerical gaps in this folder (e.g., the public sequence skips some numbers). That's intentional: a small number of ADRs document private development tooling and are kept in a non-published location. The public sequence here is what's relevant to anyone reading or contributing to mathBasher.

## When to write a new ADR

Write one when:

- A decision shapes how the codebase grows (folder discipline, interface boundaries, deployment targets)
- A decision has costs or constraints contributors will hit later (no React; AGPL forces UI attribution)
- A decision was non-obvious — there were real alternatives and we picked one for documented reasons
- A decision will be questioned later (e.g. "why don't we just...")

Don't write one for:

- Routine implementation choices (variable names, file layout within a folder)
- Tooling-specific dev workflow choices (those go in a separate, non-published location)

## Index

| # | Title |
|---|---|
| [0001](ADR-0001-tech-stack.md) | Tech stack — Vite + TypeScript + Phaser 3 |
| [0002](ADR-0002-single-container-deployment.md) | Single-container deployment with Express server |
| [0003](ADR-0003-central-config-file.md) | Single central config file for all gameplay tuning |
| [0004](ADR-0004-agpl-commercial-dual-license.md) | Dual license (AGPL-3.0-or-later + Commercial) with §7(b) UI attribution |
| [0005](ADR-0005-sprint-id-as-version.md) | Sprint id is the release version |
| [0006](ADR-0006-folder-discipline.md) | Folder discipline (no Phaser in /math or /services) |
| [0007](ADR-0007-azure-app-service-for-containers.md) | Azure App Service for Containers (over Container Apps) |
| [0008](ADR-0008-ffmpeg-static-as-dev-dependency.md) | `ffmpeg-static` as a project-scoped dev dependency (with build-script allowlist) |
| [0009](ADR-0009-sharp-as-dev-dependency.md) | `sharp` as a project-scoped dev dependency (visual-asset analogue of ADR-0008) |
