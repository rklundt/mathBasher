# ADR-0008: `ffmpeg-static` as a project-scoped dev dependency

**Status:** Accepted (2026-05-09)

## Context

mathBasher needs an audio-processing toolchain to convert raw sound exports (WAV / FLAC / etc.) into the trimmed, loudness-normalized, metadata-stripped MP3s the game ships. The toolchain has to:

- Trim leading/trailing silence so a 0.5-second sound effect isn't padded to 2 seconds of "click — silence — click."
- Loudness-normalize across every asset so SFX don't blast at -6 LUFS while music plays at -23 LUFS.
- Encode to MP3 at a consistent profile (96 kbps mono for SFX, 160 kbps stereo for music).
- Strip ALL metadata (no leaked generator names, prompts, or timestamps in shipped files).
- Produce byte-identical output across dev machines so the audio committed to the repo is reproducible from raw source + recipe.

The de-facto tool for all of this is `ffmpeg`. The question is how it gets installed.

Three options were considered:

1. **Document install in README** — devs install ffmpeg globally (`winget install Gyan.FFmpeg` / `brew install ffmpeg` / `apt install ffmpeg`). Zero project surface added, but each contributor sets up their own machine, and the version may drift between machines.
2. **`ffmpeg-static` as a devDependency** — npm package that pulls a platform-specific ffmpeg binary at install time. `pnpm install` and you're done. Pinned, reproducible.
3. **Commit the binary into the repo** — rejected upfront; ~80 MB binary, three platforms, AGPL/commercial dual-license collision with ffmpeg's own GPL/LGPL split, and security patches require manual updates.

## Decision

**Adopt option 2: `ffmpeg-static@5.2.0` as a project devDependency.** The binary path is consumed by `scripts/audio/encode.mjs` and `scripts/audio/probe.mjs`, exposed as `pnpm audio:encode` and `pnpm audio:probe`. The encoding recipe is encoded in the script (not in tribal knowledge), so any contributor can drop a raw audio file in `.audio-source/raw/` and produce a properly-encoded shipped MP3 with one command.

## Supply-chain considerations

`ffmpeg-static` has a `postinstall` script that downloads a platform-specific ffmpeg binary from GitHub Releases at install time. Postinstall scripts that fetch and run arbitrary code at install time are a known supply-chain attack surface, and we treat any new dependency that uses one as warranting an explicit justification rather than a silent inclusion.

This decision **explicitly justifies it** with these mitigations:

1. **Pinned version, not range.** `package.json` records `"ffmpeg-static": "5.2.0"` — exact, no `^` or `~`. A future Dependabot bump becomes a deliberate review, not a silent transitive change.
2. **`pnpm` build-script allowlist.** pnpm 9 blocks postinstall scripts by default; the repo's `package.json#pnpm.onlyBuiltDependencies` field explicitly names `ffmpeg-static` as the ONLY allowed build-script package. Any future package that tries to run code at install time will fail loudly until added to the same allowlist (forcing a deliberate review).
3. **Reputable maintainer.** `ffmpeg-static` is maintained by `@derhuerst` (Eugene Ware), millions of weekly downloads, in continuous use since 2014. The maintainer also publishes the source for the install logic; the binary download URLs are hardcoded with checksums.
4. **Lockfile is committed** (already a project standard). `pnpm-lock.yaml` records the exact resolved version + integrity hash; lockfile-poisoning attempts surface as a diff.
5. **No production runtime impact.** This is a `devDependencies` entry. The binary never enters the Vite client bundle, the Express server, or the Docker image. Only contributors processing audio assets ever invoke it.
6. **Source-of-truth recipe.** The encoding parameters live in `scripts/audio/encode.mjs`, not in the binary. If we ever needed to rip out `ffmpeg-static` (security incident in the package, supply-chain compromise, license change), we'd swap to a documented system-installed `ffmpeg` and the same script keeps working with zero recipe drift.

## Consequences

- **Pro:** Onboarding for new contributors is `git clone && pnpm install` — they can `pnpm audio:probe public/assets/audio/sfx/fire.mp3` immediately, no hunting for a Windows MSI or `brew install`.
- **Pro:** Version-pinned ffmpeg means audio encoded by contributor A is byte-equivalent to audio encoded by contributor B. Reproducibility is real, not aspirational.
- **Pro:** The `pnpm.onlyBuiltDependencies` allowlist is itself a hardening win — every future package that wants to run code at install time has to be added explicitly, which is a forcing function for supply-chain review.
- **Con:** Adds ~30-60 MB to `node_modules` per platform per contributor. Fine for a workstation, but worth noting.
- **Con:** Postinstall scripts are a real supply-chain surface. The mitigations above (pin, allowlist, reputable maintainer, lockfile, no runtime impact, replaceable) make the residual risk acceptable but not zero. Annual review: confirm `ffmpeg-static` is still actively maintained, the version is still security-current, and the maintainer hasn't transferred the package.
- **Con:** CI environments run `pnpm install --frozen-lockfile` which means every CI build pays the binary-download cost (~30 MB). Caching `node_modules` across CI runs mitigates this when CI lands. Not a concern today (no CI yet).

## Revisit if

- Audio processing moves into the production runtime (server-side rendering, dynamic encoding) — at that point the binary belongs in the Docker image, not in `node_modules`.
- A second contributor reports postinstall friction (e.g. the binary download fails behind their corporate proxy) — at that point we evaluate vendoring the binary into a release artifact.
- `ffmpeg-static` itself has a security incident — pin gets bumped (or replaced) in a deliberate ADR-amending change.
