# Third-Party Asset Credits

This file records the provenance, license, and source of every third-party asset shipped with mathBasher. It is referenced from the project-root `NOTICE` file as the canonical attribution location for visual, audio, font, and other media assets.

Some assets used (or planned) in mathBasher are released under licenses that do not legally require attribution — for example, the Creative Commons CC0 1.0 Universal Public Domain Dedication. We list them here regardless, as a courtesy to their authors and as a record for compliance audits.

## Entry format

Each asset or asset pack should appear as a section like:

```
### <Pack or file name>

- **Author:** <name and link if available>
- **License:** <SPDX identifier> (e.g. `CC0-1.0`, `CC-BY-4.0`, `OFL-1.1`)
- **Source:** <URL or other locator>
- **Files used:** <relative paths under `public/assets/`>
- **Modifications:** <none / list of edits, e.g. resized, recolored, sliced>
- **Notes:** <anything else worth recording>
```

When in doubt about whether an asset belongs here, add it. Over-attribution costs nothing; under-attribution can become a legal problem.

## Assets in this project

### Kenney — Particle Pack

- **Author:** Kenney Vleugels (https://kenney.nl)
- **License:** `CC0-1.0` (Public Domain Dedication — no attribution legally required; we credit anyway per project policy)
- **Source:** https://kenney.nl/assets/particle-pack
- **Files used:**
  - `public/assets/sprites/particles/circle_03.png`
  - `public/assets/sprites/particles/light_01.png`
  - `public/assets/sprites/particles/flare_01.png`
  - `public/assets/sprites/particles/muzzle_03.png`
  - `public/assets/sprites/particles/flame_03.png`
  - `public/assets/sprites/particles/spark_05.png`
  - `public/assets/sprites/particles/smoke_05.png`
  - `public/assets/sprites/particles/dirt_02.png`
  - `public/assets/sprites/particles/dirt_03.png`
  - `public/assets/sprites/particles/scorch_02.png`
  - `public/assets/sprites/particles/magic_02.png`
  - `public/assets/sprites/particles/trace_03.png`
  - `public/assets/sprites/particles/star_03.png`
  - `public/assets/sprites/particles/star_05.png`
  - `public/assets/sprites/particles/star_07.png`
- **Modifications:** Each PNG resized to fit within 64×64 bounding box (`particle` PROFILE in `scripts/sprites/process.mjs`), palette-quantized, metadata stripped (no EXIF / XMP), re-encoded as PNG at compression level 9. Files renamed only insofar as the source `PNG (Transparent)/` folder prefix was dropped; basenames preserved (e.g. `circle_03.png` traces back to Kenney's `PNG (Transparent)/circle_03.png`).
- **Notes:** Sources for particle emitters (hero engine glow, muzzle flash, correct/wrong-hit explosions, smoke trails) and parallax background stars (Story 6 in sprint 0.7).

### Google Fonts — Baloo 2

- **Author:** Ek Type (https://www.ektype.in/) — designer of the Baloo 2 typeface family
- **License:** `OFL-1.1` (SIL Open Font License 1.1) — permits embedding + use in commercial work; no attribution legally required for use as bitmaps in a game (typical OFL §1 exception). We credit anyway per the project's "over-attribution costs nothing" policy.
- **Source:** https://fonts.google.com/specimen/Baloo+2
- **Files used:** none bundled — loaded at runtime via the Google Fonts CDN (`<link>` in `index.html`). Used in every text element in the game via `FONT_FAMILY` in `src/game/ui/typography.ts`.
- **Modifications:** none (font served as-is by Google Fonts; no subsetting, no manipulation).
- **Notes:** Two weights loaded (400 + 700). `display=swap` directive ensures fallback (system-ui) renders immediately and Baloo 2 swaps in once loaded — no FOIT. If self-hosting becomes desirable (privacy, latency, offline play), Google Fonts allows downloading the woff2 + serving from `public/assets/fonts/`; the OFL-1.1 license still applies.

### Kenney — UI Pack (Space Expansion)

- **Author:** Kenney Vleugels (https://kenney.nl)
- **License:** `CC0-1.0`
- **Source:** https://kenney.nl/assets/ui-pack-space-expansion
- **Files used:**
  - `public/assets/sprites/ui/grey-large_l.png`
  - `public/assets/sprites/ui/grey-large_m.png`
  - `public/assets/sprites/ui/grey-large_r.png`
  - `public/assets/sprites/ui/grey-gloss_large_l.png`
  - `public/assets/sprites/ui/grey-gloss_large_m.png`
  - `public/assets/sprites/ui/grey-gloss_large_r.png`
- **Modifications:** Six 9-slice button-bar assets in Grey palette extracted from `PNG/Grey/Default/bar_round_large_*.png` and `bar_round_gloss_large_*.png`. Resized to fit within 256×256 bounding box (`ui` PROFILE), palette-quantized, metadata stripped, re-encoded as PNG. Output basenames flatten the Kenney `bar_round_` prefix into the `grey-` color prefix (e.g. `bar_round_large_l.png` → `grey-large_l.png`).
- **Notes:** Used for menu / settings / pause / game-over button backgrounds (Story 7 in sprint 0.7). 9-slice scheme: any button width is rendered from `_l` + `_m` (tiled) + `_r`. Gloss variant is for active/selected button states.

## Generated assets

Assets generated by the project owner via third-party AI tools. Listed here under the "over-attribution costs nothing" principle, to record the generator + TOS context in case attribution becomes a license requirement later or the tool's terms change.

**Policy for AI-generated assets-the-user-authored** (sprint 0.7 Story 13 D8): even though these assets are commissioned/prompted by the project owner and would technically fall under "project-original assets" (covered by the project's primary AGPL-3.0-or-later license), they appear in THIS section, not below in "Project-original assets." Reason: the AI tool's terms of service may impose attribution requirements at any future date, the model's training data has uncertain provenance, and the prompt-to-output relationship doesn't make the prompter the sole "author" in the strict copyright sense. Listing them here establishes the audit trail (which generator, when, modifications applied) before any future TOS / legal change makes that information necessary. If the tool's TOS demands attribution today, that requirement is satisfied by these entries.

### Game Audio

- **Generator:** ElevenLabs
- **Modifications:** Trimmed, downmixed, gain-capped, and re-encoded to project format.

### Background art — gameplay nebula

- **Generator:** Midjourney
- **Files used:** `public/assets/sprites/bg/nebula.png` (1280×717 RGB, no alpha)
- **Modifications:** Resized to fit within 1280×1280 bounding box (preserving 16:9 source aspect), brightness multiplied 0.6× to tame visual competition with foreground sprites, re-encoded as PNG without metadata (no EXIF / XMP / generator name embedded). Original raw output retained locally in `.sprite-source/raw/` (gitignored) as the audit trail.
- **Notes:** Used as the gameplay backdrop in `GameScene` (planned by sprint 0.7 Story 6). The processing recipe is `pnpm sprite:process --kind bg --name nebula --brightness 0.6 .sprite-source/raw/nebula.png`.

### Hero ship sprites

- **Generator:** Midjourney
- **Files used:**
  - `public/assets/sprites/hero/speeder-1.png` (192×108 palette PNG with alpha, ~10 KB)
  - `public/assets/sprites/hero/speeder-2.png` (192×108 palette PNG with alpha, ~6 KB)
  - `public/assets/sprites/hero/speeder-3.png` (192×108 palette PNG with alpha, ~9 KB)
- **Modifications:** Three 16:9 source images (512×288 each, transparent background, side-profile facing right) resized to fit within 192×192 bounding box (`hero` PROFILE after the sprint 0.7 Story 1 bump from 128 → 192 for desktop crispness), palette-quantized, metadata stripped, re-encoded as PNG. Original raw outputs retained locally in `.sprite-source/raw/hero/` (gitignored).
- **Notes:** The game cycles through all three ships uniformly at random per round (`pickRandomHeroSpriteKey` in `src/core/spriteKeys.ts`). Source assets face right; `Hero.ts` calls `setFlipX(true)` when the hero is moving left so the ship visually faces its direction of travel (one-line Phaser mirror; no second asset needed).

## Project-original assets

Assets created specifically for mathBasher (custom illustrations, audio, etc.) are NOT listed here. They are covered by the project's primary license (AGPL-3.0-or-later) and are attributed by the project's `LICENSE` and `NOTICE` files at the project root.

## License of this file

This file is © 2026 Ray Klundt and is part of the mathBasher project, licensed under AGPL-3.0-or-later. The license terms of any third-party asset listed below are NOT modified by this file; each asset remains governed by its own original license as cited in its entry.
