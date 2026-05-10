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
 *   pnpm sprite:process [--kind <kind>] [--no-resize] <input.png> <output.png>
 *
 * Kinds (the only legal values for `--kind`):
 *   alien        — enemy sprites; 96×96 max bounding box
 *   hero         — player ship; 128×128 max
 *   projectile   — bullet/laser; 32×32 max
 *   ui           — buttons / panels / frames; 256×256 max, lossless palette
 *   particle     — explosion / glow / smoke; 64×64 max
 *   bg           — parallax / tile art; 512×512 max
 *
 * If `--kind` is omitted, defaults to `alien` (the most common type for
 * mathBasher today).
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
// referenced from `.claude/skills/sprite-pipeline/SKILL.md`. If you
// change one of these numbers, update the skill doc to match.
// ------------------------------------------------------------------

const PROFILES = {
  alien: {
    maxDim: 96,
    palette: true,
    compressionLevel: 9,
    quality: 90,
    description: 'enemy sprites — 96×96 max bounding box',
  },
  hero: {
    maxDim: 128,
    palette: true,
    compressionLevel: 9,
    quality: 90,
    description: 'player ship — 128×128 max',
  },
  projectile: {
    maxDim: 32,
    palette: true,
    compressionLevel: 9,
    quality: 95,
    description: 'bullet/laser — 32×32 max (lossless quantize at this size)',
  },
  ui: {
    maxDim: 256,
    palette: true,
    compressionLevel: 9,
    quality: 100,
    description: 'buttons/panels/frames — 256×256 max, lossless palette',
  },
  particle: {
    maxDim: 64,
    palette: true,
    compressionLevel: 9,
    quality: 88,
    description: 'explosion/glow/smoke — 64×64 max',
  },
  bg: {
    maxDim: 512,
    palette: false, // gradients + smooth color need full RGB
    compressionLevel: 9,
    quality: 90,
    description: 'parallax/tile art — 512×512 max, full RGB',
  },
};

// ------------------------------------------------------------------
// Argument parsing — minimal, matches `audio/encode.mjs` style.
// ------------------------------------------------------------------

function parseArgs(args) {
  const opts = { kind: 'alien', resize: true };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--kind') {
      opts.kind = args[++i];
    } else if (a === '--no-resize') {
      opts.resize = false;
    } else if (a === '--resize') {
      opts.resize = true;
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
  if (positional.length !== 2) {
    console.error('Need exactly two positional args: <input.png> <output.png>');
    printHelp();
    exit(1);
  }
  if (!Object.prototype.hasOwnProperty.call(PROFILES, opts.kind)) {
    console.error(`Unknown --kind "${opts.kind}". Valid: ${Object.keys(PROFILES).join(', ')}`);
    exit(1);
  }
  return { ...opts, input: positional[0], output: positional[1] };
}

function printHelp() {
  console.log(`Usage: pnpm sprite:process [--kind <kind>] [--no-resize] <input.png> <output.png>

Kinds:
${Object.entries(PROFILES).map(([k, p]) => `  ${k.padEnd(11)} ${p.description}`).join('\n')}

Defaults to --kind alien if --kind is omitted.
--no-resize skips the resize pass (use when input is already at target size).`);
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
  if (ext !== '.png') {
    console.error(`Input must be PNG (got ${ext}). Sprite pipeline assumes PNG with transparent background.`);
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
