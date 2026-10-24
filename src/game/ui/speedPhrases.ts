// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { SpeedTier } from '@/services/ScoreCalculator';

/**
 * Sprint 2.11 — the cheer in the "+points" popup for a fast right answer:
 * the tier's ⚡ marks plus a phrase picked at random from that tier's pool
 * (owner: "a good random pool of 50+ words"). The biggest words go with the
 * fastest tier. Never the same phrase twice in a row within a tier.
 */
export const SPEED_PHRASES: Readonly<Record<Exclude<SpeedTier, 0>, readonly string[]>> = {
  3: [
    'Lightning Fast!',
    'Rocket Speed!',
    'Faster Than Light!',
    'Blazing Fast!',
    'Supersonic!',
    'Turbo Brain!',
    'Warp Speed!',
    'Speedy Comet!',
    'Like a Flash!',
    'Mega Fast!',
    'Zoom Zoom Zoom!',
    'Hyper Speed!',
    'Quick as Lightning!',
    'Unstoppable!',
    'Rocket Brain!',
    'Out of This World!',
    'Too Fast to See!',
    'Speed Star!',
    'Supercharged!',
    'Comet Brain!',
  ],
  2: [
    'Super Speedy!',
    'Quick Thinker!',
    'Zippy!',
    'Whoosh!',
    'Speedy Smart!',
    'Fast Fingers!',
    'Swift!',
    'Quick Hop!',
    'Zoom!',
    'Racing Ahead!',
    'Quick Brain!',
    'Ka-Zoom!',
    'Snappy!',
    'Full Speed!',
    'Speedy Star!',
    'Fast and Smart!',
    'Quick as a Fox!',
    'Rapid!',
    'Top Speed!',
    'Zip Zap!',
  ],
  1: [
    'Nice and Quick!',
    'Speedy!',
    'Quick!',
    'On It!',
    'Good Pace!',
    'Nice Speed!',
    'Keep It Up!',
    'Right on Time!',
    'Speeding Up!',
    'Getting Faster!',
    'Nice Move!',
    'Brisk!',
    'Good Hustle!',
    'Picking Up Speed!',
    'Way to Go!',
    'Quick Pick!',
    'Nice Timing!',
    'Hop to It!',
    'Nimble!',
    'Light on Your Feet!',
  ],
};

/** "⚡⚡⚡" for tier 3, "" for no speed bonus. */
export function speedMarks(tier: SpeedTier): string {
  return '⚡'.repeat(tier);
}

const lastPicked: Record<number, number> = {};

/** A random phrase for the tier, never the one it picked last time. */
export function pickSpeedPhrase(tier: Exclude<SpeedTier, 0>, rng: () => number = Math.random): string {
  const pool = SPEED_PHRASES[tier];
  const last = lastPicked[tier] ?? -1;
  let i = Math.floor(rng() * (last < 0 ? pool.length : pool.length - 1));
  if (last >= 0 && i >= last) i += 1;
  lastPicked[tier] = i;
  return pool[i];
}
