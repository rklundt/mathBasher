# ADR-0010: Sprite tier strategy + extract defaults

**Status:** Accepted (2026-05-10)
**Implements:** Sprint 0.7 (Art polish — pending)
**Builds on:** [ADR-0009](ADR-0009-sharp-as-dev-dependency.md) (`sharp` as a project-scoped dev dependency)

## Context

Sprint 0.6.1 stood up the sprite-extraction pipeline (`pnpm sprite:extract` — video → per-cell WebP spritesheets). Initial test extracts ran at the script's defaults: `--cell-size 64` and `--fps 8`. 114 test sprites across five alien-video batches were produced and visually inspected.

Two problems surfaced during QA, both ahead of any commitment to ship:

1. **64×64 looks soft on desktop.** The game's design canvas is 1280×720 with Phaser FIT scaling. On a 1920×1080 desktop the viewport scales the canvas up ~1.5×, so a 64×64 sprite renders at ~96 device pixels (~1.5× upscale of the WebP). On retina-class displays (DPR ≥ 2), the effective upscale is ~3×. Visibly soft. On phones the same sprite renders at ~32 device pixels — fine — so the issue is specifically a desktop-tier deficiency, not a uniform problem.
2. **8 fps reads as stop-motion.** For sprites whose source animation is "creature breathing/wiggling/idling," 8 fps lands as a slideshow — fine for retro pixel art (Stardew, Celeste), wrong for organically-animated AI-generated aliens.

Source video constraints set the upper bound on what we can extract without upscaling AI-generated raster:

- 624×624 source, 4×4 grid (alien-video-5): cells are 156×156 → max clean extract ~128×128
- 624×624 source, 3×3 grid (alien-video-1, -4): cells are 208×208 → max clean extract ~192×192
- 624×624 source, 5×N grids (alien-video-1, -2, -3): cells are 89-125px → max clean extract ~96×96 (insufficient for desktop)

The extract pipeline already supports arbitrary `--cell-size` and `--fps` — the question is what defaults ship and how multiple resolutions get organized.

## Decision

**Adopt a two-tier sprite output strategy at 12 fps:**

| Tier | Resolution | Audience | Storage path |
|---|---|---|---|
| `128` | 128×128 | Phone (downscaled by GPU), tablet | `public/assets/sprites/<kind>/128/<name>.webp` |
| `192` | 192×192 | Desktop, retina-class displays | `public/assets/sprites/<kind>/192/<name>.webp` |

**Default frame rate: 12 fps** (was 8). 24 fps source ÷ 12 fps target = exactly 2 — clean integer downsample, no temporal aliasing.

**Filename is identical across tiers** — only the path prefix changes. Asset loader picks the tier once at boot from viewport size × `window.devicePixelRatio` and uses the corresponding path prefix:

```ts
const TIER = pickSpriteTier(window.innerWidth, window.devicePixelRatio);
// '128' or '192'
this.load.image('alien1-r0c0', `/assets/sprites/aliens/${TIER}/alien1-r0c0.webp`);
```

Phaser sees one asset key (`'alien1-r0c0'`) regardless of tier — the tier choice is a URL-construction concern at boot, not a per-sprite branch in game code.

### Why no 64×64 tier

A third tier (`64/`) for cellular phones was considered and rejected. The 128→64 GPU downscale is visually invisible (modern GPUs do bilinear/trilinear filtering for free), so the only argument for shipping a 64-tier is bandwidth on cellular. The 128 tier is ~2.1 MB per 9-sprite batch — well under any threshold worth a separate pipeline run, separate loader branch, or doubled storage. Revisit only if cellular telemetry surfaces a real problem.

### Why subfolder organization, not filename suffix

Three options were considered:

1. **Subfolder by tier** (`aliens/128/foo.webp`, `aliens/192/foo.webp`) — chosen.
2. **Suffix by tier** (`aliens/foo@1x.webp`, `aliens/foo@2x.webp`) — common in iOS bundles, web `srcset`.
3. **Single mid-tier (96×96)** — compromise that looks fine 0.7×–1.5× of native, fails at retina-desktop.

Option 1 wins on three points:

- **Single Phaser asset key.** The key (`'alien1-r0c0'`) doesn't carry tier info. Game code references one name; the loader resolves the URL. Suffix scheme would either repeat `@1x`/`@2x` in every reference (grep noise, typo surface) or strip it at runtime (extra layer).
- **Cleaner replacement.** Regenerating a sprite overwrites three files in three folders, same names. Suffix scheme means renaming each output during the pipeline run.
- **Composes cleanly.** Adding a 4th tier (e.g. `96/` if a middle-density tier ever proves useful) or alternate format (`avif/128/`) is a folder. Suffix gets gnarly fast (`foo@1x.avif` vs `@2x.webp`).

### Why 12 fps, not 8 or 24

- **8 fps:** fine for stylized retro/pixel art with deliberately choppy "stop-motion" feel. Wrong for organic creature animation (looks cheap).
- **12 fps:** the cartoon-animation gold standard ("animation on twos" in Disney/anime tradition). Reads as fluid life without being hyperrealistic. 1.5× the bytes of 8 fps — irrelevant at these file sizes.
- **24 fps:** overkill. The alien is a peripheral element while the player solves math; full smoothness wastes bandwidth and texture memory.

24 fps source ÷ 12 fps = 2 — clean integer downsample. (24÷8 = 3 was also clean; both rates avoid temporal aliasing.) The choice is purely visual quality vs. file size, and 12 wins on quality at negligible cost.

## Storage projection

Per 9-sprite 3×3 batch (extrapolated from 8 fps measurements × 1.5 for 12 fps × area scale per tier):

| Tier | Per-sprite | Per-batch (×9) |
|---|---|---|
| 128 | ~230 KB | ~2.1 MB |
| 192 | ~500 KB | ~4.5 MB |
| **Combined** | — | **~6.6 MB** |

Estimating ~5 source-video batches × ~50 keepers (curated from ~100+ raw extracts): **~30-35 MB total** of shipped sprite assets across both tiers. Well under any threshold worth optimizing.

## Consequences

- **Pro:** Desktop and retina-class displays get crisp sprites without phones paying the bandwidth tax of unused detail.
- **Pro:** Loader complexity is one boot-time function (`pickSpriteTier`) and a URL prefix. Game code is unchanged — `load.image('alien1-r0c0', ...)` works regardless of tier.
- **Pro:** Subfolder layout composes if a third tier or alternate format is ever needed without renaming any existing files.
- **Pro:** 12 fps brings creature animations from "stop-motion" to "alive" for a 1.5× bytes cost — a quality lift completely free at these file sizes.
- **Con:** Pipeline must run twice per source video (once per tier). Mitigated by either (a) a `--tiers 128,192` flag on `sprite:extract` that loops internally, or (b) two explicit invocations. Decide during 0.7 implementation.
- **Con:** All existing test extracts (`alien1` through `alien5`, ~114 WebPs at 64×64 / 8 fps in `public/assets/sprites/aliens/`) are below the new tier+fps targets and must be **discarded and re-extracted** before 0.7 curation. The source videos are still in `.sprite-source/raw/processed/` so re-extraction is a script re-run, not a content re-creation.
- **Con:** `scripts/sprites/process.mjs`'s `alien.maxDim = 96` (the single-PNG sprite processor introduced in ADR-0009) is now stale relative to the 128/192 video-extract decision. Bump to 192 — or split into per-tier limits — when 0.7 starts, so single-PNG and video-extract pipelines agree on what "big enough" means.

## Out of scope (deliberately deferred)

- **Variant selection at runtime** (mid-session tier swap on viewport change) — adds complexity for a vanishingly rare scenario (user resizing their browser mid-game). Boot-time pick is enough.
- **AVIF / next-gen format alternatives** — WebP is universally supported in 2026 target browsers; AVIF would be a 20-30% size win but adds a second encode pass and a loader fallback. Consider only if total asset weight becomes a real problem.
- **Per-sprite tier overrides** (e.g. one alien is hand-tweaked at 256×256) — pipeline supports it via `--cell-size`, but no sprite has earned the special-case treatment yet.

## Revisit if

- A real cellular-data complaint surfaces (then add the `64/` tier, paying for the loader branch).
- Source video cell sizes drop below 192px (then 192 tier becomes upscaled — either accept the soft look or drop to 128 max).
- Phaser's asset loader changes such that subfolder URL construction becomes awkward (unlikely; Phaser 3 has been stable here for years).
- A new sprite kind is introduced (hero, ui, particle) where the per-kind tier choice should differ from `alien` — ADR amendment, not a new ADR.

## Implementation checklist (for sprint 0.7)

- [ ] `scripts/sprites/extract-from-video.mjs`: change defaults to `--cell-size 128 --fps 12`. Add `--tiers 128,192` flag (or document the two-pass invocation).
- [ ] `scripts/sprites/extract-from-video.mjs`: write to `public/assets/sprites/<kind>/<size>/` instead of `public/assets/sprites/<kind>/`.
- [ ] `scripts/sprites/process.mjs`: bump `alien.maxDim` from 96 to 192 (or split per-tier).
- [ ] Sprite-pipeline workflow doc: V4 (confirm batch settings) reflects 12 fps + two-tier defaults; V7 (curate) curates from the 192 tier and trusts 128 as a derived downscale.
- [ ] `src/core/`: add `pickSpriteTier(viewportWidth, devicePixelRatio): '128' | '192'` (boot-time helper).
- [ ] `BootScene.preload`: load alien sprites from the picked-tier subfolder.
- [ ] Discard the 114 existing 64×64 / 8 fps test extracts in `public/assets/sprites/aliens/`. Re-run the pipeline against `.sprite-source/raw/processed/alien-video-{1..5}.mp4` at the new defaults.
