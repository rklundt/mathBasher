#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Sprite-pipeline encoder. Mirrors `scripts/audio/encode.mjs` in shape +
 * conventions: per-kind processing profile (size cap + compression),
 * one-pass through `sharp`, metadata stripped, deterministic output.
 *
 * Usage:
 *   pnpm sprite:process [--kind <kind>] [--name <basename>] [--no-resize] <input.png> [output.png]
 *
 * Kinds (the only legal values for `--kind`):
 *   alien        — enemy sprites; 96×96 max bounding box   → public/assets/sprites/aliens/
 *   hero         — player ship; 128×128 max                → public/assets/sprites/hero/
 *   projectile   — bullet/laser; 32×32 max                 → public/assets/sprites/projectiles/
 *   ui           — buttons / panels / frames; 256×256 max  → public/assets/sprites/ui/
 *   particle     — explosion / glow / smoke; 64×64 max     → public/assets/sprites/particles/
 *   bg           — parallax / tile art; 512×512 max        → public/assets/sprites/bg/
 *
 * If `--kind` is omitted, defaults to `alien` (the most common type for
 * mathBasher today).
 *
 * Output path resolution (in priority order):
 *   1. Positional `output.png` arg if provided — explicit override.
 *   2. `--name <basename>` derives `public/assets/sprites/<kind-folder>/<basename>.png`.
 *      Saves typing during batch ingest (e.g. Kenney pack with 30+ files).
 *   3. If neither is provided, the script errors and prints help.
 *
 * The script ALWAYS:
 *   - validates the input has a transparent alpha channel (warns if not —
 *     opaque-bg PNGs work but flag the user before shipping)
 *   - resizes to fit within the kind's bounding box (preserves aspect, no
 *     enlargement, transparent areas remain transparent)
 *   - quantizes to a paletted PNG (drastically smaller for typical sprite
 *     art with limited color counts)
 *   - strips ALL metadata sharp doesn't strip by default (no EXIF, no XMP,
 *     no ICC, no tEXt chunks → no leaked generator name / prompts)
 *   - writes deterministic output — running twice on the same input
 *     produces a byte-identical PNG
 *
 * Override `--no-resize` to skip the resize pass (e.g. when an asset
 * is already at the right size and you only want compression + strip).
 *
 * Reads input + writes output via Node's fs API (no pipes, no shell
 * escapes in arguments). Sharp is imported lazily so `--help` invocation
 * doesn't pay the libvips load cost.
 */

import { argv, exit } from 'node:process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, basename, extname } from 'node:path';
import { mkdir } from 'node:fs/promises';

// ------------------------------------------------------------------
// Per-kind profiles. Tweaked over time — these are the SAME values
// referenced from the sprite-pipeline workflow doc. If you change
// one of these numbers, update the workflow doc to match.
// ------------------------------------------------------------------

const PROFILES = {
  alien: {
    // Bumped 96 → 192 in sprint 0.7 Story 13 to align with ADR-0010's
    // 128/192 video-extract tier strategy. The single-PNG `process.mjs`
    // pipeline is the path for hand-painted / individually-curated
    // alien sprites (rare — most aliens come through the video-extract
    // pipeline at 128/192 tiers). 192 max here matches the larger of
    // the two tiers so a single-PNG hand-painted alien renders crisp
    // on desktop.
    maxDim: 192,
    palette: true,
    compressionLevel: 9,
    quality: 90,
    folder: 'public/assets/sprites/aliens',
    description: 'enemy sprites — 192×192 max bounding box',
  },
  hero: {
    // Bumped 128 → 192 in sprint 0.7 Story 1. Hero is a single static
    // asset (one on screen, no animation); 192 ships universally crisp
    // (downscales invisibly on phone, renders mostly-native on desktop)
    // without paying the two-tier tooling cost the aliens needed. ~14 KB
    // vs ~6 KB is a rounding error against the alien-sprite payload.
    maxDim: 192,
    palette: true,
    compressionLevel: 9,
    quality: 90,
    folder: 'public/assets/sprites/hero',
    description: 'player ship — 192×192 max',
  },
  projectile: {
    maxDim: 32,
    palette: true,
    compressionLevel: 9,
    quality: 95,
    folder: 'public/assets/sprites/projectiles',
    description: 'bullet/laser — 32×32 max (lossless quantize at this size)',
  },
  ui: {
    maxDim: 256,
    palette: true,
    compressionLevel: 9,
    quality: 100,
    folder: 'public/assets/sprites/ui',
    description: 'buttons/panels/frames — 256×256 max, lossless palette',
  },
  particle: {
    maxDim: 64,
    palette: true,
    compressionLevel: 9,
    quality: 88,
    folder: 'public/assets/sprites/particles',
    description: 'explosion/glow/smoke — 64×64 max',
  },
  bg: {
    // Bumped from 512 → 1280 in sprint 0.7 Story 1 so the gameplay-canvas
    // nebula keeps full 1280×720 resolution. Smaller bg tiles (e.g. a
    // parallax star strip) still naturally cap at their source size since
    // resize is fit:'inside' with no enlargement.
    maxDim: 1280,
    palette: false, // gradients + smooth color need full RGB
    compressionLevel: 9,
    quality: 90,
    folder: 'public/assets/sprites/bg',
    description: 'parallax/tile art — 1280×1280 max, full RGB',
  },
};

// ------------------------------------------------------------------
// Argument parsing — minimal, matches `audio/encode.mjs` style.
// ------------------------------------------------------------------

/** Output formats. `webp` = lossy q85 (photo-like bg art); `webp-lossless`
 *  = lossless WebP (sprite art with alpha — no edge halos); `png` = the
 *  legacy default. Sprint 2.2.1 story 6. */
const FORMATS = ['png', 'webp', 'webp-lossless'];
/** Quality for lossy WebP — q85 is the bg sweet spot (≈60 % smaller than PNG, no visible artefacts). */
const WEBP_LOSSY_QUALITY = 85;
/** sharp WebP `effort` (0-6) — 6 = best compression, worth it for a one-shot build asset. */
const WEBP_EFFORT = 6;

function parseArgs(args) {
  const opts = {
    kind: 'alien',
    resize: true,
    name: null,
    brightness: 1.0,
    flop: false,
    format: 'png',
  };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--kind') {
      opts.kind = args[++i];
    } else if (a === '--name') {
      opts.name = args[++i];
    } else if (a === '--format') {
      opts.format = args[++i];
      if (!FORMATS.includes(opts.format)) {
        console.error(`--format must be one of ${FORMATS.join(', ')} (got "${opts.format}")`);
        exit(1);
      }
    } else if (a === '--no-resize') {
      opts.resize = false;
    } else if (a === '--resize') {
      opts.resize = true;
    } else if (a === '--flop') {
      // Horizontal flip via sharp's .flop() — useful when source art faces
      // the wrong direction (e.g. a hero ship pointing left when the
      // gameplay convention is right-facing). Sprint 0.7 first hit this
      // for speeder-2; sprint 1.1 wrap-up promoted the one-off `sharp.flop()`
      // shim into a reusable CLI flag because speeders 1 and 2 both
      // turned out to need it after playtest. ('flop' is sharp's term for
      // horizontal mirror; 'flip' would be vertical.)
      opts.flop = true;
    } else if (a === '--brightness') {
      const v = parseFloat(args[++i]);
      if (Number.isNaN(v) || v <= 0 || v > 2) {
        console.error(`--brightness must be a positive number ≤ 2.0 (got "${args[i]}")`);
        exit(1);
      }
      opts.brightness = v;
    } else if (a === '--help' || a === '-h') {
      printHelp();
      exit(0);
    } else if (a.startsWith('--')) {
      console.error(`Unknown flag: ${a}`);
      printHelp();
      exit(1);
    } else {
      positional.push(a);
    }
  }

  if (!Object.prototype.hasOwnProperty.call(PROFILES, opts.kind)) {
    console.error(`Unknown --kind "${opts.kind}". Valid: ${Object.keys(PROFILES).join(', ')}`);
    exit(1);
  }

  // Output path resolution: explicit positional output wins; --name derives
  // from the kind's canonical folder; neither = error.
  let input;
  let output;
  if (positional.length === 2) {
    [input, output] = positional;
    if (opts.name !== null) {
      console.error('Cannot specify both --name and an explicit output path. Pick one.');
      exit(1);
    }
  } else if (positional.length === 1 && opts.name !== null) {
    input = positional[0];
    // Output extension follows the chosen format — webp / webp-lossless
    // both write `.webp`; png writes `.png`.
    const outExt = opts.format === 'png' ? 'png' : 'webp';
    output = `${PROFILES[opts.kind].folder}/${opts.name}.${outExt}`;
  } else {
    console.error(
      'Need either: (a) two positional args <input.png> <output.png>, ' +
        'OR (b) one positional <input.png> + --name <basename> (derives output from --kind folder).',
    );
    printHelp();
    exit(1);
  }

  return { ...opts, input, output };
}

function printHelp() {
  console.log(`Usage:
  pnpm sprite:process [--kind <kind>] [--no-resize] <input.png> <output.png>
  pnpm sprite:process [--kind <kind>] --name <basename> <input.png>

Kinds:
${Object.entries(PROFILES).map(([k, p]) => `  ${k.padEnd(11)} ${p.description}`).join('\n')}

Output path resolution (in priority order):
  1. Positional <output.png> arg — explicit override.
  2. --name <basename> derives <kind-folder>/<basename>.png. Folder per kind:
${Object.entries(PROFILES).map(([k, p]) => `       ${k.padEnd(11)} ${p.folder}/`).join('\n')}

Defaults to --kind alien if --kind is omitted.
--format <png|webp|webp-lossless> picks the output encoder (default png).
  webp = lossy q85 (photo-like bg art); webp-lossless = lossless WebP
  (sprite art with alpha). webp / webp-lossless write a .webp file.
--no-resize skips the resize pass (use when input is already at target size).
--brightness N multiplies output brightness via sharp's .modulate() (default 1.0
  = unchanged). Useful for taming visually-busy bg assets so they don't compete
  with foreground sprites — e.g. --brightness 0.6 = 40% darker.
--flop horizontally mirrors the output (sharp's .flop()). Use when source art
  faces the wrong direction — e.g. a hero ship pointing left when the gameplay
  convention is right-facing. ('flip' would be vertical; sharp uses 'flop' for
  horizontal.)`);
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main() {
  const opts = parseArgs(argv.slice(2));
  const profile = PROFILES[opts.kind];

  // Lazy-import sharp so --help doesn't pay the libvips load cost
  // (~200ms on cold cache, noticeable for `pnpm sprite:process --help`).
  const sharp = (await import('sharp')).default;

  // Read input as a Buffer (sharp accepts paths too, but reading
  // explicitly here gives clean error messages on missing file).
  let inputBuf;
  try {
    inputBuf = await readFile(opts.input);
  } catch (err) {
    console.error(`Could not read input: ${opts.input}`);
    console.error(err.message);
    exit(1);
  }

  const ext = extname(opts.input).toLowerCase();
  // Most kinds need transparency (PNG). The `bg` kind doesn't — gradients
  // compress better in JPG, so we accept JPG for bg inputs too.
  const allowedExts = opts.kind === 'bg' ? ['.png', '.jpg', '.jpeg'] : ['.png'];
  if (!allowedExts.includes(ext)) {
    console.error(
      `Input extension ${ext} not allowed for --kind ${opts.kind}. Allowed: ${allowedExts.join(', ')}.`,
    );
    exit(1);
  }

  // Read input metadata for the "before" report + alpha-channel validation.
  const inputMeta = await sharp(inputBuf).metadata();
  const inputBytes = inputBuf.length;
  const hasAlpha = inputMeta.hasAlpha === true;
  if (!hasAlpha) {
    console.warn(
      `⚠  Input has no alpha channel — sprite pipeline assumes PNGs with transparent backgrounds.\n` +
        `   The output will still process, but a solid background may show in-game. Consider re-exporting with transparency.`,
    );
  }

  // Build the sharp pipeline.
  let pipeline = sharp(inputBuf, {
    // Don't auto-rotate based on EXIF orientation — sprites should be
    // authored already-oriented; an EXIF rotation in a sprite is
    // almost certainly a generator quirk we don't want to honor.
    failOn: 'warning',
  });

  if (opts.resize) {
    pipeline = pipeline.resize({
      width: profile.maxDim,
      height: profile.maxDim,
      // `inside` preserves aspect, fits within the bounding box, never
      // enlarges. A 32×32 input with a 96×96 max stays at 32×32.
      // A 200×100 input with a 96×96 max becomes 96×48.
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Horizontal flip via sharp's .flop(). Applied AFTER resize (cheaper
  // to mirror a smaller image) and BEFORE brightness/quantization
  // (mirroring is purely a coordinate transform; doesn't interact with
  // pixel values).
  if (opts.flop) {
    pipeline = pipeline.flop();
  }

  // Brightness adjustment via sharp's modulate. brightness=1.0 is no-op;
  // 0.6 = 40% darker (good for taming busy backdrops). Applied BEFORE
  // PNG quantization so the darkened pixels are what get palette-mapped.
  if (opts.brightness !== 1.0) {
    pipeline = pipeline.modulate({ brightness: opts.brightness });
  }

  // Output encoder — branch on --format (sprint 2.2.1 story 6).
  if (opts.format === 'webp') {
    // Lossy WebP — for photo-like bg art with no transparency. q85 is
    // the sweet spot: ≈60 % smaller than PNG with no visible artefacts
    // at gameplay viewing size.
    pipeline = pipeline.webp({ quality: WEBP_LOSSY_QUALITY, effort: WEBP_EFFORT });
  } else if (opts.format === 'webp-lossless') {
    // Lossless WebP — for sprite art WITH alpha. Pixel-identical to the
    // source (no edge halos around transparent areas, which lossy can
    // introduce) while still ≈25 % smaller than paletted PNG.
    pipeline = pipeline.webp({ lossless: true, effort: WEBP_EFFORT });
  } else {
    // PNG output config. `palette: true` for kinds that quantize cleanly
    // (most sprite art); `palette: false` for `bg` which needs full RGB
    // for gradients. `compressionLevel: 9` is the highest zlib setting
    // (slower compress, smaller output, no quality difference).
    pipeline = pipeline.png({
      palette: profile.palette,
      compressionLevel: profile.compressionLevel,
      quality: profile.quality,
      // `effort` is a libimagequant knob (only applies when palette: true).
      // 7 = good balance of speed vs compression. 10 is the max but
      // takes ~3x longer for marginal size savings.
      effort: 7,
      // Adaptive filtering chooses the best PNG row filter per row. For
      // pixel art / sprites this is consistently a small win.
      adaptiveFiltering: true,
    });
  }

  // Sharp by default strips most metadata. Explicitly NOT calling
  // `.withMetadata()` ensures no EXIF / IPTC / XMP / ICC profile
  // sneaks through. PNG tEXt/zTXt/iTXt chunks are also dropped by
  // sharp's default PNG encoder when re-encoding.

  // Make sure the output directory exists. Mirrors the audio/encode
  // ergonomic — script doesn't fail on a missing `public/assets/sprites/<kind>/`.
  await mkdir(dirname(opts.output), { recursive: true });

  const outputBuf = await pipeline.toBuffer();
  await writeFile(opts.output, outputBuf);

  // Report. Match the audio/encode output style — single block, key facts.
  const outputMeta = await sharp(outputBuf).metadata();
  const outputBytes = outputBuf.length;
  const sizeReduction = ((1 - outputBytes / inputBytes) * 100).toFixed(1);

  console.log(`✓ ${basename(opts.input)} → ${opts.output}`);
  console.log(`  Kind: ${opts.kind} (${profile.description})`);
  console.log(
    `  Dimensions: ${inputMeta.width}×${inputMeta.height} → ${outputMeta.width}×${outputMeta.height}`,
  );
  console.log(
    `  Size: ${formatBytes(inputBytes)} → ${formatBytes(outputBytes)} (${sizeReduction}% smaller)`,
  );
  console.log(`  Format: ${outputMeta.format}, palette=${outputMeta.paletteBitDepth ? 'yes' : 'no'}, alpha=${outputMeta.hasAlpha ? 'yes' : 'no'}`);
  if (!hasAlpha) {
    console.log(`  ⚠  Input was opaque — output is opaque too. Re-export with transparency if shipping.`);
  }
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// Guard against unhandled rejections — single source of truth for
// the script's exit code.
main().catch((err) => {
  console.error('Encode failed:');
  console.error(err.stack ?? err.message ?? err);
  exit(1);
});
