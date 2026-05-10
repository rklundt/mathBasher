<!--
SPDX-License-Identifier: AGPL-3.0-or-later
Copyright 2026 Ray Klundt
mathBasher is also available under a commercial license — see COMMERCIAL.md
-->

# Canvas scaling strategy

mathBasher renders into a **fixed 1280×720 (16:9) design canvas** and uses Phaser's `Scale.FIT` mode to letterbox onto whatever viewport the browser provides. Sprint 0.6 (mobile + responsive) locked this in.

## Why FIT (and not RESIZE)

- **Predictable layout math.** Every entity, button, HUD position, hero spawn point, and safe-area calculation is in 1280×720 design space. No per-scene recomputation when the viewport changes.
- **Fixed aspect = fewer surprises.** The game is a vertical-descent arcade shooter — gameplay tuning (descent speeds, alien lane positions, hero run bounds) is anchored to a stable canvas. RESIZE would let aliens land at vertical pixel positions that shift between devices.
- **Letterboxing reads as intentional** when the area outside the canvas matches the in-game backdrop color (`#0b1020`). The page CSS in `index.html` paints body + html that color so off-ratio devices see clean dark bands, not the browser's default white.

## Landscape lock on mobile

Portrait orientation on a phone-sized viewport is gated by a fixed-position DOM overlay (`#rotate-overlay` in `index.html`) shown via the CSS media query `@media (orientation: portrait) and (max-width: 900px)`. The overlay covers the canvas entirely; no in-game UI is reachable until the device returns to landscape. When orientation flips back, the overlay's `display: none` (via the media query) takes effect immediately and Phaser receives a synthetic resize via `scale.refresh()` so the canvas re-fits to the new viewport.

## Knobs to know

- `scale.mode: FIT` — preserve aspect, letterbox the rest
- `scale.autoCenter: CENTER_BOTH` — center the canvas in its parent
- `scale.width: 1280, height: 720` — the design canvas
- `scale.parent: 'game'` — mounts to the `<div id="game">` in `index.html`
- `scale.expandParent: true` — let Phaser size the parent up to fill its container so FIT has the right viewport to compute against

## When to revisit

If a future game mode (Phase 2's "Number Climb" platformer, say) needs a portrait or square aspect, prefer **adding a per-scene scale override** over flipping the global mode to RESIZE. Keep arcade-shooter scenes on the 1280×720 canvas; let new scenes pick their own.
