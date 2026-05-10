# ADR-0009: `sharp` as a project-scoped dev dependency

**Status:** Accepted (2026-05-10)

## Context

Sprint 0.7 (Art polish) brings free CC0 art into the game — Kenney sprite packs, particle textures, UI buttons. Before any of that art ships, every PNG needs to go through a consistent processing pipeline:

- **Resize** within a per-kind bounding box (alien 96×96, hero 128×128, projectile 32×32, ui 256×256, particle 64×64, bg 512×512) so a 256×256 enemy ship doesn't waste texture memory or bandwidth.
- **Palette-quantize** sprite art (drastically smaller PNGs for the typical 16-64 colors of pixel art / cartoon sprites) while keeping `bg` art at full RGB for gradient quality.
- **Strip ALL metadata** — generator-output PNGs frequently carry tEXt / iTXt / XMP / ICC chunks that leak prompts, model names, or color profiles into the shipped binary.
- **Verify alpha-channel transparency** survives the encode (sprite pipelines must not silently flatten transparent backgrounds).
- **Produce deterministic output** so a contributor regenerating a sprite from the same raw input gets a byte-identical-ish PNG.

The de-facto Node.js library for fast, scriptable image processing is `sharp` (a libvips wrapper). The question is how it gets installed.

Three options were considered:

1. **System `imagemagick` invoked via shell** — relies on the contributor having ImageMagick installed and on PATH, version-drifty, syntax differs across platforms (Windows `magick` vs macOS `convert`), notorious CVE history. Rejected.
2. **`sharp` as a devDependency** — npm package that pulls a platform-specific prebuilt libvips binary at install time. `pnpm install` and you're done. Pinned, reproducible, fast (libvips is much faster than imagemagick for this kind of bulk work).
3. **Pure-JS alternative `jimp`** — no native binary, no install friction. ~10× slower than sharp for the same work, no libvips-quality palette quantizer, weaker PNG filter selection. Acceptable for a 5-sprite project; painful for the 30-50 sprites sprint 0.7 will process.

## Decision

**Adopt option 2: `sharp@^0.34.5` as a project devDependency.** The library is consumed by `scripts/sprites/process.mjs` and `scripts/sprites/probe.mjs`, exposed as `pnpm sprite:process` and `pnpm sprite:probe`. Per-kind processing profiles (size cap, palette/RGB choice, compression level) live in `process.mjs` so any contributor can drop a raw PNG in `.sprite-source/raw/` and produce a properly-processed shipped sprite with one command.

This decision is the visual-asset analogue of [ADR-0008](ADR-0008-ffmpeg-static-as-dev-dependency.md) (`ffmpeg-static` for audio). Same shape of decision, same supply-chain reasoning, same allowlist-gating posture.

## Supply-chain considerations

`sharp` has a postinstall step that fetches platform-specific prebuilt libvips binaries (the C library that does the actual image work) from a GitHub Releases mirror. Postinstall scripts that download and execute platform-specific binaries are a known supply-chain attack surface, and we treat any new dependency that uses one as warranting an explicit justification rather than a silent inclusion.

This decision **explicitly justifies it** with these mitigations:

1. **Caret-pinned version with lockfile freeze.** `package.json` records `"sharp": "^0.34.5"` and `pnpm-lock.yaml` resolves to the exact installed version + integrity hash. The caret allows minor version updates within 0.34.x for security patches, but a major bump (0.35, 1.0) becomes a deliberate review. Lockfile is committed and CI uses `--frozen-lockfile`.
2. **`pnpm` build-script allowlist.** pnpm 9 blocks postinstall scripts by default; the repo's `package.json#pnpm.onlyBuiltDependencies` field explicitly names `sharp` (alongside `ffmpeg-static`) as the ONLY allowed build-script packages. Any future package that tries to run code at install time will fail loudly until added to the same allowlist (forcing a deliberate review).
3. **Reputable maintainer + project.** `sharp` is maintained by `@lovell` (Lovell Fuller), 20M+ weekly downloads, in continuous active development since 2013. It's the de-facto Node.js image library — used by Next.js, Vercel, Cloudflare Workers, AWS Lambda, and most major Node.js image pipelines. The maintainer publishes prebuilt binaries with subresource integrity hashes.
4. **No production runtime impact.** This is a `devDependencies` entry. The libvips binary never enters the Vite client bundle, the Express server, or the production Docker image. Only contributors processing sprite assets ever invoke it. (`.dockerignore` would also exclude `.sprite-source/` raw inputs — but the npm install step that pulls libvips into `node_modules` happens BEFORE the Docker `COPY . .`, so the build stage's deps are correctly scoped to client+server work via `tsc -p tsconfig.app.json` and `tsc -p tsconfig.server.json`. sharp is in devDependencies so a `pnpm install --prod` in the runtime stage skips it entirely.)
5. **Source-of-truth recipe.** Per-kind processing parameters live in `scripts/sprites/process.mjs`, not in the binary. If we ever needed to rip out `sharp` (security incident, supply-chain compromise, license change to non-Apache), we'd swap to `jimp` or a system `imagemagick` and the same script structure keeps working with zero recipe drift.
6. **Bundle weight is bounded.** sharp's prebuilt binary is ~30 MB on each contributor's platform — well under `ffmpeg-static`'s ~80 MB. Adding it to an already-fat `node_modules` is a non-event for a workstation; for CI when it lands, caching `node_modules` across runs mitigates the per-build pull.

## Consequences

- **Pro:** Onboarding for new contributors is `git clone && pnpm install` — they can `pnpm sprite:probe public/assets/sprites/aliens/alien-green-1.png` immediately, no hunting for a libvips system install or ImageMagick MSI.
- **Pro:** Version-pinned sharp + libvips means a sprite encoded by contributor A is byte-equivalent to one encoded by contributor B. Reproducibility is real, not aspirational.
- **Pro:** The `pnpm.onlyBuiltDependencies` allowlist hardening (originally introduced for `ffmpeg-static` in ADR-0008) extends naturally — every future package wanting to run code at install time has to be added explicitly. Two entries now (`ffmpeg-static`, `sharp`); the same forcing function applies to a third.
- **Pro:** sharp's libvips backend is ~10× faster than `jimp` and significantly faster than ImageMagick for bulk PNG work (Kenney pack ingestion = 30-50 PNGs in one batch). Multi-second vs sub-second matters for iteration speed during sprint 0.7.
- **Con:** Adds ~30 MB to `node_modules` per platform per contributor. Fine for a workstation, modestly painful for cold CI. Acceptable.
- **Con:** Postinstall scripts are a real supply-chain surface. The mitigations above (caret pin within minor, allowlist, reputable maintainer, lockfile, no runtime impact, replaceable recipe) make the residual risk acceptable but not zero. Annual review: confirm `sharp` is still actively maintained, the version is still security-current, no notable libvips CVEs unaddressed.
- **Con:** Native module = platform-specific install. A contributor switching machines or platforms occasionally needs `pnpm rebuild sharp`. Mitigation: documented in DeveloperGuide.md (when sprint 0.7 adds the "Sprites" section) + in the `sprite-pipeline` skill's "Tooling sanity checks" block.

## Revisit if

- Sprite processing moves into the production runtime (server-side image transformation, dynamic resize on upload) — at that point the binary belongs in the Docker image, and the dependency moves from `devDependencies` to `dependencies`.
- A second contributor reports postinstall friction (e.g. the libvips binary download fails behind a corporate proxy, or the platform isn't supported by sharp's prebuilds) — at that point we evaluate vendoring the binary into a release artifact OR documenting a system-libvips fallback.
- `sharp` itself has a security incident — caret pin gets dropped to an exact version (or replaced) in a deliberate ADR-amending change.
- A new asset format becomes important (WebP shipping in addition to PNG, AVIF for compression wins, SVG sprite atlases) — sharp supports all of these and the script gets per-format profiles, but the architecture decision documented here doesn't change.
