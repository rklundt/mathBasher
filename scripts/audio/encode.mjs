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
 *   --kind sfx       -> 96 kbps mono,   -16 LUFS, trim ON  (one-shot SFX: fire, hit, click)
 *   --kind midground -> 96 kbps mono,   -22 LUFS, trim OFF (atmospheric LOOPS: skittering,
 *                                                          movement, ambient — sit UNDER
 *                                                          one-shot SFX; loops MUST not be
 *                                                          silence-trimmed or the loop
 *                                                          boundary clicks)
 *   --kind music     -> 160 kbps stereo, -18 LUFS, trim ON  (full musical loops + tracks)
 *
 * Usage:
 *   node scripts/audio/encode.mjs <input> <output> [--kind sfx|midground|music] [--no-trim] [--trim]
 *
 * Or via the pnpm wrapper:
 *   pnpm audio:encode .audio-source/raw/fire/take-1.wav public/assets/audio/sfx/fire-1.mp3
 *   pnpm audio:encode --kind midground in.wav public/assets/audio/midground/skittering-1.mp3
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
// `trim` is tri-state to support kind-aware defaults: undefined means "use
// the kind's default", true/false are explicit overrides from the CLI.
let trim;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--kind') {
    kind = argv[++i];
  } else if (a === '--no-trim') {
    trim = false;
  } else if (a === '--trim') {
    trim = true;
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

if (kind !== 'sfx' && kind !== 'midground' && kind !== 'music') {
  console.error(`--kind must be "sfx", "midground", or "music" (got "${kind}")`);
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
    // Trim leading/trailing silence by default — one-shot SFX should
    // start instantly when triggered.
    trimDefault: true,
  },
  midground: {
    // Atmospheric loops that play UNDER one-shot SFX (e.g. skittering
    // alien movement, ambient hum). Same fidelity as SFX (96k mono is
    // plenty for ambient layers), but quieter loudness target so they
    // sit beneath fire/click sounds without overpowering. Same true-peak
    // ceiling as SFX/music for kid-safe playback.
    bitrate: '96k',
    channels: 1,
    sampleRate: 44100,
    loudnormI: -22, // 6 dB under sfx target — sits in the background
    loudnormTP: -1.5,
    loudnormLRA: 11,
    // Trim is OFF by default for loops. Silence-trimming a loop file
    // can chop into a non-zero-crossing sample, producing an audible
    // click at the loop boundary. Loops should be authored with clean
    // boundaries; the encoder's job is to encode them faithfully, not
    // to reshape them. Override with `--trim` if a particular source
    // genuinely has unwanted silence padding.
    trimDefault: false,
  },
  music: {
    bitrate: '160k',
    channels: 2,
    sampleRate: 44100,
    loudnormI: -18,
    loudnormTP: -1.5,
    loudnormLRA: 11,
    trimDefault: true,
  },
};
const profile = profiles[kind];

// Apply the kind's default trim policy if the CLI didn't specify one.
// Explicit --trim or --no-trim wins; otherwise sfx/music default to
// trimming, midground (loops) defaults to NOT trimming.
if (trim === undefined) {
  trim = profile.trimDefault;
}

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
// game audio. Single-pass adherence to the TP target is approximate
// though — for very quiet inputs (mean below -25 dB) loudnorm's boost can
// push peaks above the TP ceiling. The limiter below catches that.
const loudnorm = `loudnorm=I=${profile.loudnormI}:TP=${profile.loudnormTP}:LRA=${profile.loudnormLRA}`;

// Brick-wall limiter as the FINAL stage — true safety net that catches
// whatever loudnorm produces, including overshoots on very quiet inputs.
// Pins peaks at 0.7 ≈ -3.1 dBFS, giving ~1.6 dB of headroom for MP3
// reconstruction noise (the codec's lossy decoder can reconstruct samples
// 1-2 dB above the original peak); after MP3 round-trip, decoded peaks
// land safely under the -1.5 dBTP shipping ceiling.
//
// `level=disabled` is CRITICAL: alimiter's default `level=true`
// re-normalizes the OUTPUT back to 0 dB after limiting, which silently
// undoes everything the limiter just did. With `level=disabled`, peaks
// stay pinned at the limit value.
//
// Attack 5 ms / release 50 ms is fast enough for transient SFX without
// producing audible pumping.
const limiter = 'alimiter=limit=0.7:level=disabled:attack=5:release=50';

// Filter ORDER matters: trim → loudnorm → limiter. The limiter is a true
// safety net at the END — whatever loudnorm overshoots, the limiter catches.
// An earlier (mis-)ordering put the limiter BEFORE loudnorm, which left
// loudnorm free to push peaks past the TP ceiling on quiet inputs (real bug
// hit during the bloop encode in v0.5.2+; mean was -39 dB, loudnorm boosted
// 23 dB to hit -16 LUFS target, peaks went to 0 dB unchecked).
const filters = trim
  ? `${silenceTrim},${loudnorm},${limiter}`
  : `${loudnorm},${limiter}`;

// --- Build ffmpeg arg list ---------------------------------------------------

const args = [
  '-y', // overwrite output if it exists (the script is idempotent by design)
  '-i', input,
  '-af', filters,
  // Strip ALL input-side metadata (generator names, prompts, timestamps).
  '-map_metadata', '-1',
  // Suppress ffmpeg's own muxer-side metadata. By default the mp3 muxer
  // writes an ID3v2 TSSE/`encoder` tag identifying the libavformat version
  // that produced the file ("Lavf60.3.100"). That's not generator info but
  // it IS metadata, and the project policy is "no metadata in shipped audio."
  // The three flags below disable Xing VBR header tagging, ID3v2, and ID3v1.
  '-write_xing', '0',
  '-id3v2_version', '0',
  '-write_id3v1', '0',
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
      'Usage: node scripts/audio/encode.mjs <input> <output> [--kind sfx|midground|music] [--no-trim|--trim]',
      '',
      'Encodes a raw audio file (WAV/FLAC/etc.) to a properly normalized,',
      'metadata-stripped MP3 ready for public/assets/audio/.',
      '',
      'Examples:',
      '  node scripts/audio/encode.mjs .audio-source/raw/fire/t1.wav public/assets/audio/sfx/fire-1.mp3',
      '  node scripts/audio/encode.mjs --kind midground in.wav public/assets/audio/midground/skittering-1.mp3',
      '  node scripts/audio/encode.mjs --kind music in.wav public/assets/audio/music/menu-loop.mp3',
      '',
      'Flags:',
      '  --kind sfx         96 kbps mono,   -16 LUFS  (one-shot SFX; trim default ON)',
      '         midground   96 kbps mono,   -22 LUFS  (atmospheric loops; trim default OFF',
      '                                                — silence-trimming a loop creates',
      '                                                clicks at the loop boundary)',
      '         music       160 kbps stereo, -18 LUFS  (musical loops/tracks; trim default ON)',
      '  --no-trim          skip silence trimming (override; default depends on --kind)',
      '  --trim             force silence trimming (override; default depends on --kind)',
      '',
    ].join('\n'),
  );
}
