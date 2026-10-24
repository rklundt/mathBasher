// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { AUDIO_MANIFEST, pickBonusCheerSfx } from '@/core/audioKeys';

/**
 * Sprint 2.10 — Game Over's four bonus cheers: all on disk, loaded at boot
 * (Game Over can follow any game), and never the same one twice running
 * (a perfect round plays two, half a second apart).
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('bonus cheers', () => {
  it('rotates through all four, never repeating back to back', () => {
    const heard = new Set<string>();
    let prev = pickBonusCheerSfx();
    heard.add(prev);
    for (let i = 0; i < 200; i++) {
      const next = pickBonusCheerSfx();
      expect(next).not.toBe(prev);
      heard.add(next);
      prev = next;
    }
    expect([...heard].sort()).toEqual(['bonus-cheer-1', 'bonus-cheer-2', 'bonus-cheer-3', 'bonus-cheer-4']);
  });

  it('loads at boot and every file is on disk', () => {
    const entries = AUDIO_MANIFEST.filter((e) => e.key.startsWith('bonus-cheer-'));
    expect(entries).toHaveLength(4);
    for (const e of entries) {
      expect(e.scope, e.key).toBe('eager');
      expect(existsSync(resolve(ROOT, 'public', e.url.replace(/^\//, ''))), e.url).toBe(true);
    }
  });
});
