#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Sprite-pipeline inspector. Mirrors `scripts/audio/probe.mjs` —
 * read a single image, report dimensions + format + alpha-channel +
 * file size + metadata presence. Used to:
 *   - sanity-check inputs before encoding (got the right thing?)
 *   - verify outputs after encoding (correct kind profile applied?)
 *   - audit shipped sprites (looking for unexpectedly-large files
 *     or unexpected metadata)
 *
 * Usage:
 *   pnpm sprite:probe <file.png>
 *
 * Output is a single key-value block, similar to `pnpm audio:probe`.
 * Designed to be eyeballed by a human, not parsed by another script.
 */

import { argv, exit } from 'node:process';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

async function main() {
  const args = argv.slice(2).filter((a) => a !== '--help' && a !== '-h');
  const showHelp = argv.slice(2).some((a) => a === '--help' || a === '-h');

  if (showHelp) {
    console.log(`Usage: pnpm sprite:probe <file.png>

Reports image dimensions, format, alpha channel presence, file size,
and any metadata blocks present (EXIF, ICC profile, etc.).

Used as a sanity check before/after running pnpm sprite:process.`);
    exit(0);
  }

  if (args.length !== 1) {
    console.error('Need exactly one positional arg: <file.png>');
    exit(1);
  }

  const filePath = args[0];
  let buf;
  try {
    buf = await readFile(filePath);
  } catch (err) {
    console.error(`Could not read file: ${filePath}`);
    console.error(err.message);
    exit(1);
  }

  const sharp = (await import('sharp')).default;
  const meta = await sharp(buf).metadata();
  const stats = await sharp(buf).stats();

  // Sharp reports `hasAlpha`, but for sprite work we also care
  // whether the alpha channel actually has TRANSPARENCY anywhere
  // (a 4-channel image whose alpha is uniformly 255 is opaque).
  // `stats.channels[3]` exposes alpha statistics when alpha exists.
  const alphaChannel = meta.hasAlpha && stats.channels.length >= 4 ? stats.channels[3] : null;
  const trulyTransparent = alphaChannel && alphaChannel.min < 255;

  // Detect metadata blocks. Sharp's metadata() returns truthy props for:
  //   exif    — EXIF block (rare in sprite art; if present, generator metadata leak)
  //   icc     — ICC color profile (sometimes shipped, but not strictly needed for game art)
  //   iptc    — IPTC photo metadata (very unlikely; leak indicator)
  //   xmp     — XMP metadata (Adobe-style; common in Photoshop exports)
  // The strip pass in process.mjs removes all of these.
  const metaBlocks = [];
  if (meta.exif) metaBlocks.push(`EXIF (${meta.exif.length} B)`);
  if (meta.icc) metaBlocks.push(`ICC profile (${meta.icc.length} B)`);
  if (meta.iptc) metaBlocks.push(`IPTC (${meta.iptc.length} B)`);
  if (meta.xmp) metaBlocks.push(`XMP (${meta.xmp.length} B)`);

  console.log(`Probe: ${basename(filePath)}`);
  console.log(`  Path: ${filePath}`);
  console.log(`  Size: ${formatBytes(buf.length)}`);
  console.log(`  Format: ${meta.format}`);
  console.log(`  Dimensions: ${meta.width}×${meta.height}`);
  console.log(`  Channels: ${meta.channels}`);
  console.log(`  Bit depth: ${meta.depth}`);
  if (meta.paletteBitDepth) {
    console.log(`  Paletted: yes (${meta.paletteBitDepth}-bit)`);
  } else {
    console.log(`  Paletted: no (full RGB${meta.hasAlpha ? 'A' : ''})`);
  }
  console.log(`  Alpha channel: ${meta.hasAlpha ? 'present' : 'absent'}`);
  if (alphaChannel) {
    console.log(
      `    range: ${alphaChannel.min}–${alphaChannel.max} ` +
        `(${trulyTransparent ? 'has transparent pixels' : 'fully opaque despite alpha channel'})`,
    );
  }
  console.log(`  Metadata blocks: ${metaBlocks.length === 0 ? 'none (clean)' : metaBlocks.join(', ')}`);
  console.log(`  Density: ${meta.density ?? 'unset'} dpi`);
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

main().catch((err) => {
  console.error('Probe failed:');
  console.error(err.stack ?? err.message ?? err);
  exit(1);
});
