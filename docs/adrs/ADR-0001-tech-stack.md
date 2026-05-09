# ADR-0001: Tech Stack — Vite + TypeScript + Phaser 3

**Status:** Accepted (2026-05-08)

## Context

mathBasher is a browser-based math game targeting kids on phones (landscape), tablets, and desktops. We need:

- A 2D rendering layer with sprite/animation/input/audio primitives
- A build tool that's fast in dev (HMR) and produces a small production bundle
- Type safety (the user's bread-and-butter is .NET; strict typing reduces friction)
- Mobile-first scaling and touch input handled idiomatically
- A scene system that maps onto our planned flow (menu, game-select, difficulty, gameplay, game-over)

Alternatives considered:

- **Plain Canvas / hand-rolled** — most control, most code; we'd reinvent input, scenes, scaling, asset loading
- **PixiJS** — rendering only; we'd still need menus/scenes/input on top
- **React + PixiJS** — good if menus need DOM forms; adds a bridge between DOM and canvas event models
- **Kaboom.js / Excalibur** — simpler than Phaser but smaller communities and fewer arcade-shooter examples
- **Unity WebGL** — overkill; massive bundle; doesn't fit a kid-friendly zero-install pitch

## Decision

**Vite + TypeScript (strict) + Phaser 3.** All UI rendered through Phaser scenes including menus (no React).

## Consequences

- **Pro:** One engine to learn and reason about. Scene transitions, input, scaling, and audio all use the same primitives. Phaser handles mobile scaling out of the box.
- **Pro:** TypeScript strict catches a class of bugs (incorrect scene data, mismatched event payloads) before runtime.
- **Pro:** Vite dev server gives sub-second HMR.
- **Con:** Phaser's API is its own learning curve. New contributors who know React but not Phaser have to ramp up.
- **Con:** All-Phaser UI means no DOM forms; if we ever need a complex settings dialog, we'll either layer a thin DOM overlay or build it in Phaser. The former is allowed (e.g., the portrait-rotate overlay in sprint 0.6).
- **Future:** If we ever need a separate admin/CMS tool, that's a different deployable and can use any stack.
