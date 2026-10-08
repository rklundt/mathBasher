// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { decideFullscreen, type FullscreenEnv } from '@/app/fullscreen';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOOT_SOURCE = readFileSync(resolve(__dirname, 'boot.ts'), 'utf8');
const FULLSCREEN_SOURCE = readFileSync(resolve(__dirname, 'fullscreen.ts'), 'utf8');

const phone: FullscreenEnv = {
  touchPrimary: true,
  alreadyFullscreen: false,
  canRequest: true,
  hasUserGesture: true,
};

describe('decideFullscreen', () => {
  it('requests fullscreen on a touch device inside a tap', () => {
    expect(decideFullscreen(phone)).toBe('request');
  });

  it('never on desktop (mouse/trackpad primary)', () => {
    expect(decideFullscreen({ ...phone, touchPrimary: false })).toBe('skip-not-touch');
  });

  it('not again when already fullscreen', () => {
    expect(decideFullscreen({ ...phone, alreadyFullscreen: true })).toBe('skip-already-fullscreen');
  });

  it('silently skips where the API is missing (e.g. iPhone Safari)', () => {
    expect(decideFullscreen({ ...phone, canRequest: false })).toBe('skip-unsupported');
  });

  it('skips without a user gesture (dev ?autostart path)', () => {
    expect(decideFullscreen({ ...phone, hasUserGesture: false })).toBe('skip-no-gesture');
  });
});

describe('boot wiring (static contract)', () => {
  it('bootGame requests fullscreen before constructing Phaser (still inside the tap)', () => {
    const body = BOOT_SOURCE.slice(BOOT_SOURCE.indexOf('export function bootGame'));
    const fsAt = body.indexOf('requestMobileFullscreen();');
    const phaserAt = body.indexOf('new Phaser.Game(');
    expect(fsAt).toBeGreaterThan(-1);
    expect(phaserAt).toBeGreaterThan(fsAt);
  });

  it('fullscreens the WHOLE page (keeps the AGPL footer visible), never just the canvas', () => {
    expect(FULLSCREEN_SOURCE).toMatch(/document\.documentElement/);
    expect(FULLSCREEN_SOURCE).not.toMatch(/startFullscreen|canvas\.requestFullscreen/);
  });

  it('only the CSS centers the canvas (no Phaser CENTER_BOTH double-centering)', () => {
    expect(BOOT_SOURCE).toMatch(/autoCenter:\s*Phaser\.Scale\.NO_CENTER/);
    expect(BOOT_SOURCE).not.toMatch(/autoCenter:\s*Phaser\.Scale\.CENTER_(BOTH|HORIZONTALLY|VERTICALLY)/);
  });
});
