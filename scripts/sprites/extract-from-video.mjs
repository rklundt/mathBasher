#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Video → per-alien spritesheet extractor. Companion to the sprite
 * pipeline. Takes a video that shows a uniform R×C grid of animated
 * sprites and produces R*C separate WebP spritesheets (one per cell),
 * each containing N frames of that cell laid out as a horizontal row.
 *
 * Pipeline (high-level):
 *   1. ffprobe input video → report dimensions, fps, duration
 *   2. ffmpeg extract frames at --fps to a temp folder
 *   3. For each grid position (r, c):
 *        a. extract that cell from every frame → N cell images
 *        b. resize each cell to --cell-size (default 64x64)
 *        c. apply color-key background removal → transparent alpha
 *        d. compose into one horizontal-row spritesheet
 *        e. encode as WebP + write to public/assets/sprites/<kind>/
 *   4. Cleanup temp frames (unless --keep-temp)
 *   5. Report: per-cell output paths + sizes + bg-removal stats
 *
 * Usage:
 *   pnpm sprite:extract [grid spec] [other opts] <video>
 *
 * Grid spec — pick ONE of these styles (--rows/--cols wins if both passed):
 *   --rows N --cols N   explicit row + column counts (recommended; unambiguous)
 *   --grid RxC          shorthand "rows × cols" (e.g. "5x6" = 5 rows, 6 cols)
 *
 * Optional:
 *   --verify-grid       dump frame 0 of the video with magenta grid lines
 *                       overlaid at the specified --rows/--cols, save to
 *                       .sprite-source/working/frame0-grid-RxC.png, then EXIT
 *                       without doing a full extract. Use this BEFORE every
 *                       extract — eyeball whether the grid lines align with
 *                       the actual sprite cells.
 *   --margin N|auto     crop N pixels off ALL four sides of the source video
 *                       before slicing into cells. Useful when the source
 *                       has a uniform border around the actual sprite grid.
 *                       Default 0. Pass "auto" to detect each side's margin
 *                       independently by scanning inward from each edge for
 *                       the first row/column with significant non-bg content.
 *   --margin-top N      override --margin for the top edge only (numeric only)
 *   --margin-bottom N   override --margin for the bottom edge only (numeric only)
 *   --margin-left N     override --margin for the left edge only (numeric only)
 *   --margin-right N    override --margin for the right edge only (numeric only)
 *   --fps N             extract this many frames per second (default 12)
 *   --cell-size N       output px per frame, square bounding box (default 96).
 *                       Frames preserve source aspect via fit:inside, so
 *                       non-square source cells produce non-square output.
 *   --bg auto|"#hex"    background color to remove (default "auto" — sample frame corners)
 *   --bg-tolerance N    color-distance threshold 0–100 (default 30)
 *   --name-prefix S     output filename prefix (default "alien")
 *                       → produces alien-r0c0.webp, alien-r0c1.webp, ...
 *   --quality N         WebP quality 0–100 (default 90)
 *   --kind K            output folder kind (default "alien")
 *   --keep-temp         keep .extract-temp/ frames for debugging
 *   --max-cells N       only process the first N cells (debug aid; default = R*C)
 *
 * The script auto-detects the source video's resolution and FPS via
 * ffmpeg and reports them upfront so a wrong grid value surfaces
 * immediately ("each source cell is 146×146 — does that look right?").
 *
 * Recommended workflow:
 *   1. pnpm sprite:extract --rows 5 --cols 6 --verify-grid <video>
 *   2. open .sprite-source/working/frame0-grid-5x6.png — magenta lines
 *      should land in the gaps BETWEEN sprites, not slice through them.
 *      Yellow outline shows the cropped area (whatever --margin says).
 *   3. if the magenta lines slice through sprites near the edges, bump
 *      --margin and re-verify. Iterate (5, 10, 15px) until the grid
 *      lines align with the gaps between sprites.
 *   4. once verified: re-run without --verify-grid to do the real extract.
 */

import { argv, exit } from 'node:process';
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------------
// Constants — output folders match scripts/sprites/process.mjs PROFILES.
// ------------------------------------------------------------------

const KIND_FOLDERS = {
  alien: 'public/assets/sprites/aliens',
  hero: 'public/assets/sprites/hero',
  projectile: 'public/assets/sprites/projectiles',
  ui: 'public/assets/sprites/ui',
  particle: 'public/assets/sprites/particles',
  bg: 'public/assets/sprites/bg',
};

const TEMP_DIR = '.sprite-source/working/.extract-temp';

// ------------------------------------------------------------------
// Argument parsing
// ------------------------------------------------------------------

function parseArgs(args) {
  const opts = {
    grid: null,
    rows: null,
    cols: null,
    verifyGrid: false,
    margin: 0,
    marginTop: null,
    marginBottom: null,
    marginLeft: null,
    marginRight: null,
    fps: 12,
    cellSize: 96,
    bg: 'auto',
    bgTolerance: 30,
    namePrefix: 'alien',
    quality: 90,
    kind: 'alien',
    keepTemp: false,
    maxCells: null,
  };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--grid') opts.grid = args[++i];
    else if (a === '--rows') opts.rows = parseInt(args[++i], 10);
    else if (a === '--cols') opts.cols = parseInt(args[++i], 10);
    else if (a === '--verify-grid') opts.verifyGrid = true;
    else if (a === '--margin') {
      // Special-case "auto" — passes through as a string; numeric path
      // parses to int. Per-side overrides remain numeric-only because
      // mixing "auto" with explicit overrides is more confusing than helpful.
      const next = args[++i];
      opts.margin = next === 'auto' ? 'auto' : parseInt(next, 10);
    }
    else if (a === '--margin-top') opts.marginTop = parseInt(args[++i], 10);
    else if (a === '--margin-bottom') opts.marginBottom = parseInt(args[++i], 10);
    else if (a === '--margin-left') opts.marginLeft = parseInt(args[++i], 10);
    else if (a === '--margin-right') opts.marginRight = parseInt(args[++i], 10);
    else if (a === '--fps') opts.fps = parseInt(args[++i], 10);
    else if (a === '--cell-size') opts.cellSize = parseInt(args[++i], 10);
    else if (a === '--bg') opts.bg = args[++i];
    else if (a === '--bg-tolerance') opts.bgTolerance = parseInt(args[++i], 10);
    else if (a === '--name-prefix') opts.namePrefix = args[++i];
    else if (a === '--quality') opts.quality = parseInt(args[++i], 10);
    else if (a === '--kind') opts.kind = args[++i];
    else if (a === '--keep-temp') opts.keepTemp = true;
    else if (a === '--max-cells') opts.maxCells = parseInt(args[++i], 10);
    else if (a === '--help' || a === '-h') {
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
  if (positional.length !== 1) {
    console.error('Need exactly one positional arg: <video-path>');
    printHelp();
    exit(1);
  }
  if (!Object.prototype.hasOwnProperty.call(KIND_FOLDERS, opts.kind)) {
    console.error(`Unknown --kind "${opts.kind}". Valid: ${Object.keys(KIND_FOLDERS).join(', ')}`);
    exit(1);
  }

  // Resolve grid dimensions: --rows/--cols win over --grid if both passed.
  // Either explicit form is required; neither = error.
  if (opts.rows !== null || opts.cols !== null) {
    if (opts.rows === null || opts.cols === null) {
      console.error('--rows and --cols must be passed together. Got rows=' + opts.rows + ', cols=' + opts.cols);
      exit(1);
    }
    if (opts.grid !== null) {
      console.error('Pass either --rows/--cols OR --grid, not both. They conflict.');
      exit(1);
    }
    opts.gridRows = opts.rows;
    opts.gridCols = opts.cols;
  } else if (opts.grid !== null) {
    const m = /^(\d+)x(\d+)$/i.exec(opts.grid);
    if (!m) {
      console.error(`--grid must look like "5x6" (rows × cols); got "${opts.grid}"`);
      exit(1);
    }
    opts.gridRows = parseInt(m[1], 10);
    opts.gridCols = parseInt(m[2], 10);
  } else {
    console.error('Grid required. Pass either --rows N --cols N (recommended) OR --grid RxC.');
    printHelp();
    exit(1);
  }

  if (opts.gridRows < 1 || opts.gridCols < 1) {
    console.error(`Grid dimensions must be ≥ 1 (got ${opts.gridRows}×${opts.gridCols})`);
    exit(1);
  }

  // Resolve per-side margins: each per-side flag overrides --margin if set.
  // For numeric --margin, the result is each side = its override or the
  // uniform value. For --margin auto, leave opts.{top,bottom,left,right}
  // as null sentinels — they get filled in later by detectMargins() after
  // we have a frame to scan. Per-side overrides still win over auto-detect
  // (so `--margin auto --margin-top 0` says "auto-detect 3 sides, top=0").
  opts.autoMargin = opts.margin === 'auto';
  if (opts.autoMargin) {
    opts.top = opts.marginTop;
    opts.bottom = opts.marginBottom;
    opts.left = opts.marginLeft;
    opts.right = opts.marginRight;
  } else {
    opts.top = opts.marginTop !== null ? opts.marginTop : opts.margin;
    opts.bottom = opts.marginBottom !== null ? opts.marginBottom : opts.margin;
    opts.left = opts.marginLeft !== null ? opts.marginLeft : opts.margin;
    opts.right = opts.marginRight !== null ? opts.marginRight : opts.margin;
  }

  for (const side of ['top', 'bottom', 'left', 'right']) {
    if (opts[side] !== null && opts[side] < 0) {
      console.error(`Margin --margin-${side} must be ≥ 0 (got ${opts[side]})`);
      exit(1);
    }
  }

  return { ...opts, video: positional[0] };
}

function printHelp() {
  console.log(`Usage: pnpm sprite:extract <grid-spec> [opts] <video>

Grid spec (REQUIRED — pick one):
  --rows N --cols N   explicit row + column counts (recommended)
  --grid RxC          shorthand "rows × cols" (e.g. "5x6" = 5 rows, 6 cols)

Verify-grid mode:
  --verify-grid       dump frame 0 with grid overlay to
                      .sprite-source/working/frame0-grid-RxC.png and exit
                      WITHOUT extracting. Use to confirm grid alignment
                      before a real run.

Margin (crop edge pixels before grid math):
  --margin N          crop N pixels off all 4 sides (default 0)
  --margin-top N      per-side override (top)
  --margin-bottom N   per-side override (bottom)
  --margin-left N     per-side override (left)
  --margin-right N    per-side override (right)

Optional:
  --fps N             frames per second to extract (default 12)
  --cell-size N       output px per frame, square bounding box (default 96)
  --bg auto|"#hex"    background color (default "auto" — corner-sample)
  --bg-tolerance N    color-distance threshold 0–100 (default 30)
  --name-prefix S     filename prefix (default "alien" → alien-r0c0.webp)
  --quality N         WebP quality 0–100 (default 90)
  --kind K            output folder kind (default "alien")
  --keep-temp         retain temp frames in .sprite-source/working/.extract-temp/
  --max-cells N       process only first N cells (debug — default = R*C)

Output: <kind-folder>/<prefix>-r{R}c{C}.webp per grid cell, each a single
horizontal-row WebP spritesheet of N extracted frames at cell-size × cell-size.

Recommended: run with --verify-grid first to confirm alignment, then re-run
without it for the real extract.`);
}

// ------------------------------------------------------------------
// ffmpeg / ffprobe glue (uses ffmpeg-static, mirrors audio/encode.mjs)
// ------------------------------------------------------------------

async function getFfmpegPath() {
  const mod = await import('ffmpeg-static');
  const path = mod.default ?? mod;
  if (!path || typeof path !== 'string') {
    throw new Error('ffmpeg-static did not export a binary path. Run `pnpm rebuild ffmpeg-static`.');
  }
  return path;
}

/**
 * `ffprobe` ships in `ffmpeg-static`'s sibling package `ffprobe-static`,
 * which we don't have. Instead we use `ffmpeg -i <input>` which prints
 * stream info to stderr and returns nonzero (no output file = error).
 * Parse stderr for what we need: width × height, fps, duration.
 */
async function probeVideo(ffmpegPath, videoPath) {
  return new Promise((resolveProbe, rejectProbe) => {
    const proc = spawn(ffmpegPath, ['-i', videoPath], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('close', () => {
      // ffmpeg -i without an output exits non-zero by design; we don't
      // care, we just want the stderr text.
      try {
        const dimMatch = /Stream.*Video.*?(\d{2,5})x(\d{2,5})/.exec(stderr);
        const fpsMatch = /(\d+(?:\.\d+)?)\s*fps/.exec(stderr);
        const durMatch = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
        if (!dimMatch) {
          rejectProbe(new Error(`Could not parse video dimensions from ffmpeg output:\n${stderr}`));
          return;
        }
        const width = parseInt(dimMatch[1], 10);
        const height = parseInt(dimMatch[2], 10);
        const fps = fpsMatch ? parseFloat(fpsMatch[1]) : null;
        let duration = null;
        if (durMatch) {
          const h = parseInt(durMatch[1], 10);
          const m = parseInt(durMatch[2], 10);
          const s = parseFloat(durMatch[3]);
          duration = h * 3600 + m * 60 + s;
        }
        resolveProbe({ width, height, fps, duration });
      } catch (err) {
        rejectProbe(err);
      }
    });
    proc.on('error', rejectProbe);
  });
}

async function extractFrames(ffmpegPath, videoPath, fps, outputDir) {
  await mkdir(outputDir, { recursive: true });
  return new Promise((res, rej) => {
    const proc = spawn(
      ffmpegPath,
      [
        '-y', // overwrite
        '-i', videoPath,
        '-vf', `fps=${fps}`,
        '-pix_fmt', 'rgba', // ensure alpha capacity even though src is opaque
        join(outputDir, 'frame-%04d.png'),
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        rej(new Error(`ffmpeg frame extraction failed (exit ${code}):\n${stderr}`));
        return;
      }
      res();
    });
    proc.on('error', rej);
  });
}

// ------------------------------------------------------------------
// Background detection + removal
// ------------------------------------------------------------------

/**
 * Sample the four corners of the first frame to auto-detect the
 * background color. Returns `{ r, g, b }`. We average a 4×4 patch from
 * each corner to dodge JPEG-style corner artifacts that occasionally
 * exist in mp4-encoded source frames.
 */
async function detectBackgroundColor(sharp, framePath) {
  const img = sharp(framePath);
  const meta = await img.metadata();
  const sampleSize = 4;
  const patches = [
    { left: 0, top: 0 },
    { left: meta.width - sampleSize, top: 0 },
    { left: 0, top: meta.height - sampleSize },
    { left: meta.width - sampleSize, top: meta.height - sampleSize },
  ];
  const colorSums = { r: 0, g: 0, b: 0, n: 0 };
  for (const patch of patches) {
    const { data } = await sharp(framePath)
      .extract({ left: patch.left, top: patch.top, width: sampleSize, height: sampleSize })
      .raw()
      .toBuffer({ resolveWithObject: true });
    // RGBA pixel data; iterate by 4
    const channels = data.length / (sampleSize * sampleSize);
    for (let i = 0; i < data.length; i += channels) {
      colorSums.r += data[i];
      colorSums.g += data[i + 1];
      colorSums.b += data[i + 2];
      colorSums.n++;
    }
  }
  return {
    r: Math.round(colorSums.r / colorSums.n),
    g: Math.round(colorSums.g / colorSums.n),
    b: Math.round(colorSums.b / colorSums.n),
  };
}

/**
 * Auto-detect per-side margins by scanning inward from each edge of a
 * frame, finding the first row/column that has more than `minContentPx`
 * pixels significantly different from `keyColor`. Returns
 * `{top, bottom, left, right}` in pixels.
 *
 * The scan reads the entire frame as raw RGBA once, then walks each
 * edge using indexed addressing into that buffer (no per-row sharp
 * extraction — would be ~4× slower).
 *
 * Conservatism: subtract `safetyPx` (default 1) from each detected
 * margin so we don't crop into anti-aliased sprite edges. If the
 * detected margin is zero (no border found), don't subtract — leaves
 * margin=0 instead of going negative.
 *
 * `minContentPx` is the absolute pixel count threshold for "this
 * row/column has real content" — defaults to 4 to filter out JPEG
 * noise / anti-alias fringes that produce 1-3 stray non-bg pixels.
 */
async function detectMargins(sharp, framePath, keyColor, tolerance, opts = {}) {
  const safetyPx = opts.safetyPx ?? 1;
  const minContentPx = opts.minContentPx ?? 4;
  const maxDist = tolerance * 4.41;
  const maxDistSq = maxDist * maxDist;

  // Read full frame as raw RGBA.
  const { data, info } = await sharp(framePath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // Helper: count non-bg pixels in row y, returning the count.
  const countRowContent = (y) => {
    let count = 0;
    const rowStart = y * width * channels;
    for (let x = 0; x < width; x++) {
      const i = rowStart + x * channels;
      const dr = data[i] - keyColor.r;
      const dg = data[i + 1] - keyColor.g;
      const db = data[i + 2] - keyColor.b;
      if (dr * dr + dg * dg + db * db > maxDistSq) count++;
    }
    return count;
  };
  const countColContent = (x) => {
    let count = 0;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * channels;
      const dr = data[i] - keyColor.r;
      const dg = data[i + 1] - keyColor.g;
      const db = data[i + 2] - keyColor.b;
      if (dr * dr + dg * dg + db * db > maxDistSq) count++;
    }
    return count;
  };

  // Top: walk down, find first row with content.
  let top = 0;
  for (let y = 0; y < height; y++) {
    if (countRowContent(y) >= minContentPx) {
      top = y;
      break;
    }
  }
  // Bottom: walk up, find first row with content (margin is from edge).
  let bottom = 0;
  for (let y = height - 1; y >= 0; y--) {
    if (countRowContent(y) >= minContentPx) {
      bottom = height - 1 - y;
      break;
    }
  }
  // Left
  let left = 0;
  for (let x = 0; x < width; x++) {
    if (countColContent(x) >= minContentPx) {
      left = x;
      break;
    }
  }
  // Right
  let right = 0;
  for (let x = width - 1; x >= 0; x--) {
    if (countColContent(x) >= minContentPx) {
      right = width - 1 - x;
      break;
    }
  }

  // Apply safety buffer (don't crop into anti-aliased edges).
  return {
    top: top > 0 ? Math.max(0, top - safetyPx) : 0,
    bottom: bottom > 0 ? Math.max(0, bottom - safetyPx) : 0,
    left: left > 0 ? Math.max(0, left - safetyPx) : 0,
    right: right > 0 ? Math.max(0, right - safetyPx) : 0,
  };
}

function parseHexColor(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) throw new Error(`Invalid hex color: "${hex}". Expected "#RRGGBB" or "RRGGBB".`);
  return {
    r: parseInt(m[1].slice(0, 2), 16),
    g: parseInt(m[1].slice(2, 4), 16),
    b: parseInt(m[1].slice(4, 6), 16),
  };
}

/**
 * Apply background removal to a raw RGBA buffer in place using a
 * **flood-fill from the cell edges**.
 *
 * Why flood-fill instead of "every pixel within tolerance of the bg color
 * becomes transparent": the simpler color-key approach incorrectly eats
 * sprite-interior pixels that happen to match the bg color (e.g. an alien
 * with a near-white helmet on a white background — the helmet vanishes).
 * Flood-fill avoids this by only marking pixels that are CONNECTED to the
 * cell border via a chain of bg-colored pixels. An interior region of
 * bg-colored pixels enclosed by non-bg sprite pixels stays opaque.
 *
 * Algorithm:
 *   1. Mark every pixel within `tolerance` of `keyColor` as "potentially bg"
 *   2. BFS from every border pixel that's potentially-bg, expanding only
 *      to neighboring potentially-bg pixels
 *   3. Set alpha=0 on every pixel reached by the flood
 *
 * Tolerance is 0–100; we map that to a max distance of `tolerance × 4.41`
 * (since the max RGB euclidean distance is sqrt(3 × 255²) ≈ 441).
 *
 * Caveat: if a sprite touches the cell edge AND has bg-colored pixels at
 * the edge, the flood will leak through that contact point and eat sprite
 * pixels along the connected interior chain. In practice mathBasher's
 * source videos pad each grid cell with bg around the sprite, so this
 * rarely matters — but if a future input doesn't, we'd want a 1-pixel
 * margin sample rather than the literal edge.
 *
 * Returns the count of pixels made transparent (for the caller to report).
 */
function removeBackgroundInPlace(buf, width, height, keyColor, tolerance) {
  const maxDist = tolerance * 4.41;
  const N = width * height;

  // Pass 1: build the "potentially bg" mask. Single linear scan, no
  // sqrt — squared distance compared to squared threshold (faster).
  const maxDistSq = maxDist * maxDist;
  const isPotentialBg = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    const dr = buf[p * 4] - keyColor.r;
    const dg = buf[p * 4 + 1] - keyColor.g;
    const db = buf[p * 4 + 2] - keyColor.b;
    if (dr * dr + dg * dg + db * db <= maxDistSq) {
      isPotentialBg[p] = 1;
    }
  }

  // Pass 2: BFS flood-fill from all border pixels that are potential-bg.
  // Use a typed array as a queue with a head pointer (NOT Array.shift —
  // shift is O(n), would be quadratic for ~4096 pixels).
  const visited = new Uint8Array(N);
  const queue = new Int32Array(N); // worst case: every pixel in queue once
  let head = 0;
  let tail = 0;

  const enqueueIfPotential = (idx) => {
    if (idx < 0 || idx >= N) return;
    if (visited[idx] || !isPotentialBg[idx]) return;
    visited[idx] = 1;
    queue[tail++] = idx;
  };

  // Seed with every border pixel that's potential-bg.
  for (let x = 0; x < width; x++) {
    enqueueIfPotential(x); // top row
    enqueueIfPotential((height - 1) * width + x); // bottom row
  }
  for (let y = 0; y < height; y++) {
    enqueueIfPotential(y * width); // left column
    enqueueIfPotential(y * width + (width - 1)); // right column
  }

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx / width) | 0;
    if (x > 0) enqueueIfPotential(idx - 1);
    if (x < width - 1) enqueueIfPotential(idx + 1);
    if (y > 0) enqueueIfPotential(idx - width);
    if (y < height - 1) enqueueIfPotential(idx + width);
  }

  // Pass 3: write alpha=0 on every pixel reached by the flood.
  let removed = 0;
  for (let p = 0; p < N; p++) {
    if (visited[p]) {
      buf[p * 4 + 3] = 0;
      removed++;
    }
  }
  return removed;
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main() {
  const opts = parseArgs(argv.slice(2));

  if (!existsSync(opts.video)) {
    console.error(`Video not found: ${opts.video}`);
    exit(1);
  }

  const sharp = (await import('sharp')).default;
  const ffmpegPath = await getFfmpegPath();

  // ---- Step 1: probe ----
  console.log(`\nProbing ${opts.video}...`);
  const probe = await probeVideo(ffmpegPath, opts.video);

  console.log(`  Source: ${probe.width}×${probe.height}, ${probe.fps ?? '?'} fps, ${probe.duration?.toFixed(2) ?? '?'}s`);

  // ---- Step 1b: if --margin auto, run pre-detection on a single frame ----
  // Both verify-grid and main extract need margin + bg color resolved before
  // the cell math runs. Pre-extract just frame 0 for this purpose; the main
  // extract's full-fps frame loop happens later.
  if (opts.autoMargin || opts.bg === 'auto') {
    await mkdir(TEMP_DIR, { recursive: true });
    const probeFramePath = join(TEMP_DIR, 'probe-frame.png');
    await new Promise((res, rej) => {
      const p = spawn(
        ffmpegPath,
        ['-y', '-i', opts.video, '-vframes', '1', probeFramePath],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );
      p.on('close', (code) => (code === 0 ? res() : rej(new Error('frame 0 extract failed'))));
      p.on('error', rej);
    });

    // Resolve bg color first — margin detection needs it.
    if (opts.bg === 'auto') {
      const bg = await detectBackgroundColor(sharp, probeFramePath);
      opts.bgResolved = bg;
      console.log(
        `  Auto-detected background: rgb(${bg.r}, ${bg.g}, ${bg.b}) = ` +
          `#${bg.r.toString(16).padStart(2, '0')}${bg.g.toString(16).padStart(2, '0')}${bg.b.toString(16).padStart(2, '0')}`,
      );
    } else {
      opts.bgResolved = parseHexColor(opts.bg);
    }

    if (opts.autoMargin) {
      const auto = await detectMargins(sharp, probeFramePath, opts.bgResolved, opts.bgTolerance);
      // Per-side overrides win over auto-detect (e.g. `--margin auto
      // --margin-top 0` says "auto-detect 3 sides, force top to 0").
      opts.top = opts.marginTop !== null ? opts.marginTop : auto.top;
      opts.bottom = opts.marginBottom !== null ? opts.marginBottom : auto.bottom;
      opts.left = opts.marginLeft !== null ? opts.marginLeft : auto.left;
      opts.right = opts.marginRight !== null ? opts.marginRight : auto.right;
      console.log(
        `  Auto-detected margins: top=${auto.top}, right=${auto.right}, bottom=${auto.bottom}, left=${auto.left}px` +
          (opts.marginTop !== null || opts.marginRight !== null || opts.marginBottom !== null || opts.marginLeft !== null
            ? ' (some sides overridden by explicit --margin-* flags)'
            : ''),
      );
    }
  }

  // Effective grid area = source dimensions minus per-side margins.
  // All cell math operates on this inner rectangle, NOT the raw video.
  const effW = probe.width - opts.left - opts.right;
  const effH = probe.height - opts.top - opts.bottom;
  if (effW <= 0 || effH <= 0) {
    console.error(
      `Margins eat the whole frame (${opts.top}/${opts.right}/${opts.bottom}/${opts.left} ` +
        `vs ${probe.width}×${probe.height}). Effective grid area would be ${effW}×${effH}.`,
    );
    exit(1);
  }

  const cellSourceW = Math.floor(effW / opts.gridCols);
  const cellSourceH = Math.floor(effH / opts.gridRows);
  const expectedFrames = probe.duration ? Math.floor(probe.duration * opts.fps) : '?';
  const totalCells = opts.gridRows * opts.gridCols;
  const cellsToProcess = opts.maxCells ?? totalCells;

  if (opts.top || opts.right || opts.bottom || opts.left) {
    console.log(`  Margin: top=${opts.top}, right=${opts.right}, bottom=${opts.bottom}, left=${opts.left}px`);
    console.log(`  Effective grid area: ${effW}×${effH} (after margin crop)`);
  }
  console.log(`  Grid:   ${opts.gridRows} rows × ${opts.gridCols} cols = ${totalCells} cells`);
  console.log(`  Each source cell: ${cellSourceW}×${cellSourceH}px`);

  if (opts.verifyGrid) {
    // Verify-grid mode: dump frame 0 with magenta grid lines overlaid,
    // save to .sprite-source/working/, exit. Skip the full extract.
    await runVerifyGrid(ffmpegPath, sharp, opts, probe);
    return;
  }

  console.log(`  Extract: ${opts.fps} fps → ~${expectedFrames} frames per cell`);
  console.log(`  Output:  ${opts.cellSize}×${opts.cellSize} per frame, WebP q${opts.quality}`);
  console.log(`  Bg removal: ${opts.bg === 'auto' ? 'auto-detect from corners' : opts.bg} (tolerance ${opts.bgTolerance})`);
  if (cellsToProcess < totalCells) {
    console.log(`  Cells to process: first ${cellsToProcess} (--max-cells)`);
  }

  // ---- Step 2: extract frames ----
  const tempDir = TEMP_DIR;
  console.log(`\nExtracting frames to ${tempDir}...`);
  await rm(tempDir, { recursive: true, force: true });
  await extractFrames(ffmpegPath, opts.video, opts.fps, tempDir);
  const frameFiles = (await readdir(tempDir))
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => join(tempDir, f));
  if (frameFiles.length === 0) {
    throw new Error('ffmpeg produced no frames; check the input video.');
  }
  console.log(`  Extracted ${frameFiles.length} frames`);

  // ---- Step 3: resolve background color ----
  // If pre-detection ran (auto-margin or auto-bg), opts.bgResolved is
  // already set. Otherwise resolve from frame 0 of the just-extracted batch.
  let bgColor;
  if (opts.bgResolved) {
    bgColor = opts.bgResolved;
  } else if (opts.bg === 'auto') {
    bgColor = await detectBackgroundColor(sharp, frameFiles[0]);
    console.log(
      `  Auto-detected background: rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b}) = #${bgColor.r.toString(16).padStart(2, '0')}${bgColor.g.toString(16).padStart(2, '0')}${bgColor.b.toString(16).padStart(2, '0')}`,
    );
  } else {
    bgColor = parseHexColor(opts.bg);
    console.log(`  Background (explicit): rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b})`);
  }

  // ---- Step 4: per-cell processing ----
  const outputDir = KIND_FOLDERS[opts.kind];
  await mkdir(outputDir, { recursive: true });

  console.log(`\nProcessing ${cellsToProcess} cells → ${outputDir}/${opts.namePrefix}-r{R}c{C}.webp`);

  const results = [];
  let cellIdx = 0;
  for (let r = 0; r < opts.gridRows; r++) {
    for (let c = 0; c < opts.gridCols; c++) {
      if (cellIdx >= cellsToProcess) break;
      cellIdx++;

      // Per-frame: extract this cell, resize to cell-size, remove bg.
      const frameBuffers = [];
      let totalRemoved = 0;
      let totalPixels = 0;
      for (const framePath of frameFiles) {
        // Extract the cell from the source frame, offset by the margin.
        // Cells are computed against the EFFECTIVE area (post-margin), so
        // a cell at (r, c) is at pixel (left + c*cellW, top + r*cellH)
        // within the raw video frame.
        const cellBuffer = await sharp(framePath)
          .extract({
            left: opts.left + c * cellSourceW,
            top: opts.top + r * cellSourceH,
            width: cellSourceW,
            height: cellSourceH,
          })
          // Resize to target cell-size, preserving aspect (square cells from a
          // square grid stay square; non-square cells get the longer side fit)
          .resize(opts.cellSize, opts.cellSize, { fit: 'inside', withoutEnlargement: false })
          // Make sure we have an alpha channel so we can mutate it
          .ensureAlpha()
          // Convert to raw RGBA so we can color-key
          .raw()
          .toBuffer({ resolveWithObject: true });

        const removed = removeBackgroundInPlace(
          cellBuffer.data,
          cellBuffer.info.width,
          cellBuffer.info.height,
          bgColor,
          opts.bgTolerance,
        );
        totalRemoved += removed;
        totalPixels += cellBuffer.info.width * cellBuffer.info.height;

        frameBuffers.push({
          buf: cellBuffer.data,
          width: cellBuffer.info.width,
          height: cellBuffer.info.height,
        });
      }

      // Compose horizontal-row spritesheet via sharp's create + composite.
      // Each frame becomes one row-segment; total width = N × cell-width,
      // total height = cell-height.
      const N = frameBuffers.length;
      const sheetWidth = frameBuffers[0].width * N;
      const sheetHeight = frameBuffers[0].height;

      // Build composite specs: each frame at left = i × frameWidth.
      const composites = await Promise.all(
        frameBuffers.map(async (fb, i) => ({
          input: await sharp(fb.buf, {
            raw: { width: fb.width, height: fb.height, channels: 4 },
          })
            .png()
            .toBuffer(),
          left: i * fb.width,
          top: 0,
        })),
      );

      const outputPath = join(outputDir, `${opts.namePrefix}-r${r}c${c}.webp`);
      const outBuf = await sharp({
        create: {
          width: sheetWidth,
          height: sheetHeight,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite(composites)
        .webp({ quality: opts.quality, alphaQuality: opts.quality })
        .toBuffer();
      await import('node:fs/promises').then((fs) => fs.writeFile(outputPath, outBuf));

      const removedPct = ((totalRemoved / totalPixels) * 100).toFixed(1);
      results.push({
        path: outputPath,
        size: outBuf.length,
        frames: N,
        removedPct,
      });
      process.stdout.write(`\r  [${cellIdx}/${cellsToProcess}] r${r}c${c}: ${formatBytes(outBuf.length)}, ${removedPct}% bg removed`.padEnd(80));
    }
    if (cellIdx >= cellsToProcess) break;
  }
  console.log(''); // newline after progress line

  // ---- Step 5: cleanup ----
  if (!opts.keepTemp) {
    await rm(tempDir, { recursive: true, force: true });
    console.log(`\nCleaned up ${tempDir}`);
  } else {
    console.log(`\nKept temp frames in ${tempDir} (--keep-temp)`);
  }

  // ---- Step 6: report ----
  const totalSize = results.reduce((s, r) => s + r.size, 0);
  const avgSize = totalSize / results.length;
  const avgRemoved = results.reduce((s, r) => s + parseFloat(r.removedPct), 0) / results.length;
  console.log(`\n✓ Wrote ${results.length} spritesheet${results.length === 1 ? '' : 's'} to ${outputDir}/`);
  console.log(`  Each: ${results[0].frames} frames at ${opts.cellSize}×${opts.cellSize}, WebP q${opts.quality}`);
  console.log(`  Avg size: ${formatBytes(avgSize)}, total: ${formatBytes(totalSize)}`);
  console.log(`  Avg bg removal: ${avgRemoved.toFixed(1)}% of pixels`);
  console.log(`\nNext: eyeball a sample (open one .webp in a viewer or a quick HTML page).`);
  console.log(`  If background removal is too aggressive (sprite eaten), drop --bg-tolerance.`);
  console.log(`  If background removal leaves halos, raise --bg-tolerance.`);
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * --verify-grid mode: extract frame 0 of the video, overlay magenta
 * grid lines at the specified rows × cols, save to
 * .sprite-source/working/frame0-grid-RxC.png, and exit. Use this
 * BEFORE every real extract to confirm the grid alignment.
 *
 * Magenta lines should land in the GAPS BETWEEN sprites, not slice
 * through any sprite body. If they do, the grid spec is wrong.
 */
async function runVerifyGrid(ffmpegPath, sharp, opts, probe) {
  const outDir = '.sprite-source/working';
  await mkdir(outDir, { recursive: true });
  const rawFramePath = join(outDir, '.frame0-raw.png');
  const overlayPath = join(
    outDir,
    `frame0-grid-${opts.gridRows}x${opts.gridCols}.png`,
  );

  console.log(`\nVerify-grid mode: extracting frame 0 of ${opts.video}...`);

  // ffmpeg one-shot: pull frame 0 only.
  await new Promise((res, rej) => {
    const p = spawn(
      ffmpegPath,
      ['-y', '-i', opts.video, '-vframes', '1', rawFramePath],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    p.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    p.on('close', (code) => {
      if (code !== 0) rej(new Error(`ffmpeg frame 0 extract failed:\n${stderr}`));
      else res();
    });
    p.on('error', rej);
  });

  // Build the SVG overlay:
  //   - Yellow rect at the margin boundary (shows what gets CROPPED away —
  //     anything outside the yellow box is ignored by the cell math)
  //   - Magenta lines at internal grid boundaries (shows where each
  //     extracted cell's edges sit WITHIN the cropped area)
  // Read the resolved per-side margins; cell math operates on the area
  // bounded by these margins.
  const innerLeft = opts.left;
  const innerTop = opts.top;
  const innerRight = probe.width - opts.right;
  const innerBottom = probe.height - opts.bottom;
  const innerW = innerRight - innerLeft;
  const innerH = innerBottom - innerTop;
  const cellW = innerW / opts.gridCols;
  const cellH = innerH / opts.gridRows;
  const overlayParts = [];

  // Yellow margin outline — only draw if any margin is non-zero.
  if (opts.top || opts.right || opts.bottom || opts.left) {
    overlayParts.push(
      `<rect x="${innerLeft}" y="${innerTop}" width="${innerW}" height="${innerH}" ` +
        `fill="none" stroke="yellow" stroke-width="2"/>`,
    );
  }

  // Magenta internal grid lines (start at margin, end at margin).
  for (let i = 1; i < opts.gridCols; i++) {
    const x = Math.round(innerLeft + i * cellW);
    overlayParts.push(
      `<line x1="${x}" y1="${innerTop}" x2="${x}" y2="${innerBottom}" stroke="magenta" stroke-width="2"/>`,
    );
  }
  for (let i = 1; i < opts.gridRows; i++) {
    const y = Math.round(innerTop + i * cellH);
    overlayParts.push(
      `<line x1="${innerLeft}" y1="${y}" x2="${innerRight}" y2="${y}" stroke="magenta" stroke-width="2"/>`,
    );
  }
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${probe.width}" height="${probe.height}">${overlayParts.join('')}</svg>`,
  );
  await sharp(rawFramePath).composite([{ input: svg }]).png().toFile(overlayPath);

  // Clean up the raw frame; the overlay is what the human inspects.
  await rm(rawFramePath, { force: true });

  console.log(`✓ Wrote ${overlayPath}`);
  console.log(
    `\nOpen the file and check:\n` +
      `  • Magenta lines should land in the GAPS between sprites (not through bodies)\n` +
      (opts.top || opts.right || opts.bottom || opts.left
        ? `  • Yellow rectangle shows the cropped area — sprites should sit inside it,\n` +
          `    with the bordering margin (outside the yellow) being clean background\n`
        : `  • No yellow rectangle (no margin set) — if sprites near the edge look\n` +
          `    misaligned with the grid, try --margin 5 (or 10, 15...) and re-verify\n`) +
      `\nFix paths:\n` +
      `  - Lines slicing sprites in middle → wrong --rows/--cols, adjust\n` +
      `  - Lines slicing sprites only near edges → bump --margin, re-verify\n` +
      `  - Yellow box too small (cuts off sprite edges) → reduce --margin\n` +
      `  - All looks good → re-run without --verify-grid for the real extract`,
  );
}

main().catch((err) => {
  console.error('\nExtract failed:');
  console.error(err.stack ?? err.message ?? err);
  exit(1);
});
