# ADR-0015: The game-first screen flow

**Status:** Accepted (2026-10-30, sprint 2.15)
**Supersedes:** part 1 of [ADR-0014](ADR-0014-subjects-and-challenge-first-flow.md) (the challenge-first order). Its part 2 (subjects and challenges in code) stands.
**Builds on:** [ADR-0006](ADR-0006-folder-discipline.md) (folder rules), [ADR-0011](ADR-0011-per-game-mode-dispatch.md) (per-game dispatch)

## Context

ADR-0014 put the challenge first: Subject → Challenge type → Game → Difficulty, on the idea that what a child practises is set once and the game is what they hop between. Two sprints later, mathBasher had puzzles alongside math, two groups of math games, and a main menu whose Start went to a different place depending on the last pick. The owner (2026-10-29) asked for the screens to be rebuilt around **what kind of thing you want to play**, and for the math type to be picked per game again, after the game: "We are reverting to the previous screen flow." The end and pause screens should go back to the games, the game's setup or Settings: "I'm not sure we have any reason to ever go back to the main menu." The owner approved wireframes of every screen on 2026-10-30.

## Decision

1. **The flow:** Title Screen → Game Chooser (subject › group › games) → the game's setup → Loading → the game.
   - **Title Screen** (`TitleScene`): the name, a line, Play and Settings, the title art and mute. It replaced the main menu; only Back from the chooser's first step returns to it.
   - **Game Chooser** (`GameChooserScene`): one scene that redraws per step: subjects (Math, Puzzles, a "More Coming Soon" tile), a subject's groups (Math: mathBasher and Math Fun), then the games. A top bar (Back, the step's title, My Scores, Settings, mute) and a "where you are" trail of chips (each goes back to its step) sit on every step. **A step with one choice is skipped**: Puzzles has no groups, so it opens its games. The step rules are plain functions in `core/chooserSteps.ts`, tested without Phaser.
   - **Setup screens**, one per kind of game, sharing the chooser's top bar and trail (`ui/setupFrame.ts`): math (`MathSetupScene`: the math type with its points, the game's own three levels with "Up to N points!"), the puzzle pack (`PuzzleSetupScene`) and Pair Pals (`PairPalsSetupScene`). Each shows the best for the current pick and a big Start. They replaced the challenge picker, Game Select and Difficulty, which are deleted.
   - **Back walks up one step** (setup › games › group › subject › Title Screen); Esc does what Back does.
2. **Pause and end of round never go to a main menu.** Pause: Resume, Change Game (the games list the game is on), the game's own Change button (its setup: "Change Math or Speed", "Change Difficulty", "Change Cards or Difficulty") and Settings. End of a round: Play Again, then the same three (`ui/roundEndButtons.ts`). A game leaves a round with `quitRound('games' | 'setup')`.
3. **Picks are remembered in the browser** (`services/RememberedPicks.ts`, one `localStorage` entry): the math type (shared by every math game), the speed per math game, the last game started (its tile says "Last Played"), and the chooser's subject and group. They're already selected next time, so Start is one tap. Before this sprint the math type and speed were in memory only. Puzzle levels and Pair Pals' picks keep their own memory.
4. **The avatar is paused** behind `config.features.avatar` (false): no first-visit hero picker, no avatar on the in-game top bar or the end screen. The code and a saved pick stay.
5. **A screen-name tag** ("DEV · GameChooserScene · math groups") sits in the corner of every menu screen when running locally or on the dev site (`VITE_SHOW_SCREEN_NAMES=true`, set by the deploy for the `development` branch only), so the owner can name screens while testing. A production build never shows it.

## Consequences

- **Adding a game** adds its tile words to `core/chooserTiles.ts` (a math game) or a line to `core/puzzles.ts` (a puzzle); the chooser and the trail pick it up. A math game also needs its level wording in `ui/mathSpeedLabels.ts`.
- **Adding a subject** adds a subject tile; `groupsOf` decides whether it has a group step. "More Coming Soon" stays until then.
- **The math type follows the child between games**, the speed doesn't: each game remembers its own, because the same word means different things in different games.
- **Telemetry:** the old scene keys (`menu`, `game-select`, `difficulty`, `challenge-picker`) are gone; the new ones are `title`, `game-chooser` and `math-setup`. `ChooserStep` and `GamePicked` record the chooser; `ChallengeChanged` keeps `mathId` with `source: 'setup'`.
- **High scores per game, type and speed are still for this visit only** (the session store), so the math setup says "Best this visit". My Scores (by subject and challenge) is saved, as before.
