#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Inspect an audio file via ffprobe — duration, sample rate, channels,
 * bitrate, codec, and a quick volume-detect pass to surface peak/mean dB
 * (useful for sanity-checking loudness before/after encode).
 *
 * `ffprobe` ships in the same binary distribution as `ffmpeg`, but
 * `ffmpeg-static` only exports the path to `ffmpeg`. The probe is
 * implemented by calling `ffmpeg -i <file>` and parsing the stderr block
 * ffmpeg always prints when an input is supplied without an output.
 *
 * Usage:
 *   node scripts/audio/probe.mjs <file>
 *   pnpm audio:probe public/assets/audio/sfx/fire-1.mp3
 */

import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static');

const argv = process.argv.slice(2);
if (argv.length !== 1 || argv[0] === '-h' || argv[0] === '--help') {
  console.log('Usage: node scripts/audio/probe.mjs <file>');
  process.exit(argv[0] === '-h' || argv[0] === '--help' ? 0 : 2);
}

const file = resolve(argv[0]);
if (!existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

const sizeBytes = statSync(file).size;
console.log(`File: ${file}`);
console.log(`Size: ${(sizeBytes / 1024).toFixed(1)} KB`);

// Pass 1: ffmpeg -i prints stream info to stderr (and exits non-zero because
// no output was requested — that's expected).
const info = spawnSync(ffmpegPath, ['-hide_banner', '-i', file], {
  encoding: 'utf8',
});

// Filter to the lines we care about (Input / Duration / Stream / Metadata).
// Metadata is surfaced specifically so leak issues (e.g. encoder identifying
// itself in a TSSE tag) get caught at probe time instead of after-the-fact.
const stderr = info.stderr || '';
const infoLines = stderr
  .split('\n')
  .filter((l) => /Duration|Stream|Input|Metadata/.test(l))
  .map((l) => l.trim());
console.log('--- Stream info ---');
for (const line of infoLines) console.log(`  ${line}`);

// Walk the stderr looking for ANY metadata field lines (key : value) inside
// a Metadata: block, regardless of which key. Surface them as warnings —
// any output of audio:encode should report ZERO metadata fields here.
const metadataFields = collectMetadataFields(stderr);
if (metadataFields.length > 0) {
  console.log('--- Metadata fields detected (should be empty for shipped assets) ---');
  for (const f of metadataFields) console.log(`  WARN: ${f}`);
} else {
  console.log('--- Metadata fields: none ---');
}

function collectMetadataFields(s) {
  const lines = s.split('\n');
  const out = [];
  let inMetadata = false;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (/^\s*Metadata:\s*$/.test(line)) {
      inMetadata = true;
      continue;
    }
    if (inMetadata) {
      // Metadata blocks contain "    key : value" lines indented further than
      // the surrounding container/stream lines. A non-indented line ends the
      // block.
      if (/^\s{2,}\S/.test(line) && line.includes(':')) {
        out.push(line.trim());
      } else if (line.trim() === '') {
        // continue — blank lines inside metadata blocks are fine
      } else {
        inMetadata = false;
      }
    }
  }
  return out;
}

// Pass 2: volumedetect filter — gives mean and peak volume in dBFS, useful
// for verifying loudness-normalization landed in the expected range.
const vol = spawnSync(
  ffmpegPath,
  ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
  { encoding: 'utf8' },
);
const volLines = (vol.stderr || '')
  .split('\n')
  .filter((l) => /mean_volume|max_volume|n_samples/.test(l))
  .map((l) => l.trim());
console.log('--- Volume ---');
for (const line of volLines) console.log(`  ${line}`);
