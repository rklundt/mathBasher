<!--
SPDX-License-Identifier: AGPL-3.0-or-later
Copyright 2026 Ray Klundt
mathBasher is also available under a commercial license — see COMMERCIAL.md
-->

# Sprite Source (gitignored working folder)

This folder is gitignored. It holds the **raw** image files that are used to produce the final shipped sprites. Only the final processed PNGs in `public/assets/sprites/` are committed.

## Layout

```
.sprite-source/
├── README.md            this file (the only file here that's NOT gitignored)
├── raw/                 raw images from generators / Kenney packs / hand-drawn art
│   ├── alien/
│   │   ├── alien-green-1.png
│   │   └── alien-purple-1.png
│   ├── hero/
│   │   └── hero-ship.png
│   ├── projectile/
│   │   └── laser.png
│   └── processed/       successfully-encoded raws are moved here after processing
│       └── alien-green-1.png
└── working/             intermediate cuts, hand-edited variants, A/B comparisons
    └── alien/
        ├── alien-green-1.recolored.png
        └── alien-green-1.alt-pose.png
```

`raw/` vs `working/` follows the audio-pipeline convention:

- **`raw/<topic>/`** is for **untouched** generator output, Kenney pack source dumps, fresh exports. Treat as read-only inputs.
- **`working/<topic>/`** is for **hand-edited intermediates** — Photoshop layered exports flattened to PNG, recolored sprite variants, A/B comparisons that haven't been picked yet. Anything you'd want to revisit + re-process.

Both folders are gitignored; only the final processed PNG in `public/assets/sprites/` is committed.

## Why a separate folder

- Raw inputs are often 2–10× larger than the shipped paletted PNGs (especially Kenney CC0 sprites that come in full RGBA at 256×256 or higher). Committing them bloats the repo without helping anyone download the game faster.
- Generator output PNGs frequently embed prompt metadata, model name, or color-profile chunks that don't belong in a public repo.
- License attribution lives in `public/assets/CREDITS.md`, not in the raw files.
- Hand-drawn / Photoshop exports often carry XMP metadata blocks (Adobe-style author info, document history) that the strip pass removes — but the originals stay locally for re-processing.

## The `raw/processed/` convention

After a raw file has been **successfully encoded AND verified**, the sprite-pipeline skill moves it from `.sprite-source/raw/<topic>/<file>` to `.sprite-source/raw/processed/<file>`. This keeps `raw/` showing only "what's pending" so re-runs of the pipeline don't re-encode files that already shipped.

Don't manually delete files from `processed/` — they're the audit trail back to the original source. If you need to re-process a file (e.g. because the encoding profile changed), move it BACK from `processed/` to `raw/<topic>/`.

## AI-tool provenance

The current alien-video-{1..5}.mp4 source files used by `scripts/sprites/extract-from-video.mjs` were generated via **Midjourney** (videos rendered as 5.21s loops at 24 fps, 624×624 px, with the aliens arranged in a uniform R×C grid against a dark background — see `docs/adrs/ADR-0010-sprite-tier-strategy.md` for the option-C dark-bg rationale).

This is recorded here for license / TOS audit:

- If a future Midjourney TOS change requires attribution for derived art, this is the trail.
- If we ever swap to a different generator (Veo, Sora, Runway, etc.) the new tool's name should be appended here with a date so the provenance is per-batch.
- The five processed source videos themselves sit in `.sprite-source/raw/processed/` — local-only, gitignored, retained as the audit trail back to the prompted output.

The audio-side equivalent (ElevenLabs) is already recorded in `public/assets/CREDITS.md` under "Generated assets." When the curated alien sprites get tracked in git during sprint 0.7, a matching entry for the AI-generated alien art (generator, model, date, files used, modifications) should be appended there following the same template.

## Reproducibility

Whoever needs to regenerate a sprite from scratch should be able to drop a fresh raw export here, run `pnpm sprite:process --kind <kind> <raw-path> public/assets/sprites/<kind>/<name>.png`, and produce a byte-identical-ish PNG to the one currently shipped. The recipe is the source of truth, not the raw input.

The encoder script lives at `scripts/sprites/process.mjs`; per-kind profiles (size caps, palette settings, compression) are documented in the script itself + in `.claude/skills/sprite-pipeline/SKILL.md`.
