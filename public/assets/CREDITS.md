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

**Format note (sprint 2.2.1 story 6):** the `bg` and `hero` sprite kinds + the Asteroid Field rock sprites were migrated from PNG to **WebP** — backgrounds as lossy q85 (≈88 % smaller), sprite art with alpha as lossless WebP. The "Files used" / "Modifications" lines below already reflect the `.webp` basenames; the generator, license, and provenance were unchanged by the migration — only the on-disk encoding changed. UI + particle sprites (Kenney packs) remain PNG.

### Game Audio

- **Generator:** ElevenLabs
- **Modifications:** Trimmed, downmixed, gain-capped, and re-encoded to project format.

### Asteroid Field background music

- **Generator:** ElevenLabs
- **Files used:** `public/assets/audio/music/loop-3.mp3` (~587 KB, 30s stereo loop, 160 kbps MP3, -19.8 LUFS / -5.8 dBTP)
- **Modifications:** Loudness-normalized to the project's music profile (-18 LUFS target), re-encoded to 160 kbps stereo MP3 at 44.1 kHz, all metadata stripped via `pnpm audio:encode --kind music --no-trim`. The `--no-trim` flag is load-bearing — the default silence-trim pass would cut into the loop's first/last samples, producing an audible click at the loop boundary.
- **Notes:** Sprint 2.1.5 — first per-game-mode music track. Mapped to `'asteroid-field'` in `GAME_MUSIC_MAP` (`src/core/audioKeys.ts`); `'alien-shoot'` continues to use `loop-1.mp3`. Each game scene reads its track from the map at `create` time and plays via `getAudioManager().playLoop(key, 'music')`.

### Background art — gameplay nebula

- **Generator:** Midjourney
- **Files used:** `public/assets/sprites/bg/nebula.webp` (1280×717 RGB, no alpha, ~54 KB)
- **Modifications:** Resized to fit within 1280×1280 bounding box (preserving 16:9 source aspect), brightness multiplied 0.6× to tame visual competition with foreground sprites, encoded as lossy WebP q85 without metadata (no EXIF / XMP / generator name embedded). Original raw output retained locally in `.sprite-source/raw/` (gitignored) as the audit trail.
- **Notes:** Used as the gameplay backdrop for Alien Shoot — rendered by `BackgroundScene` via the `GAME_BG_MAP` lookup in `src/core/spriteKeys.ts`. Processing recipe: `pnpm sprite:process --kind bg --name nebula --brightness 0.6 --format webp .sprite-source/raw/nebula.png`.

### Background art — Asteroid Field belt

- **Generator:** Midjourney
- **Files used:** `public/assets/sprites/bg/asteroid-belt.webp` (1280×717 RGB, no alpha, ~75 KB)
- **Modifications:** Resized from 1456×816 source to fit within 1280×1280 bounding box (preserving aspect), brightness multiplied 0.6× (matches the nebula recipe so the two backgrounds feel like a coherent visual family — same darkening level relative to foreground sprites), encoded as lossy WebP q85 without metadata. Original raw output retained locally in `.sprite-source/raw/bg/processed/` (gitignored).
- **Notes:** Used as the Asteroid Field gameplay backdrop — `BackgroundScene` swaps to this image when `Settings.round.gameId` changes to `'asteroid-field'`. Sprint 2.1.1 — first per-game-mode background (established the `GAME_BG_MAP` mapping convention in `src/core/spriteKeys.ts`). Processing recipe: `pnpm sprite:process --kind bg --name asteroid-belt --brightness 0.6 --format webp .sprite-source/raw/bg/bg_astroidbelt.png`.

### Hero ship sprites

- **Generator:** Midjourney
- **Files used:**
  - `public/assets/sprites/hero/speeder-1.webp` (192×108 lossless WebP with alpha, ~9 KB)
  - `public/assets/sprites/hero/speeder-2.webp` (192×108 lossless WebP with alpha, ~5 KB)
  - `public/assets/sprites/hero/speeder-3.webp` (192×108 lossless WebP with alpha, ~8 KB)
- **Modifications:** Three 16:9 source images (512×288 each, transparent background, side-profile facing right) resized to fit within 192×192 bounding box (`hero` PROFILE after the sprint 0.7 Story 1 bump from 128 → 192 for desktop crispness), metadata stripped, encoded as lossless WebP (preserves the crisp alpha edges sprite art needs). Original raw outputs retained locally in `.sprite-source/raw/hero/` (gitignored).
- **Notes:** The game cycles through all three ships uniformly at random per round (`pickRandomHeroSpriteKey` in `src/core/spriteKeys.ts`). Source assets face right; `Hero.ts` calls `setFlipX(true)` when the hero is moving left so the ship visually faces its direction of travel (one-line Phaser mirror; no second asset needed).

### Alien Shoot hero — Space Robot

- **Generator:** Midjourney
- **Files used:**
  - `public/assets/sprites/hero/space-robot.webp` (128×128 lossless WebP with alpha, ~17 KB)
- **Modifications:** Single source image (transparent background, arcade-style space robot figure) resized to fit within 192×192 bounding box (`hero` PROFILE), metadata stripped (no EXIF / XMP / generator-name leak), encoded as lossless WebP. Original raw output retained locally in `.sprite-source/raw/hero/processed/` (gitignored).
- **Notes:** Added sprint 2.4.1 as the DEFAULT Alien Shoot hero. First time the project lets the player pick a hero — `Settings.heroSkin` (`'space-robot'` default, `'og-yellow'` opt-in) selects between this single sprite and the original three-speeder round-robin set (`speeder-1/2/3`). `pickNextHeroSpriteKey` in `src/core/spriteKeys.ts` consults the setting at each round-start. UI lives in Settings → Game → Hero. Single static sprite (no animation frames); a multi-frame walking/running variant is a future-sprint option if needed.

### Asteroid Field hero ships

- **Generator:** Midjourney
- **Files used:**
  - `public/assets/sprites/hero/asteroid-hero-1.webp` (192×192 lossless WebP with alpha, ~11 KB)
  - `public/assets/sprites/hero/asteroid-hero-2.webp` (192×192 lossless WebP with alpha, ~10 KB)
  - `public/assets/sprites/hero/asteroid-hero-3.webp` (192×192 lossless WebP with alpha, ~12 KB)
- **Modifications:** Three 256×256 source images (transparent background, ship NOSE pointing NORTH/up in source art) resized to fit within 192×192 bounding box (`hero` PROFILE), metadata stripped (no EXIF / XMP / generator-name leak), encoded as lossless WebP. Original raw outputs retained locally in `.sprite-source/raw/hero/processed/` (gitignored).
- **Notes:** Added sprint 2.1 for the Asteroid Field game mode (free-aim rotating hero vs. Alien Shoot's side-running speeder). The game cycles through all three ships in round-robin order (`pickNextAsteroidHeroSpriteKey` in `src/core/spriteKeys.ts`) — strict cycle rather than uniform random so every ship is guaranteed visible across consecutive rounds. Source art faces NORTH; `AsteroidHero.applyFacing` rotates the container by `aimAngle + π/2` to bridge the source-up convention to the engine's east-at-aim-0 convention.

### Asteroid sprites

- **Generator:** Midjourney
- **Files used:**
  - `public/assets/sprites/aliens/asteroid-1.webp` (192×192 lossless WebP with alpha, ~9 KB)
  - `public/assets/sprites/aliens/asteroid-2.webp` (192×192 lossless WebP with alpha, ~17 KB)
  - `public/assets/sprites/aliens/asteroid-3.webp` (192×192 lossless WebP with alpha, ~13 KB)
  - `public/assets/sprites/aliens/asteroid-4.webp` (192×192 lossless WebP with alpha, ~18 KB)
  - `public/assets/sprites/aliens/asteroid-5.webp` (192×192 lossless WebP with alpha, ~12 KB)
  - `public/assets/sprites/aliens/asteroid-6.webp` (192×192 lossless WebP with alpha, ~15 KB)
  - `public/assets/sprites/aliens/asteroid-7.webp` (192×192 lossless WebP with alpha, ~12 KB)
  - `public/assets/sprites/aliens/asteroid-8.webp` (192×192 lossless WebP with alpha, ~15 KB)
- **Modifications:** Eight 256×256 source images (transparent background, centered rock with detailed surface texture) resized to fit within 192×192 bounding box (processed with `--kind alien` for the profile match — see `src/core/spriteKeys.ts` for why the `kind` tag in the sprite manifest is `'particle'` rather than `'alien'` for this batch), metadata stripped, encoded as lossless WebP. Original raw outputs retained locally in `.sprite-source/raw/processed/` (gitignored).
- **Notes:** Added sprint 2.1 playtest pass as an alternate visual to the procedural-polygon asteroids. A per-asteroid uniform-random pick (`pickRandomAsteroidSpriteKey`) gates which sprite renders. The image variant is enabled by default (`Settings.imageAsteroidsEnabled = true`); a Settings → Game → Asteroid Images toggle lets the player switch back to procedural polygons live in-round.

### Asteroid Field midground

- **Generator:** ElevenLabs
- **File used:** `public/assets/audio/midground/space-noises-1.mp3` (~71 KB, 6s mono MP3, 96 kbps, -23.5 LUFS / -6.3 dBTP)
- **Modifications:** Encoded through `pnpm audio:encode --kind midground` (which defaults to no-trim for loop files — preserves clean loop boundaries that a default trim pass could click at). Loudness-normalized to the midground profile (-22 LUFS target), downmixed to mono, all metadata stripped.
- **Notes:** Sprint 2.1.9 — first per-game-mode midground asset. Mapped to `'asteroid-field'` in `GAME_MIDGROUND_MAP` (`src/core/audioKeys.ts`); `'alien-shoot'` continues to use `skittering-1.mp3`. Fixed the v2.1.8 mismatch where Asteroid Field was playing Alien Shoot's hero-running ambient loop despite having no skittering-hero gameplay concept.

### Asteroid Field timeout-fail SFX

- **Generator:** ElevenLabs
- **File used:** `public/assets/audio/sfx/timeout-fail-1.mp3` (~7 KB, mono MP3, -16 LUFS / -1.5 dBTP)
- **Modifications:** Trimmed leading/trailing silence, loudness-normalized to the SFX profile (-16 LUFS), downmixed to mono, re-encoded to 96 kbps MP3, all metadata stripped via `pnpm audio:encode`.
- **Notes:** Added sprint 2.1 — plays when the per-question countdown reaches zero before the player hits the correct asteroid. Audible "you ran out of time" cue. Not used by Alien Shoot (which has the alien-reaches-hero death animation as its own failure cue).

### Alien enemy spritesheets

- **Generator:** Midjourney (source animation clips), extracted to spritesheets via the project's `scripts/sprites/extract-from-video.mjs` pipeline (ffmpeg).
- **Files used:** `public/assets/sprites/aliens/128/alien{1-5}-r{0-2}c{0-2}.webp` + `public/assets/sprites/aliens/192/alien{1-5}-r{0-2}c{0-2}.webp` — 90 files total (5 alien batches × 3×3 grid × two DPR tiers), ~58 MB combined.
- **Modifications:** Midjourney-generated short animation clips were run through the video-extract pipeline (ADR-0010): each clip's frames sampled at 12 fps, packed into a horizontal-strip WebP spritesheet, output at two DPR tiers (128 + 192) so the boot loader can pick the right tier per device. Metadata stripped.
- **Notes:** Alien Shoot's enemy sprites. The 5 batches (`alien1`-`alien5`) are declared in `ALIEN_SPRITE_BATCHES` (`src/core/spriteKeys.ts`); the loader picks a tier via `pickSpriteTier` and loads the pool through the alien-specific path in `assetLoader.ts`. These files were authored during sprint 0.7's alien-sprite work but were first committed to version control in sprint 2.2 (they had been sitting untracked in the working tree — `origin/main` was missing them).

### Number Climb (Space Escape!) floor backgrounds

- **Generator:** Midjourney
- **Files used:** `public/assets/sprites/bg/climb-floor-fire.webp`, `climb-floor-escape.webp`, `climb-floor-room-1.webp` … `climb-floor-room-20.webp` — 22 files, ~1.1 MB combined.
- **Modifications:** `--ar 8:1` source images resized to fit within the 1280×1280 bounding box (`bg` PROFILE — preserves the wide aspect, lands ~1280×160 / ~1280×320 for the 2× escape floor), all metadata stripped, encoded as lossy WebP q85 via `pnpm sprite:process --kind bg --format webp` (sprint 2.2.1 story 6 — the original PNG encoding was ~9.5 MB combined; WebP cut it ≈88 %). Original raw outputs retained locally in `.sprite-source/raw/bg/processed/` (gitignored).
- **Notes:** Per-floor "room" art for the Number Climb mode (ships as "Space Escape!"). `climb-floor-fire` is the fixed ground floor; `climb-floor-escape` is the fixed 2×-height top floor; `room-1` … `room-20` form the random pool (`CLIMB_RANDOM_FLOOR_KEYS` in `src/core/spriteKeys.ts`) drawn distinct-per-round. Sprint 2.2 (stories 13a / 13c / 13e) shipped fire + escape + room-1..16; sprint 2.2.1 added room-17..20.

### Number Climb (Space Escape!) escape ship

- **Generator:** Midjourney
- **Files used:** `public/assets/sprites/hero/escape-ship.webp` (192×192 lossless WebP with alpha, ~10 KB)
- **Modifications:** 256×256 source (transparent background) resized to fit within the 192×192 bounding box (`hero` PROFILE), metadata stripped, encoded as lossless WebP. Processed via `pnpm sprite:process --kind hero --format webp-lossless`. Original raw retained locally in `.sprite-source/raw/bg/processed/` (gitignored).
- **Notes:** Sprint 2.2 story 13e. The spaceship overlay parked on the top (escape) floor; on a win it tweens off-screen with a smoke trail. Lives in the `hero/` sprite folder by virtue of the `hero` processing profile, though it is decor, not the climbing character.

### Number Climb (Space Escape!) audio

- **Generator:** ElevenLabs
- **Files used:**
  - `public/assets/audio/sfx/hatch-open-1.mp3` (~9 KB, mono MP3, 96 kbps, `sfx` profile) — floor-advance hatch SFX
  - `public/assets/audio/midground/fire-klaxon-1.mp3` (~118 KB, ~10s mono MP3, 96 kbps) — burning-station fire + emergency-klaxon ambient loop
  - `public/assets/audio/music/game-background-song-loop-4.mp3` (~313 KB, stereo MP3, 160 kbps) — Space Escape gameplay music loop
- **Modifications:** Each encoded via `pnpm audio:encode` with the per-kind profile. The hatch SFX used `--kind sfx --no-trim` (preserves the short clip's full length). The fire-klaxon midground used `--kind midground --loudnorm-target -26` — 4 dB quieter than the midground default so the attention-grabbing klaxon stays in the background beneath foreground SFX. The music used `--kind music`. All metadata stripped.
- **Notes:** Sprint 2.2. Wired per-game via `GAME_MIDGROUND_MAP` / `GAME_MUSIC_MAP` + `SfxKeys.HatchOpen1` in `src/core/audioKeys.ts`; all scoped `game:number-climb` so they defer to the Climb game's preload.

### Title-screen splash art

- **Generator:** Midjourney (prompted by Ray Klundt, the project owner)
- **Files used:** `public/assets/images/Title-Splash-1.png`, `public/assets/images/Title-Splash-2.png` (~1.3 MB each)
- **Modifications:** none yet — raw Midjourney output. Will be reprocessed (resize / format) when wired into an actual splash scene.
- **Notes:** Candidate title/splash-screen hero art (kid + alien + blaster, arcade theme; one variant has floating math symbols). Not yet referenced by any code — staged for the splash-screen redesign tracked as sprint 2.2.1 story 9. First committed in sprint 2.2 (had been sitting untracked in the working tree).

## Project-original assets

Assets created specifically for mathBasher (custom illustrations, audio, etc.) are NOT listed here. They are covered by the project's primary license (AGPL-3.0-or-later) and are attributed by the project's `LICENSE` and `NOTICE` files at the project root.

## License of this file

This file is © 2026 Ray Klundt and is part of the mathBasher project, licensed under AGPL-3.0-or-later. The license terms of any third-party asset listed below are NOT modified by this file; each asset remains governed by its own original license as cited in its entry.
