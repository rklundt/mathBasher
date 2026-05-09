#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * One-pass audio encoder for shipped SFX and music.
 *
 * Takes a raw audio file (WAV / AIFF / FLAC / etc.) and produces a properly
 * encoded MP3 ready to drop into `public/assets/audio/`. The pipeline does
 * everything a "ready-to-ship" file needs in one ffmpeg pass:
 *
 *   1. Trim silence at both ends (peak detection, -45dB threshold, 5ms guard)
 *   2. Loudness-normalize to -16 LUFS / -1.5 dBTP (kid-safe; no blast-loud
 *      sounds, EBU R128 standard for spoken/game audio)
 *   3. Strip ALL metadata (no leaked generator names, prompts, timestamps)
 *   4. Encode to MP3 at the project's standard rate
 *
 * Defaults match the audio guidance documented for this project:
 *   --kind sfx    -> 96 kbps mono   (aggressive trim, normalized for SFX)
 *   --kind music  -> 160 kbps stereo (gentle trim, music-loudness normalized)
 *
 * Usage:
 *   node scripts/audio/encode.mjs <input> <output> [--kind sfx|music] [--no-trim]
 *
 * Or via the pnpm wrapper:
 *   pnpm audio:encode .audio-source/raw/fire/take-1.wav public/assets/audio/sfx/fire-1.mp3
 *   pnpm audio:encode --kind music input.wav public/assets/audio/music/menu-loop.mp3
 *
 * Reproducibility: the recipe lives here, not in tribal knowledge. Whoever
 * needs to re-encode an asset drops a fresh raw export and runs the same
 * command — output is deterministic.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static');

if (!ffmpegPath) {
  console.error('ffmpeg-static did not resolve a binary path for this platform.');
  console.error('Re-run `pnpm install` and check the postinstall output.');
  process.exit(2);
}

// --- Argument parsing (no external dep — keep this script self-contained) ---

const argv = process.argv.slice(2);
const positional = [];
let kind = 'sfx';
let trim = true;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--kind') {
    kind = argv[++i];
  } else if (a === '--no-trim') {
    trim = false;
  } else if (a === '-h' || a === '--help') {
    printHelp();
    process.exit(0);
  } else if (a.startsWith('--')) {
    console.error(`Unknown flag: ${a}`);
    printHelp();
    process.exit(2);
  } else {
    positional.push(a);
  }
}

if (positional.length !== 2) {
  printHelp();
  process.exit(2);
}

const [inputArg, outputArg] = positional;
const input = resolve(inputArg);
const output = resolve(outputArg);

if (!existsSync(input)) {
  console.error(`Input file not found: ${input}`);
  process.exit(1);
}

if (kind !== 'sfx' && kind !== 'music') {
  console.error(`--kind must be "sfx" or "music" (got "${kind}")`);
  process.exit(2);
}

// --- Per-kind encoding profile ----------------------------------------------

// Bitrate, channels, sample rate, and loudness target are encoded into the
// profile so a future change is a one-line edit. Values match the audio
// guidance documented for the project (see DeveloperGuide.md "Audio").
const profiles = {
  sfx: {
    bitrate: '96k',
    channels: 1,
    sampleRate: 44100,
    // EBU R128 loudness target for short SFX. Slightly louder than music
    // (-16 vs -18) so sound effects feel snappy over a music bed without
    // blasting through headphones.
    loudnormI: -16,
    loudnormTP: -1.5,
    loudnormLRA: 11,
  },
  music: {
    bitrate: '160k',
    channels: 2,
    sampleRate: 44100,
    loudnormI: -18,
    loudnormTP: -1.5,
    loudnormLRA: 11,
  },
};
const profile = profiles[kind];

// --- Filter chain ------------------------------------------------------------

// `silenceremove` filter idiom: trim leading silence -> reverse -> trim
// leading silence (= trailing silence of the original) -> reverse back.
// One-pass approach with start/stop_periods scoped to a SINGLE silence
// region at each end (start_periods=1 / stop_periods=1).
const silenceTrim =
  'silenceremove=start_periods=1:start_duration=0.005:start_threshold=-45dB:detection=peak,' +
  'areverse,' +
  'silenceremove=start_periods=1:start_duration=0.005:start_threshold=-45dB:detection=peak,' +
  'areverse';

// Two-pass loudnorm is the gold standard but adds complexity (need to parse
// JSON from a probe pass). One-pass loudnorm is good enough for SFX/short
// game audio and matches what most game-audio pipelines use.
const loudnorm = `loudnorm=I=${profile.loudnormI}:TP=${profile.loudnormTP}:LRA=${profile.loudnormLRA}`;

const filters = trim ? `${silenceTrim},${loudnorm}` : loudnorm;

// --- Build ffmpeg arg list ---------------------------------------------------

const args = [
  '-y', // overwrite output if it exists (the script is idempotent by design)
  '-i', input,
  '-af', filters,
  '-map_metadata', '-1', // strip ALL metadata (no leaked generator info)
  '-codec:a', 'libmp3lame',
  '-b:a', profile.bitrate,
  '-ac', String(profile.channels),
  '-ar', String(profile.sampleRate),
  output,
];

// Make sure the output directory exists so the user doesn't have to.
mkdirSync(dirname(output), { recursive: true });

console.log(`[audio:encode] kind=${kind} trim=${trim}`);
console.log(`[audio:encode] in : ${input}`);
console.log(`[audio:encode] out: ${output}`);

const result = spawnSync(ffmpegPath, args, { stdio: 'inherit' });
if (result.status !== 0) {
  console.error(`[audio:encode] ffmpeg exited with code ${result.status}`);
  process.exit(result.status ?? 1);
}

console.log('[audio:encode] done.');

function printHelp() {
  console.log(
    [
      '',
      'Usage: node scripts/audio/encode.mjs <input> <output> [--kind sfx|music] [--no-trim]',
      '',
      'Encodes a raw audio file (WAV/FLAC/etc.) to a properly trimmed,',
      'loudness-normalized, metadata-stripped MP3 ready for public/assets/audio/.',
      '',
      'Examples:',
      '  node scripts/audio/encode.mjs .audio-source/raw/fire/t1.wav public/assets/audio/sfx/fire-1.mp3',
      '  node scripts/audio/encode.mjs --kind music in.wav public/assets/audio/music/menu-loop.mp3',
      '',
      'Flags:',
      '  --kind sfx|music   encoding profile (default: sfx — 96k mono)',
      '                                            music — 160k stereo',
      '  --no-trim          skip silence trimming (use when source is already trimmed)',
      '',
    ].join('\n'),
  );
}
