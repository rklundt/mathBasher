// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { GameId } from '@/core/gameIds';
import type { AssetScope } from '@/core/assetScope';
import type { PairPalsTheme } from '@/core/config';

/**
 * Stable string keys for every preloadable audio asset. Mirrors the
 * `sceneKeys.ts` pattern: every reference to an audio asset goes through
 * a constant here so a typo doesn't silently fall through to a runtime
 * "key not found" warning.
 *
 * Three flat const objects — one per audio kind — with parallel naming
 * (`SfxKeys` / `MidgroundKeys` / `MusicKeys`). The `AudioKey` union type
 * spans all three so anywhere in code that takes "any audio key" is
 * statically constrained to actual existing keys.
 *
 * Asset URL paths are derived from these keys via `sfxPath`/`midgroundPath`/
 * `musicPath` helpers so call sites read `loadSfx(SfxKeys.Fire1)` not
 * `'/assets/audio/sfx/fire-1.mp3'`.
 */
export const SfxKeys = {
  Fire1: 'fire-1',
  Fire2: 'fire-2',
  ButtonClick1: 'button-click-1',
  // Hit-feedback SFX added in sprint 0.7 Story 14. Three variants each
  // for correct + wrong so the same exact sound doesn't play 20 times
  // in a row — gets grating fast. `pickRandomHitCorrectSfx` /
  // `pickRandomHitWrongSfx` below select uniformly per hit.
  HitCorrect1: 'hit-correct-1',
  HitCorrect2: 'hit-correct-2',
  HitCorrect3: 'hit-correct-3',
  HitWrong1: 'hit-wrong-1',
  HitWrong2: 'hit-wrong-2',
  HitWrong3: 'hit-wrong-3',
  // Sprint 2.1 playtest — timeout SFX. Plays when the per-question
  // countdown reaches zero before the player gets the right answer
  // (Asteroid Field; Math-a-lotl since sprint 2.5.4). Audible "you ran
  // out of time" cue so the player registers the miss before the next
  // question spawns. Not used by Alien Shoot (the alien-reaches-hero
  // death animation is its failure cue).
  TimeoutFail1: 'timeout-fail-1',
  /**
   * Sprint 2.2 — Number Climb floor-advance cue. Plays ~150 ms after
   * the hero lands on a new floor: a short pneumatic-hiss + metallic-
   * click "space hatch sliding open" sound. Gives an audible "you've
   * entered the next room" beat to complement the already-existing
   * jump click. NOT played on the final escape floor (the escape ship
   * blast is that floor's audio cue).
   */
  HatchOpen1: 'hatch-open-1',
  /**
   * Sprint 2.5.4 — Math-a-lotl correct-catch pops. Three variants,
   * picked at random per catch (`pickRandomBubblePopSfx`) for the same
   * anti-repetition reason as the hit-correct set.
   */
  BubblePop1: 'bubble-pop-1',
  BubblePop2: 'bubble-pop-2',
  BubblePop3: 'bubble-pop-3',
  /**
   * Sprint 2.5.4 — Math-a-lotl wrong-catch sounds (underwater "bloop"
   * style; the shared hit-wrong set didn't fit the aquatic world).
   * Picked at random per wrong catch via `pickRandomBubbleWrongSfx`.
   */
  BubbleWrong1: 'bubble-wrong-1',
  BubbleWrong2: 'bubble-wrong-2',
  BubbleWrong3: 'bubble-wrong-3',
  /**
   * Sprint 2.5.6 — Frog Splash: four hop sounds (two springy boings, two
   * cartoon hops) picked at random per hop, and two "rib-bit + slurp"
   * sounds for catching the fly at the far bank.
   */
  FrogHop1: 'frog-hop-1',
  FrogHop2: 'frog-hop-2',
  FrogHop3: 'frog-hop-3',
  FrogHop4: 'frog-hop-4',
  FrogSlurp1: 'frog-slurp-1',
  FrogSlurp2: 'frog-slurp-2',
  /** Sprint 2.5.6 — Frog Splash wrong-pad SPLASH, one of three at random. */
  FrogSplash1: 'frog-splash-1',
  FrogSplash2: 'frog-splash-2',
  FrogSplash3: 'frog-splash-3',
  /** Sprint 2.5.6 — Frog Splash right-pad ribbit, one of four at random. */
  FrogRibbit1: 'frog-ribbit-1',
  FrogRibbit2: 'frog-ribbit-2',
  FrogRibbit3: 'frog-ribbit-3',
  FrogRibbit4: 'frog-ribbit-4',
  /** Sprint 2.7 — Penguin Slide: two ski-slide swooshes (lane changes, and now and then while sliding). */
  SnowSlide1: 'snow-slide-1',
  SnowSlide2: 'snow-slide-2',
  /** Sprint 2.7 — Penguin Slide: the hop up to grab a fish, one of three at random. */
  PenguinHop1: 'penguin-hop-1',
  PenguinHop2: 'penguin-hop-2',
  PenguinHop3: 'penguin-hop-3',
  /** Sprint 2.7 — Penguin Slide: the SPLAT of a snowball (wrong fish, or the row arriving), one of three at random. */
  PenguinSplat1: 'penguin-splat-1',
  PenguinSplat2: 'penguin-splat-2',
  PenguinSplat3: 'penguin-splat-3',
  /** Sprint 2.7 — Penguin Slide: a kid's "Yummy!" for the round's last fish, one of three at random. */
  PenguinYummy1: 'penguin-yummy-1',
  PenguinYummy2: 'penguin-yummy-2',
  PenguinYummy3: 'penguin-yummy-3',
  /** Sprint 2.7 — Penguin Slide: its own two gulps (mixed with Frog Splash's fly slurps). */
  PenguinGulp1: 'penguin-gulp-1',
  PenguinGulp2: 'penguin-gulp-2',
  /** Sprint 2.8 — Bunny Garden: a rising tune when the right carrot comes up (harp, two trombones), one of three. */
  BunnySuccess1: 'bunny-success-1',
  BunnySuccess2: 'bunny-success-2',
  BunnySuccess3: 'bunny-success-3',
  /** Sprint 2.8 — Bunny Garden: a sad-trombone "wah-wah" when the mole pops up (a wrong hole), one of two. */
  BunnyFail1: 'bunny-fail-1',
  BunnyFail2: 'bunny-fail-2',
  /** Sprint 2.11 follow-up — Bunny Garden: time's up (the carrots hide), one of three (owner's). */
  BunnyHide1: 'bunny-hide-1',
  BunnyHide2: 'bunny-hide-2',
  BunnyHide3: 'bunny-hide-3',
  /** Sprint 2.10 — Game Over's "Finish Bonus!" / "Perfect Round!" cheer, one of four (owner's), boot-loaded. */
  BonusCheer1: 'bonus-cheer-1',
  BonusCheer2: 'bonus-cheer-2',
  BonusCheer3: 'bonus-cheer-3',
  BonusCheer4: 'bonus-cheer-4',
  /** Sprint 2.12 follow-up — Balance Scale: a hollow clank when a wrong weight tips the scale, one of three (owner's). */
  BalanceClank1: 'balance-clank-1',
  BalanceClank2: 'balance-clank-2',
  BalanceClank3: 'balance-clank-3',
  /** Sprint 2.12 follow-up — Balance Scale: a bright little fanfare when the scale levels, one of four (owner's). */
  BalanceSuccess1: 'balance-success-1',
  BalanceSuccess2: 'balance-success-2',
  BalanceSuccess3: 'balance-success-3',
  BalanceSuccess4: 'balance-success-4',
  /** Sprint 2.13 — Pair Pals: the first card of a turn flipping over, one of four (owner's). */
  TileFlip1: 'tile-flip-1',
  TileFlip2: 'tile-flip-2',
  TileFlip3: 'tile-flip-3',
  TileFlip4: 'tile-flip-4',
} as const;

/**
 * Pick a random correct-hit SFX from the 3 variants. Added in sprint 0.7
 * Story 14 — audio variety prevents the same "ding" playing 20× per round.
 * Uniform random over the 3 variants; uses Math.random for simplicity
 * (consistent with `pickRandomAlienSpriteKey`). A seeded RNG could be
 * substituted later if tournament/replay determinism becomes important.
 */
const HIT_CORRECT_KEYS = ['hit-correct-1', 'hit-correct-2', 'hit-correct-3'] as const;
const HIT_WRONG_KEYS = ['hit-wrong-1', 'hit-wrong-2', 'hit-wrong-3'] as const;

// Sprint 0.7 Story 13 — RNG injection (optional) for tournament/replay
// determinism. Defaults to Math.random; production callers don't need
// to pass anything.
export function pickRandomHitCorrectSfx(rng: () => number = Math.random): (typeof HIT_CORRECT_KEYS)[number] {
  return HIT_CORRECT_KEYS[Math.floor(rng() * HIT_CORRECT_KEYS.length)];
}

export function pickRandomHitWrongSfx(rng: () => number = Math.random): (typeof HIT_WRONG_KEYS)[number] {
  return HIT_WRONG_KEYS[Math.floor(rng() * HIT_WRONG_KEYS.length)];
}

const BUBBLE_POP_KEYS = ['bubble-pop-1', 'bubble-pop-2', 'bubble-pop-3'] as const;

/** Sprint 2.5.4 — random Math-a-lotl correct-catch pop. */
export function pickRandomBubblePopSfx(rng: () => number = Math.random): (typeof BUBBLE_POP_KEYS)[number] {
  return BUBBLE_POP_KEYS[Math.floor(rng() * BUBBLE_POP_KEYS.length)];
}

const BUBBLE_WRONG_KEYS = ['bubble-wrong-1', 'bubble-wrong-2', 'bubble-wrong-3'] as const;

const FROG_HOP_KEYS = ['frog-hop-1', 'frog-hop-2', 'frog-hop-3', 'frog-hop-4'] as const;
const FROG_SLURP_KEYS = ['frog-slurp-1', 'frog-slurp-2'] as const;
const FROG_SPLASH_KEYS = ['frog-splash-1', 'frog-splash-2', 'frog-splash-3'] as const;
const FROG_RIBBIT_KEYS = ['frog-ribbit-1', 'frog-ribbit-2', 'frog-ribbit-3', 'frog-ribbit-4'] as const;
// The fly slurps are shared with Penguin Slide's gulp (sprint 2.7), so they
// load at boot (~13 KB): an asset scope names one game.
const FROG_SFX_KEYS: ReadonlySet<string> = new Set([...FROG_HOP_KEYS, ...FROG_SPLASH_KEYS, ...FROG_RIBBIT_KEYS]);

/** Sprint 2.5.6 — random Frog Splash right-pad ribbit. */
export function pickRandomFrogRibbitSfx(rng: () => number = Math.random): (typeof FROG_RIBBIT_KEYS)[number] {
  return FROG_RIBBIT_KEYS[Math.floor(rng() * FROG_RIBBIT_KEYS.length)];
}

/** Sprint 2.5.6 — random Frog Splash wrong-pad splash. */
export function pickRandomFrogSplashSfx(rng: () => number = Math.random): (typeof FROG_SPLASH_KEYS)[number] {
  return FROG_SPLASH_KEYS[Math.floor(rng() * FROG_SPLASH_KEYS.length)];
}

/** Sprint 2.5.6 — random Frog Splash hop sound. */
export function pickRandomFrogHopSfx(rng: () => number = Math.random): (typeof FROG_HOP_KEYS)[number] {
  return FROG_HOP_KEYS[Math.floor(rng() * FROG_HOP_KEYS.length)];
}

/**
 * Sprint 2.7 — Penguin Slide's sounds. The slide swooshes, hops, splats and
 * yummies are its own (`game:penguin-slide`). The gulp mixes its own two
 * gulps with Frog Splash's fly slurps (eager, shared).
 */
const PENGUIN_OWN_GULP_KEYS = ['penguin-gulp-1', 'penguin-gulp-2'] as const;
const PENGUIN_GULP_KEYS = [...PENGUIN_OWN_GULP_KEYS, ...FROG_SLURP_KEYS] as const;
const PENGUIN_BONK_KEYS = ['penguin-splat-1', 'penguin-splat-2', 'penguin-splat-3'] as const;
const PENGUIN_SWISH_KEYS = ['snow-slide-1', 'snow-slide-2'] as const;
const PENGUIN_HOP_KEYS = ['penguin-hop-1', 'penguin-hop-2', 'penguin-hop-3'] as const;
const PENGUIN_YUMMY_KEYS = ['penguin-yummy-1', 'penguin-yummy-2', 'penguin-yummy-3'] as const;
// The hops are shared with Bunny Garden (sprint 2.8), so they load at boot
// (~23 KB): an asset scope names one game.
const PENGUIN_SFX_KEYS: ReadonlySet<string> = new Set([
  ...PENGUIN_SWISH_KEYS,
  ...PENGUIN_BONK_KEYS,
  ...PENGUIN_YUMMY_KEYS,
  ...PENGUIN_OWN_GULP_KEYS,
]);

/**
 * Sprint 2.7 — a random pick that never repeats the one before it, so two
 * sounds strictly alternate and three never play the same one twice running.
 */
function noRepeatPicker<T extends string>(keys: readonly T[]): (rng?: () => number) => T {
  let last = -1;
  return (rng = Math.random) => {
    if (keys.length < 2) return keys[0];
    let i: number;
    if (last < 0) i = Math.floor(rng() * keys.length);
    else {
      i = Math.floor(rng() * (keys.length - 1));
      if (i >= last) i += 1;
    }
    last = i;
    return keys[i];
  };
}
const nextPenguinGulp = noRepeatPicker(PENGUIN_GULP_KEYS);
const nextPenguinBonk = noRepeatPicker(PENGUIN_BONK_KEYS);
const nextPenguinSwish = noRepeatPicker(PENGUIN_SWISH_KEYS);
const nextPenguinHop = noRepeatPicker(PENGUIN_HOP_KEYS);
const nextPenguinYummy = noRepeatPicker(PENGUIN_YUMMY_KEYS);

/** Right fish caught. */
export function pickRandomPenguinGulpSfx(rng: () => number = Math.random): (typeof PENGUIN_GULP_KEYS)[number] {
  return nextPenguinGulp(rng);
}

/** Snowball (wrong fish) or the row arriving (time's up). */
export function pickRandomPenguinBonkSfx(rng: () => number = Math.random): (typeof PENGUIN_BONK_KEYS)[number] {
  return nextPenguinBonk(rng);
}

/** A lane change, or the slide sound now and then while sliding. */
export function pickRandomPenguinSwishSfx(rng: () => number = Math.random): (typeof PENGUIN_SWISH_KEYS)[number] {
  return nextPenguinSwish(rng);
}

/** The round's last fish caught: "Yummy!" (in place of the gulp). */
export function pickRandomPenguinYummySfx(rng: () => number = Math.random): (typeof PENGUIN_YUMMY_KEYS)[number] {
  return nextPenguinYummy(rng);
}

/**
 * Sprint 2.8 — Bunny Garden's sounds. The hop is Penguin Slide's hop to a
 * fish (owner's choice, shared and boot-loaded). The success and fail tunes
 * are its own (`game:bunny-garden`), and so is the hide (time's up; the
 * owner's three sounds replaced a borrowed placeholder after 2.11).
 */
const BUNNY_HOP_KEYS = PENGUIN_HOP_KEYS;
const BUNNY_POP_KEYS = ['bunny-success-1', 'bunny-success-2', 'bunny-success-3'] as const;
const BUNNY_MOLE_KEYS = ['bunny-fail-1', 'bunny-fail-2'] as const;
const BUNNY_HIDE_KEYS = ['bunny-hide-1', 'bunny-hide-2', 'bunny-hide-3'] as const;
const BUNNY_SFX_KEYS: ReadonlySet<string> = new Set([...BUNNY_POP_KEYS, ...BUNNY_MOLE_KEYS, ...BUNNY_HIDE_KEYS]);
const nextBunnyHop = noRepeatPicker(BUNNY_HOP_KEYS);
const nextBunnyPop = noRepeatPicker(BUNNY_POP_KEYS);
const nextBunnyMole = noRepeatPicker(BUNNY_MOLE_KEYS);
const nextBunnyHide = noRepeatPicker(BUNNY_HIDE_KEYS);

/** The bunny hops to a hole. */
export function pickRandomBunnyHopSfx(rng: () => number = Math.random): (typeof BUNNY_HOP_KEYS)[number] {
  return nextBunnyHop(rng);
}

/** The right carrot pops out of the ground. */
export function pickRandomBunnyPopSfx(rng: () => number = Math.random): (typeof BUNNY_POP_KEYS)[number] {
  return nextBunnyPop(rng);
}

/** A wrong hole: the mole peeks up. */
export function pickRandomBunnyMoleSfx(rng: () => number = Math.random): (typeof BUNNY_MOLE_KEYS)[number] {
  return nextBunnyMole(rng);
}

/** Time's up: the carrots hide. */
export function pickRandomBunnyHideSfx(rng: () => number = Math.random): (typeof BUNNY_HIDE_KEYS)[number] {
  return nextBunnyHide(rng);
}

/** Sprint 2.12 — Balance Scale's own sounds (the mismatch clank, the "Balanced!" fanfare), loaded with the game; never the same one twice running. */
const BALANCE_CLANK_KEYS = ['balance-clank-1', 'balance-clank-2', 'balance-clank-3'] as const;
const BALANCE_SUCCESS_KEYS = [
  'balance-success-1',
  'balance-success-2',
  'balance-success-3',
  'balance-success-4',
] as const;
const BALANCE_SFX_KEYS: ReadonlySet<string> = new Set([...BALANCE_CLANK_KEYS, ...BALANCE_SUCCESS_KEYS]);
const nextBalanceClank = noRepeatPicker(BALANCE_CLANK_KEYS);
const nextBalanceSuccess = noRepeatPicker(BALANCE_SUCCESS_KEYS);

/** The right weight levels the scale. */
export function pickBalanceSuccessSfx(rng: () => number = Math.random): (typeof BALANCE_SUCCESS_KEYS)[number] {
  return nextBalanceSuccess(rng);
}

/** A wrong weight tips the scale. */
export function pickBalanceClankSfx(rng: () => number = Math.random): (typeof BALANCE_CLANK_KEYS)[number] {
  return nextBalanceClank(rng);
}

/**
 * Sprint 2.13 — Pair Pals' sounds. The first card of a turn plays one of the
 * owner's tile flips (its own); the second plays the result, borrowed from
 * Bunny Garden and Balance Scale (owner: their success and fail sounds until
 * Pair Pals has its own), so those load with Pair Pals too (`audioAlsoFor`).
 * Its music is its own, one track per card theme (`PAIR_PALS_MUSIC`).
 */
const TILE_FLIP_KEYS = ['tile-flip-1', 'tile-flip-2', 'tile-flip-3', 'tile-flip-4'] as const;
const PAIR_PALS_MATCH_KEYS = [...BUNNY_POP_KEYS, ...BALANCE_SUCCESS_KEYS] as const;
const PAIR_PALS_MISS_KEYS = [...BUNNY_MOLE_KEYS, ...BALANCE_CLANK_KEYS] as const;
const nextTileFlip = noRepeatPicker(TILE_FLIP_KEYS);
const nextPairPalsMatch = noRepeatPicker(PAIR_PALS_MATCH_KEYS);
const nextPairPalsMiss = noRepeatPicker(PAIR_PALS_MISS_KEYS);

/** The first card of a turn flips over. */
export function pickTileFlipSfx(rng: () => number = Math.random): (typeof TILE_FLIP_KEYS)[number] {
  return nextTileFlip(rng);
}

/** The second card makes a pair. */
export function pickPairPalsMatchSfx(rng: () => number = Math.random): (typeof PAIR_PALS_MATCH_KEYS)[number] {
  return nextPairPalsMatch(rng);
}

/** The second card doesn't match. */
export function pickPairPalsMissSfx(rng: () => number = Math.random): (typeof PAIR_PALS_MISS_KEYS)[number] {
  return nextPairPalsMiss(rng);
}

/** Sprint 2.10 — Game Over's bonus cheers; never the same one twice running (a perfect round plays two). */
const BONUS_CHEER_KEYS = ['bonus-cheer-1', 'bonus-cheer-2', 'bonus-cheer-3', 'bonus-cheer-4'] as const;
const nextBonusCheer = noRepeatPicker(BONUS_CHEER_KEYS);

/** A "Finish Bonus!" or "Perfect Round!" popping in on Game Over. */
export function pickBonusCheerSfx(rng: () => number = Math.random): (typeof BONUS_CHEER_KEYS)[number] {
  return nextBonusCheer(rng);
}

/** The hop up to grab a fish (right or wrong). */
export function pickRandomPenguinHopSfx(rng: () => number = Math.random): (typeof PENGUIN_HOP_KEYS)[number] {
  return nextPenguinHop(rng);
}

/** Sprint 2.5.6 — random Frog Splash fly-catch sound. */
export function pickRandomFrogSlurpSfx(rng: () => number = Math.random): (typeof FROG_SLURP_KEYS)[number] {
  return FROG_SLURP_KEYS[Math.floor(rng() * FROG_SLURP_KEYS.length)];
}

/** Sprint 2.5.4 — random Math-a-lotl wrong-catch sound. */
export function pickRandomBubbleWrongSfx(rng: () => number = Math.random): (typeof BUBBLE_WRONG_KEYS)[number] {
  return BUBBLE_WRONG_KEYS[Math.floor(rng() * BUBBLE_WRONG_KEYS.length)];
}

/** Atmospheric loop keys (midground kind — see encoder profile). */
export const MidgroundKeys = {
  /**
   * Alien Shoot's hero-running ambient loop. Sprint 0.5.3 first wired
   * this; pre-2.1.9 it was hard-coded into both game scenes (wrong
   * for Asteroid Field, which has no skittering-hero gameplay
   * concept). Now mapped per-gameId via `GAME_MIDGROUND_MAP`.
   */
  Skittering1: 'skittering-1',
  /**
   * Asteroid Field's ambient space-noises loop. Sprint 2.1.9 — first
   * per-game-mode midground asset, fixing the "Asteroid Field plays
   * a skittering loop with no skittering happening" mismatch. 6s
   * mono loop encoded with `--no-trim` so the loop boundary stays
   * clean.
   */
  SpaceNoises1: 'space-noises-1',
  /**
   * Number Climb (ships as "Space Escape!") atmospheric loop —
   * crackling fire under a quiet emergency klaxon. Matches the
   * burning-station escape premise. ~10s mono loop, encoded with
   * `--no-trim` (default for midground) so the boundary stays clean,
   * and `--loudnorm-target -26 LUFS` (4 dB quieter than the midground
   * default of -22) so the attention-grabbing klaxon stays in the
   * BACKGROUND rather than competing with foreground SFX. Sprint 2.2 —
   * replaces the Skittering1 placeholder.
   */
  FireKlaxon1: 'fire-klaxon-1',
  /**
   * Math-a-lotl's two water-ambience loops (sprint 2.5.4). They play
   * TOGETHER, layered — the 10 s loops are different recordings, so
   * the pair never sounds like one short loop repeating.
   */
  Underwater1: 'underwater-1',
  Underwater2: 'underwater-2',
  /**
   * Frog Splash's river ambience (sprint 2.5.6): a babbling brook and a
   * crickets-and-bugs bed, both 10 s seamless loops, played together. The
   * crickets sit well under the brook via `AUDIO_GAIN`.
   */
  RiverBrook1: 'river-brook-1',
  RiverCrickets1: 'river-crickets-1',
} as const;

/** Music loop keys. */
export const MusicKeys = {
  /**
   * Alien Shoot gameplay loop + default menu/non-game music.
   * Sprint 0.5.3 first wired this in `loop-1.mp3`.
   */
  Loop1: 'loop-1',
  /**
   * Asteroid Field gameplay loop. Sprint 2.1.5 — first per-game-mode
   * music track. 30-second loop encoded through `pnpm audio:encode
   * --kind music --no-trim` (the `--no-trim` flag preserves clean
   * loop boundaries that the default trim pass could clip into).
   *
   * `loop-2.mp3` exists on disk but is orphaned from earlier
   * processing — not in this key registry, not loaded by BootScene.
   * Future cleanup may either wire it as an alt-track or remove it.
   */
  Loop3: 'loop-3',
  /**
   * Number Climb (ships as "Space Escape!") gameplay loop. ~16s
   * stereo music track encoded with the default music profile
   * (160 kbps stereo, -18 LUFS). Layered over the FireKlaxon1
   * midground + foreground SFX (hatch, click). Sprint 2.2 — replaces
   * the Loop1 placeholder. File name `game-background-song-loop-4`
   * follows the user's personal music-library numbering convention,
   * not the legacy `loop-N` shipped-file series (1/2/3 are Alien Shoot
   * / orphan / Asteroid Field respectively).
   */
  EscapeLoop1: 'game-background-song-loop-4',
  /**
   * Math-a-lotl gameplay loop (sprint 2.5.4). ~20 s stereo, encoded
   * `--kind music --no-trim` for a clean loop seam. Played quieter
   * than the water ambience via `AUDIO_GAIN` below.
   */
  ReefLoop1: 'loop-5',
  /**
   * Frog Splash gameplay loop (sprint 2.5.6). ~20 s upbeat stereo track,
   * encoded `--kind music --no-trim` for a clean loop seam; mixed under
   * the river ambience via `AUDIO_GAIN`.
   */
  PondLoop1: 'loop-6',
  /**
   * Space Shooter gameplay loop (sprint 2.6). 30 s stereo track, encoded
   * `--kind music --no-trim` for a clean loop seam. No ambience under it.
   */
  CockpitLoop1: 'loop-7',
  /**
   * Penguin Slide gameplay loop (sprint 2.7). 60 s stereo track, encoded
   * `--kind music --no-trim` for a clean loop seam.
   */
  SnowLoop1: 'loop-8',
  /**
   * Bunny Garden gameplay loop (sprint 2.8). 60 s stereo track, encoded
   * `--kind music --no-trim` for a clean loop seam.
   */
  GardenLoop1: 'loop-9',
  /** Balance Scale gameplay loop (sprint 2.12, the owner's track). 60 s stereo, `--kind music --no-trim`. */
  BalanceLoop1: 'loop-10',
  /** Pair Pals' background music, one per card theme (sprint 2.13, owner's): dragons (~45 s). */
  PairPalsLoop1: 'loop-11',
  /** Pair Pals: dinosaurs (60 s). */
  PairPalsDinoLoop1: 'loop-12',
  /** Pair Pals: desserts (60 s). */
  PairPalsDessertLoop1: 'loop-13',
  /** Pair Pals: cute animals (60 s). */
  PairPalsAnimalLoop1: 'loop-14',
  /** Pair Pals: aliens (60 s; raised 1.4 dB to sit with the others). */
  PairPalsAlienLoop1: 'loop-15',
} as const;

export type SfxKey = (typeof SfxKeys)[keyof typeof SfxKeys];
export type MidgroundKey = (typeof MidgroundKeys)[keyof typeof MidgroundKeys];
export type MusicKey = (typeof MusicKeys)[keyof typeof MusicKeys];
export type AudioKey = SfxKey | MidgroundKey | MusicKey;

/**
 * Per-game-mode music mapping. Parallels `GAME_BG_MAP` in
 * `spriteKeys.ts`: each `GameId` resolves to a `MusicKey` so each
 * game scene can play its own background loop without hard-coding
 * the key at the call site. Sprint 2.1.5 — first per-game audio
 * identity. Adding a new game mode = add a row here + a `MusicKeys`
 * entry above. Declared as `Record<GameId, MusicKey>` so a future
 * GameId addition without a music map gets flagged at compile time
 * (TS error: "missing property 'number-climb'").
 *
 * Unlike `GAME_BG_MAP` (consumed by the persistent `BackgroundScene`
 * via `Settings.onGameIdChange`), this map is consumed by individual
 * game scenes at `create` time. Game scenes already know their own
 * gameId, so no observer pattern is needed — they just read the map
 * directly.
 */
/**
 * Sprint 2.13 — Pair Pals' music per card theme (owner's tracks). Loaded on demand (`onDemand`).
 */
export const PAIR_PALS_MUSIC: Readonly<Record<PairPalsTheme, MusicKey>> = {
  animals: MusicKeys.PairPalsAnimalLoop1,
  desserts: MusicKeys.PairPalsDessertLoop1,
  dinosaurs: MusicKeys.PairPalsDinoLoop1,
  dragons: MusicKeys.PairPalsLoop1,
  aliens: MusicKeys.PairPalsAlienLoop1,
};
const PAIR_PALS_MUSIC_KEYS: ReadonlySet<string> = new Set(Object.values(PAIR_PALS_MUSIC));

export const GAME_MUSIC_MAP: Readonly<Record<GameId, MusicKey>> = {
  'alien-shoot': MusicKeys.Loop1,
  'asteroid-field': MusicKeys.Loop3,
  // Sprint 2.2 — escape-tower climb music. Replaced the Loop1
  // placeholder once the real Climb track arrived.
  'number-climb': MusicKeys.EscapeLoop1,
  'math-a-lotl': MusicKeys.ReefLoop1,
  'frog-splash': MusicKeys.PondLoop1,
  'space-shooter': MusicKeys.CockpitLoop1,
  'penguin-slide': MusicKeys.SnowLoop1,
  'bunny-garden': MusicKeys.GardenLoop1,
  'balance-scale': MusicKeys.BalanceLoop1,
  // Sprint 2.13 — Pair Pals plays its card theme's track instead (`PAIR_PALS_MUSIC`); this is the default.
  'pair-pals': MusicKeys.PairPalsLoop1,
};

/**
 * Sprint 2.1.9 — per-game midground (ambient under-SFX loop). Parallels
 * `GAME_MUSIC_MAP`. Lifted because v2.1.8 hard-coded
 * `MidgroundKeys.Skittering1` for BOTH games even though "skittering"
 * is an Alien-Shoot-hero concept that has no place in Asteroid Field
 * (which now plays an ambient space-noises loop). Same TypeScript
 * exhaustiveness guarantees as the music map — adding a new GameId
 * forces a compile-time decision on which midground it plays.
 */
export const GAME_MIDGROUND_MAP: Readonly<Record<GameId, readonly MidgroundKey[]>> = {
  'alien-shoot': [MidgroundKeys.Skittering1],
  'asteroid-field': [MidgroundKeys.SpaceNoises1],
  // Sprint 2.2 — fire-klaxon ambient matches the burning-station
  // escape premise. Replaced the Skittering1 placeholder once the
  // real Climb midground arrived.
  'number-climb': [MidgroundKeys.FireKlaxon1],
  // Sprint 2.5.4 — two water loops layered (the map value became a
  // list so a game can play more than one ambience loop at once).
  'math-a-lotl': [MidgroundKeys.Underwater1, MidgroundKeys.Underwater2],
  // Sprint 2.5.6 — brook + crickets, layered.
  'frog-splash': [MidgroundKeys.RiverBrook1, MidgroundKeys.RiverCrickets1],
  // Sprint 2.6 — music only (the lasers and explosions are the action).
  'space-shooter': [],
  // Sprint 2.7 — none yet (an optional sliding-on-snow loop may come from the owner).
  'penguin-slide': [],
  // Sprint 2.8 — none yet.
  'bunny-garden': [],
  // Sprint 2.12 — music only.
  'balance-scale': [],
  'pair-pals': [],
};

/**
 * Sprint 2.5.4 — per-asset playback gain (0..1), multiplied into the
 * kind's slider volume. Lets one game balance its own mix without
 * re-encoding: Math-a-lotl's music sits BELOW its water ambience,
 * which sits below the pops (gain 1, the default). The player's volume
 * sliders and mute still apply on top. Keys not listed play at 1.
 */
export const AUDIO_GAIN: Readonly<Partial<Record<AudioKey, number>>> = {
  [MusicKeys.ReefLoop1]: 0.45,
  [MidgroundKeys.Underwater1]: 0.7,
  [MidgroundKeys.Underwater2]: 0.7,
  // Playtest: a wrong catch should sound a bit LOUDER than a right one.
  // Both sets are normalized to the sfx target, but sub-second clips
  // drift: the pops measure ~4 dB hotter (mean ≈ -12 dB vs -16 dB for
  // the wrong set). Halving the pops (-6 dB) leaves the wrong sounds
  // ~2 dB on top. The wrong set plays at the default 1.
  [SfxKeys.BubblePop1]: 0.5,
  [SfxKeys.BubblePop2]: 0.5,
  [SfxKeys.BubblePop3]: 0.5,
  // Frog Splash river bed: the brook a little under full, the crickets
  // well below it (owner's mix note: crickets "significantly lower").
  [MidgroundKeys.RiverBrook1]: 0.6,
  [MidgroundKeys.RiverCrickets1]: 0.25,
  [MusicKeys.PondLoop1]: 0.5,
  // Owner: the mismatch clank should be "less pronounced than normal sfx";
  // 0.6 was too muted on the owner's phone, so 0.8.
  [SfxKeys.BalanceClank1]: 0.8,
  [SfxKeys.BalanceClank2]: 0.8,
  [SfxKeys.BalanceClank3]: 0.8,
};

/** Playback gain for an asset key (1 when not listed in `AUDIO_GAIN`). */
export function audioGainFor(key: string): number {
  return (AUDIO_GAIN as Readonly<Record<string, number | undefined>>)[key] ?? 1;
}

/**
 * Build the URL to a shipped audio file. Phaser's loader accepts URL strings
 * relative to the document root; Vite serves `public/` at the root in both
 * dev and production builds, so `/assets/audio/<kind>/<key>.mp3` resolves
 * the same in both modes.
 */
export function sfxPath(key: SfxKey): string {
  return `/assets/audio/sfx/${key}.mp3`;
}

export function midgroundPath(key: MidgroundKey): string {
  return `/assets/audio/midground/${key}.mp3`;
}

export function musicPath(key: MusicKey): string {
  return `/assets/audio/music/${key}.mp3`;
}

/**
 * Single source of truth for every audio asset the game preloads at boot.
 *
 * Derived programmatically from the three keys-per-kind const objects + the
 * matching path helpers, so adding a new sound is a 1-line edit here in
 * `audioKeys.ts` — no second change needed in `BootScene`. Pre-refactor
 * (sprint 0.5.5) `BootScene.preload` hand-paired every key with its path
 * helper, and the comment claiming "single source of truth" was aspirational
 * (the list lived in BootScene). Now `BootScene.preload` just iterates this
 * manifest with no per-kind branching.
 *
 * The `kind` field is currently unused at preload (Phaser's `load.audio` is
 * kind-agnostic) but kept on every entry so future code that wants to
 * iterate "every SFX key" or "every loopable asset" can filter by kind
 * without re-deriving from the source const objects.
 */
export interface AudioManifestEntry {
  readonly key: AudioKey;
  readonly kind: 'sfx' | 'midground' | 'music';
  readonly url: string;
  /**
   * Sprint 2.1.6 — when this asset should be loaded. See
   * `src/core/assetScope.ts` for the taxonomy. Story 1 tags every
   * existing entry as `'eager'` (no behavior change vs. pre-sprint);
   * story 5 re-scopes per-game audio (e.g. Asteroid Field's `loop-3`)
   * to `'game:<id>'` so it defers until the matching game is picked.
   */
  readonly scope: AssetScope;
  /**
   * Sprint 2.13 — other games that borrow this sound and load it with
   * their own (`scope` names one game). Pair Pals plays Bunny Garden's and
   * Balance Scale's success and fail sounds.
   */
  readonly alsoFor?: readonly GameId[];
  /**
   * Sprint 2.13 — not in its game's bundle: the scene loads it when it's
   * needed (`loadAudioOnDemand`). Pair Pals' four theme tracks (about
   * 1 MB each) load one at a time, in the background, for the theme played.
   */
  readonly onDemand?: true;
}

/**
 * Per-key audio scope resolver. Sprint 2.1.6 — most audio is shared
 * across games (button-click, hit/wrong SFX, the Alien Shoot loop)
 * and stays `'eager'`. A small allowlist of per-game audio
 * (`loop-3` is the AF
 * music) defers to `'game:asteroid-field'`. Default keeps the
 * shared-audio behavior unchanged.
 *
 * Add a new per-game audio asset = add a row here. The function
 * shape (rather than a `Partial<Record<AudioKey, AssetScope>>` map)
 * makes the per-key logic readable AND lets a future scope rule
 * dispatch on something other than the key (e.g. file size).
 */
function audioScopeFor(key: AudioKey): AssetScope {
  // Sprint 2.5.4 — TimeoutFail1 is shared by Asteroid Field and
  // Math-a-lotl (a scope names one game), so it moved to eager (~7 KB).
  if (key === SfxKeys.TimeoutFail1) return 'eager';
  if (key === MusicKeys.Loop3) return 'game:asteroid-field';
  if (key === MidgroundKeys.SpaceNoises1) return 'game:asteroid-field';
  // Sprint 2.2 — Number Climb-only ambient + music + SFX assets.
  if (key === SfxKeys.HatchOpen1) return 'game:number-climb';
  if (key === MidgroundKeys.FireKlaxon1) return 'game:number-climb';
  if (key === MusicKeys.EscapeLoop1) return 'game:number-climb';
  // Sprint 2.5.4 — Math-a-lotl-only music, ambience and pops.
  if (key === MusicKeys.ReefLoop1) return 'game:math-a-lotl';
  if (key === MidgroundKeys.Underwater1) return 'game:math-a-lotl';
  if (key === MidgroundKeys.Underwater2) return 'game:math-a-lotl';
  if (key === SfxKeys.BubblePop1 || key === SfxKeys.BubblePop2 || key === SfxKeys.BubblePop3) {
    return 'game:math-a-lotl';
  }
  if (key === SfxKeys.BubbleWrong1 || key === SfxKeys.BubbleWrong2 || key === SfxKeys.BubbleWrong3) {
    return 'game:math-a-lotl';
  }
  // Sprint 2.5.6 — Frog Splash-only sounds.
  if (key === MidgroundKeys.RiverBrook1 || key === MidgroundKeys.RiverCrickets1) return 'game:frog-splash';
  if (key === MusicKeys.PondLoop1) return 'game:frog-splash';
  if (FROG_SFX_KEYS.has(key)) return 'game:frog-splash';
  // Sprint 2.6 — Space Shooter's music (its effects are Alien Shoot's, eager).
  if (key === MusicKeys.CockpitLoop1) return 'game:space-shooter';
  // Sprint 2.7 — Penguin Slide's music and its own sounds (its gulp mix also uses the frog slurps, eager).
  if (key === MusicKeys.SnowLoop1) return 'game:penguin-slide';
  if (PENGUIN_SFX_KEYS.has(key)) return 'game:penguin-slide';
  // Sprint 2.8 — Bunny Garden's music, tunes and time's-up sounds (its hop is the shared penguin hop).
  if (key === MusicKeys.GardenLoop1) return 'game:bunny-garden';
  // Sprint 2.12 — Balance Scale's music, clanks and fanfares (its hop is the shared penguin hop).
  if (key === MusicKeys.BalanceLoop1) return 'game:balance-scale';
  if (BALANCE_SFX_KEYS.has(key)) return 'game:balance-scale';
  if (BUNNY_SFX_KEYS.has(key)) return 'game:bunny-garden';
  // Sprint 2.13 — Pair Pals' music and its own tile flips.
  if (PAIR_PALS_MUSIC_KEYS.has(key)) return 'game:pair-pals';
  if ((TILE_FLIP_KEYS as readonly string[]).includes(key)) return 'game:pair-pals';
  return 'eager';
}

/** Sprint 2.13 — the games that borrow a sound scoped to another game (see `alsoFor`): Pair Pals' success and fail sounds. */
const PAIR_PALS_BORROWED: ReadonlySet<string> = new Set([...PAIR_PALS_MATCH_KEYS, ...PAIR_PALS_MISS_KEYS]);
function audioAlsoFor(key: AudioKey): { alsoFor?: readonly GameId[]; onDemand?: true } {
  if (PAIR_PALS_MUSIC_KEYS.has(key)) return { onDemand: true };
  return PAIR_PALS_BORROWED.has(key) ? { alsoFor: ['pair-pals'] } : {};
}

export const AUDIO_MANIFEST: ReadonlyArray<AudioManifestEntry> = [
  ...Object.values(SfxKeys).map<AudioManifestEntry>((key) => ({
    key,
    kind: 'sfx',
    url: sfxPath(key),
    scope: audioScopeFor(key),
    ...audioAlsoFor(key),
  })),
  ...Object.values(MidgroundKeys).map<AudioManifestEntry>((key) => ({
    key,
    kind: 'midground',
    url: midgroundPath(key),
    scope: audioScopeFor(key),
    ...audioAlsoFor(key),
  })),
  ...Object.values(MusicKeys).map<AudioManifestEntry>((key) => ({
    key,
    kind: 'music',
    url: musicPath(key),
    scope: audioScopeFor(key),
    ...audioAlsoFor(key),
  })),
];
