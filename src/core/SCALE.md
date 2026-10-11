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
- `scale.autoCenter: NO_CENTER` — `#game` centers the canvas with CSS flexbox. Phaser's `CENTER_BOTH` used to add its own margins on top, double-centering the canvas (it sat 3/4 of the way into the spare space). Keep exactly one centering mechanism: the CSS.
- `scale.width: 1280, height: 720` — the design canvas
- `scale.parent: 'game'` — mounts to the `<div id="game">` in `index.html`
- **Fullscreen on phones** (`src/app/fullscreen.ts`): on touch-primary devices the "Tap to play" tap requests fullscreen for the WHOLE page (never just the canvas — the AGPL footer must stay visible) plus a best-effort landscape lock. If the player leaves fullscreen (back gesture), a "Full screen" button appears in the footer strip under the game (touch devices only, hidden while fullscreen) to get back in. Width on a landscape phone is height-limited, and the URL + status bars are the biggest height cost, so this is the main real-estate lever. Silent no-op where unsupported (iPhone Safari) and on desktop.
- `scale.expandParent: false` — since sprint 2.5.2 `#game` gets a definite height from the page's flex column (visible viewport minus the AGPL footer), so FIT always has a real box to fit into. Left OFF on purpose: with it on, a `#game` that measured 0 at boot would make Phaser write `body.style.height = '100%'`, overriding the `100dvh` column and bringing back the mobile URL-bar overlap.

## When to revisit

If a future game mode (Phase 2's "Number Climb" platformer, say) needs a portrait or square aspect, prefer **adding a per-scene scale override** over flipping the global mode to RESIZE. Keep arcade-shooter scenes on the 1280×720 canvas; let new scenes pick their own.
