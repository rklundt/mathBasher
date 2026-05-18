# ADR-0011: Per-game-mode dispatch via `Record<GameId, X>` maps

**Status:** Accepted (2026-05-18)
**Implements:** Sprint 2.1.9 (codifies a pattern that emerged across sprints 2.1 → 2.1.8)
**Builds on:** [ADR-0006](ADR-0006-folder-discipline.md) (folder discipline + the `src/core/` vs `src/game/` boundary the dispatch maps live across)

## Context

mathBasher has multiple game modes:
- **Alien Shoot** (sprint 0.5 baseline; the original mode — 4 lanes, aliens descend, hero auto-runs)
- **Asteroid Field** (sprint 2.1; second mode — 4 floating asteroids, hero rotates to aim)
- **Number Climb** (sprint 2.2 — planned)
- **(future modes)**

Each game mode needs to differ from the others on multiple axes:
- Visual backdrop (`BackgroundScene` swaps between nebula / asteroid-belt / future)
- Background music (`Loop1` / `Loop3` / future)
- Background midground audio (`Skittering1` / `SpaceNoises1` / future)
- Asset bundle (alien spritesheets vs asteroid rock sprites vs future-mode art)
- Scene-key route from `DifficultyScene`
- (potentially future axes — collision system, input scheme, telemetry partition)

Adding a third game mode (2.2) is the trigger for documenting the dispatch pattern that emerged organically across sprints 2.1 → 2.1.8. Without a written contract, the 2.2 author would have to read 6+ files to figure out "what do I touch when I add a game mode?"

## Decision

**Each per-game-mode axis is a `Readonly<Record<GameId, X>>` constant, declared near the keys it references.** Adding a new game mode = extend the `GameId` union AND add one row to every Record. TypeScript exhaustiveness checks the second step — a new `GameId` literal that doesn't appear as a key in some `Record<GameId, X>` is a compile error.

The dispatch axes today (sprint 2.1.9):

| Axis | Map | File | Consumer |
|---|---|---|---|
| Background image | `GAME_BG_MAP: Record<GameId, BgSpriteKey>` | `src/core/spriteKeys.ts` | `BackgroundScene` (reactive via `Settings.onGameIdChange` observer) |
| Music loop | `GAME_MUSIC_MAP: Record<GameId, MusicKey>` | `src/core/audioKeys.ts` | `GameSceneLifecycle.enter()` / `.exit()` (read at scene mount) |
| Midground loop | `GAME_MIDGROUND_MAP: Record<GameId, MidgroundKey>` | `src/core/audioKeys.ts` | Same as music |
| Asset bundle scope | per-entry `scope: 'game:<gameId>'` field on each `SpriteManifestEntry` / `AudioManifestEntry` | `src/core/spriteKeys.ts`, `src/core/audioKeys.ts` | `loadGameBundle(scene, gameId)` filters by scope predicate |
| Audio scope dispatch | `audioScopeFor(key): AssetScope` | `src/core/audioKeys.ts` | `AUDIO_MANIFEST` builder calls per key |
| Scene-key route | inline `gameId === 'asteroid-field' ? Keys.AsteroidField : Keys.Game` switch | `src/game/scenes/DifficultyScene.ts`, `GameOverScene.ts` (Play Again) | `scene.start(SceneKeys.Loading, { targetSceneKey, gameId })` |
| LoadingScene caption | inline switch | `src/game/scenes/LoadingScene.ts` | rendered by `attachLoadingOverlay` |

The `GameSceneLifecycle` helper (`src/game/services/GameSceneLifecycle.ts`) abstracts the scene-mount-time work that uses these maps — telemetry, HUD launch, audio loop start/stop. Game scenes construct one in `create()` and call `.enter()` / `.exit()` / `.endRound()` / `.pause()` / `.resume()` / `.quitToMenu()` instead of duplicating the bookkeeping per scene.

### Why separate maps instead of one mega-map

It's tempting to consolidate everything into:

```ts
interface GameDescriptor {
  readonly bg: BgSpriteKey;
  readonly music: MusicKey;
  readonly midground: MidgroundKey;
  readonly sceneKey: SceneKey;
  readonly loadingCaption: string;
  // ... etc.
}
const GAMES: Record<GameId, GameDescriptor> = { ... };
```

We've explicitly chosen NOT to do this. Reasons:

1. **Different consumers want different keys.** `BackgroundScene` only cares about `bg`; loading the whole `GameDescriptor` to use one field is over-coupling. Splitting them means each consumer imports exactly what it needs.

2. **Different consumers live in different layers.** `GAME_BG_MAP` lives in `src/core/spriteKeys.ts` next to `BgSpriteKeys`. `GAME_MUSIC_MAP` lives in `src/core/audioKeys.ts` next to `MusicKeys`. The scene-key route is in scene files. Folder discipline (ADR-0006) says `src/core/` doesn't import from `src/game/` — a mega-map would force one or the other layer to import upward.

3. **Some axes don't fit the map shape.** The per-entry `scope` field on manifest entries is a different axis from the map dispatch — assets have a scope that's per-entry, not per-game. Forcing them into the same shape would be procrustean.

4. **YAGNI for "the third axis we haven't thought of yet."** Adding a fourth axis (e.g. per-game input scheme) under the per-axis-map convention is the same surgery — declare a new `Record<GameId, X>`, add rows. The mega-map version would require widening `GameDescriptor` everywhere.

The downside: per-game-mode info lives in ~6 files. Mitigated by:
- All maps follow the SAME `Readonly<Record<GameId, X>>` shape (uniform pattern; once you've read one you've read them all)
- TypeScript exhaustiveness catches every missing row at compile time
- This ADR is the one-stop-shop for "where do I look?"

### Why an observer pattern for `gameId` specifically

`Settings.onGameIdChange` (sprint 2.1.1, refactored to `createObservable` in 2.1.9) exists because `BackgroundScene` runs persistently across the lifetime of the page and needs to react to game-mode changes that happen in scenes it doesn't directly know about (`GameSelectScene` tile click → `Settings.setGameId` → fires the observer → BackgroundScene swaps backdrop). Other consumers (`GameSceneLifecycle`, etc.) read maps directly at scene mount time and don't need reactivity.

## Consequences

### Positive

- Adding a new game mode is a mechanical checklist (below). TypeScript catches incomplete additions at compile time.
- Each axis is independently editable. Re-tuning Asteroid Field's music doesn't touch any other axis.
- Folder discipline preserved — each map lives next to the keys it dispatches over.
- No mega-import. Each consumer pulls only the maps it actually uses.

### Negative

- Per-game-mode info is split across files. A reader new to the codebase has to read this ADR (or grep `GAME_` + the per-game-mode comment blocks in the manifest files) to assemble the full picture for any single game mode.
- Adding a new dispatch axis (a 7th map) means editing 3 files: the new map's declaration file, the consumer, and this ADR.

### Neutral

- `GameId` union grows linearly with new game modes. Each addition is a 1-line edit in `Settings.ts` followed by however many compile errors TypeScript flags (which IS the checklist for what else to update).

## Checklist — adding a new game mode

When sprint 2.X adds game mode `<id>`:

1. **Extend `GameId` union** in `src/services/Settings.ts`:
   ```ts
   export type GameId = 'alien-shoot' | 'asteroid-field' | '<id>';
   ```
   TypeScript will now flag every `Record<GameId, X>` missing a row for `<id>` AND every `gameId === '<old>' ? A : B` switch.

2. **Add a `BgSpriteKeys.<NewBg>`** entry + a row in `GAME_BG_MAP` (`src/core/spriteKeys.ts`). Ship the bg asset under `public/assets/sprites/bg/` via `pnpm sprite:process --kind bg --name <new-bg-name>`.

3. **Add `MusicKeys.<NewMusic>`** + a row in `GAME_MUSIC_MAP` (`src/core/audioKeys.ts`). Ship the music asset under `public/assets/audio/music/` via `pnpm audio:encode --kind music --no-trim` (loops should be `--no-trim`).

4. **Add `MidgroundKeys.<NewMidground>`** + a row in `GAME_MIDGROUND_MAP` (`src/core/audioKeys.ts`). Ship the midground asset.

5. **Add a row to `audioScopeFor`** (`src/core/audioKeys.ts`) for the new music + midground keys → `'game:<id>'`. Per-entry sprite-manifest entries should also tag `scope: 'game:<id>'`.

6. **Add `SceneKeys.<NewScene>`** (`src/core/sceneKeys.ts`) for the new game scene.

7. **Create the new game scene** under `src/game/scenes/`. Mandatory shape:
   ```ts
   export class NewScene extends Phaser.Scene implements GameSceneContract {
     static readonly key = SceneKeys.<NewScene>;
     private readonly gameId = '<id>' as const;
     private lifecycle!: GameSceneLifecycle;
     // ... scene-specific fields (wave/hit/input systems)

     create(): void {
       // ... set up subsystems
       this.lifecycle = new GameSceneLifecycle({
         scene: this, gameId: this.gameId, mathId, speed, roundController,
       });
       this.lifecycle.enter();
       // ... start round
       this.events.once('shutdown', () => this.cleanup());
     }

     private cleanup(): void {
       // ... subsystem teardown
       this.lifecycle.exit();
     }

     pause(): void { /* subsystem pause */ this.lifecycle.pause(); }
     resume(): void { /* subsystem resume */ this.lifecycle.resume(); }
     quitToMenu(): void { this.lifecycle.quitToMenu(); }
     private endRound(): void { this.lifecycle.endRound(); }
   }
   ```

8. **Register the scene** in `src/app/boot.ts` `scene: [...]` array. Order matters (render order = registration order); put it adjacent to other game scenes.

9. **Update `DifficultyScene`** scene-key route — the inline switch where `gameId === 'asteroid-field'` returns `SceneKeys.AsteroidField` gets a `<id>` arm.

10. **Update `LoadingScene` caption** switch — same one-line addition.

11. **Add a "Game Select" tile** in `GameSelectScene.ts` that calls `Settings.setGameId('<id>')` + transitions to `SceneKeys.Difficulty`.

12. **(Optional)** If the new game has its own `Settings` toggle (image asteroids style), add it via `createObservable<T>` (`src/services/observable.ts`) — don't hand-roll the listener Set + try/catch pattern.

If you forget step 1, you can't compile any of the others. If you forget steps 2/3/4/5, TypeScript flags the missing rows. If you forget steps 6-11, the game won't START — DifficultyScene's switch will fall through to a stale case.

## References

- `src/services/Settings.ts` — `GameId` union, `setGameId`, observable subscriptions
- `src/services/observable.ts` — `createObservable<T>` primitive (sprint 2.1.9)
- `src/game/services/GameSceneLifecycle.ts` — game-mode-agnostic scene lifecycle
- `src/game/services/assetLoader.ts` — `loadGameBundle(scene, gameId)` scope filter
- `src/core/assetScope.ts` — `AssetScope` taxonomy (sprint 2.1.6)
- `src/game/scenes/LoadingScene.ts` — intermediate load scene (sprint 2.1.8)
