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
| Midground loop(s) | `GAME_MIDGROUND_MAP: Record<GameId, readonly MidgroundKey[]>` (a list since sprint 2.5.4 — layered loops) | `src/core/audioKeys.ts` | Same as music |
| Space-only background layers | `GAME_BG_SPACE_LAYERS: Record<GameId, { stars; bottomFade }>` (sprint 2.5.4) | `src/core/spriteKeys.ts` | `BackgroundScene.applySpaceLayers` (reactive, same observer as the bg image) |
| Asset bundle scope | per-entry `scope: 'game:<gameId>'` field on each `SpriteManifestEntry` / `AudioManifestEntry` | `src/core/spriteKeys.ts`, `src/core/audioKeys.ts` | `loadGameBundle(scene, gameId)` filters by scope predicate |
| Audio scope dispatch | `audioScopeFor(key): AssetScope` | `src/core/audioKeys.ts` | `AUDIO_MANIFEST` builder calls per key |
| Scene-key route | `gameSceneKeyFor(gameId)` — exhaustive switch, a missing arm is a compile error (since sprint 2.2) | `src/core/sceneKeys.ts` | `DifficultyScene` (via `LoadingScene`) and `GameOverScene` (Play Again) |
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

- `GameId` union grows linearly with new game modes. Each addition is a 1-line edit in `core/gameIds.ts` (sprint 2.9.1; it was in `Settings.ts`) followed by however many compile errors TypeScript flags (which IS the checklist for what else to update).

## Checklist — adding a new game mode

When sprint 2.X adds game mode `<id>`:

1. **Extend `GameId` union** in `src/core/gameIds.ts` (sprint 2.9.1; `Settings` re-exports it):
   ```ts
   export type GameId = 'alien-shoot' | 'asteroid-field' | '<id>';
   ```
   TypeScript will now flag every `Record<GameId, X>` missing a row for `<id>` AND every `gameId === '<old>' ? A : B` switch.

2. **Add a `BgSpriteKeys.<NewBg>`** entry + a row in `GAME_BG_MAP` (`src/core/spriteKeys.ts`). Ship the bg asset under `public/assets/sprites/bg/` via `pnpm sprite:process --kind bg --name <new-bg-name>`. This is the backdrop behind Difficulty, Loading and Game Over: if the game's own scenery is bright, ship a darkened copy here and a game-scoped key for the bright one (Penguin Slide's `PenguinSlideSceneryKeys.Hill`, sprint 2.7). Add every new key type to the `SpriteKey` union.

3. **Add `MusicKeys.<NewMusic>`** + a row in `GAME_MUSIC_MAP` (`src/core/audioKeys.ts`). Ship the music asset under `public/assets/audio/music/` via `pnpm audio:encode --kind music --no-trim` (loops should be `--no-trim`).

4. **Add `MidgroundKeys.<NewMidground>`** + a row in `GAME_MIDGROUND_MAP` (`src/core/audioKeys.ts`). Ship the midground asset. (Since sprint 2.5.4 the row is a *list* of keys, so a game can layer several ambience loops; most games list one.)

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
     // Lock the scene first: `scene.start(GameOver)` is queued, so this
     // scene still gets one more update() — nothing may tick or time out
     // (sprint 2.5.5: a last-question timeout fired twice without this).
     private endRound(): void { this.roundOver = true; this.lifecycle.endRound(); }
   }
   ```

   **Time limits: one shared base, scaled for the math** (sprints 2.5.7, 2.6.1): a timed mode reads its per-question countdown from `questionSeconds(speed, mathId)` (or, for a whole-round timer, `roundSeconds(speed, mathId, questions)`) in `src/core/config.ts` — the shared `config.round.baseQuestionSec` (25 / 18 / 12 s) stretched by `round.mathTimeScale`. Don't give a new mode its own countdown table unless its time limit genuinely isn't a clock (Alien Shoot's limit is how fast the aliens fall: it keeps its own speeds and divides them by `mathTimeScale(mathId)`). The mode's `speedDisplayFor` arm in `DifficultyScene` takes `mathId` and shows the same seconds.

8. **Register the scene** in `src/app/boot.ts` `scene: [...]` array. Order matters (render order = registration order); put it adjacent to other game scenes.

9. **Add a `gameSceneKeyFor` arm** (`src/core/sceneKeys.ts`) returning the new scene key. It's an exhaustive switch, so step 1 already makes a missing arm a compile error; DifficultyScene and GameOverScene's Play Again both route through it.
   Also add a row to `GAME_BG_SPACE_LAYERS` (`src/core/spriteKeys.ts`) — whether BackgroundScene's parallax stars and bottom darkening band show over the new backdrop (TypeScript flags a missing row).

10. **Update `LoadingScene` caption** switch — same one-line addition. In `DifficultyScene`, add the game's arm to `speedDisplayFor` and to `speedSectionTitleFor` (both exhaustive switches since sprint 2.7).

11. **Add a "Game Select" tile** in `GameSelectScene.ts` that calls `Settings.setGameId('<id>')` + transitions to `SceneKeys.Difficulty`.

11b. **Add the game to `questionsPerRoundFor`** (`src/services/challengePoints.ts`, an exhaustive switch, sprint 2.9): Difficulty's "Up to N points!" uses its round length. Add its name to `gameDisplayName` in `DifficultyScene` (the "<Game>: how tough?" heading).

11c. **Round end (sprint 2.10):** advance the question index only when a question is answered (so `RoundController.isRoundOver` means "reached the end" and earns the Finish Bonus); mark a miss or time-out before the right answer as `usedWrongShot` (Perfect Round); implement `isRoundEnding()` from `this.lifecycle.isRoundEnding`; and call `this.lifecycle.beginRoundEnd()` wherever the round ends after a delay that isn't the last answer ("Out of lives!", a fall).

11d. **Speed bonus (sprint 2.11):** pass `timeUsed` (the share of the question's time used, 0–1) with the right answer's `recordOutcome`, timed from when the answers can be tapped (a `QuestionClock`: `markOpen()` if taps open after `start`, read `fractionUsed` after `stop()`), and put the returned `speedTier` in the `correctHit` event so the popup shows ⚡.

11e. **Own progress display (sprint 2.12, optional):** a game that draws its own progress (Balance Scale's path) implements `drawsOwnProgress()` returning true; HudScene then hides its progress dots and "Q: n/12". With ten or more games, Game Select's grid (`config.layout.challengeFlow.gameSelect.grid`) needs a fourth row or a new layout.

12. **Add the game's config block** to the lists in `src/core/mathTimeScale.test.ts` and `src/math/extendChoices.test.ts` (time scaling, and how many answers a row needs). Draw answer labels with `MathText` (`src/game/ui/MathText.ts`), so mixed numbers read clearly (sprint 2.7).

13. **(Optional)** If the new game has its own `Settings` toggle (image asteroids style), add it via `createObservable<T>` (`src/services/observable.ts`) — don't hand-roll the listener Set + try/catch pattern.

If you forget step 1, you can't compile any of the others. If you forget steps 2/3/4/5, TypeScript flags the missing rows. If you forget steps 6-8, 10 or 11, the game won't START or can't be picked (no scene registered, no caption, no tile); step 9 is compiler-enforced.

## References

- `src/services/Settings.ts` — `GameId` union, `setGameId`, observable subscriptions
- `src/services/observable.ts` — `createObservable<T>` primitive (sprint 2.1.9)
- `src/game/services/GameSceneLifecycle.ts` — game-mode-agnostic scene lifecycle
- `src/game/services/assetLoader.ts` — `loadGameBundle(scene, gameId)` scope filter
- `src/core/assetScope.ts` — `AssetScope` taxonomy (sprint 2.1.6)
- `src/game/scenes/LoadingScene.ts` — intermediate load scene (sprint 2.1.8)
