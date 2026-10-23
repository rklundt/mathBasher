# ADR-0014: Subjects, challenge types, and the challenge-first flow

**Status:** Accepted (2026-10-22, sprint 2.9)
**Builds on:** [ADR-0006](ADR-0006-folder-discipline.md) (folder rules), [ADR-0011](ADR-0011-per-game-mode-dispatch.md) (per-game dispatch)

## Context

mathBasher started as math only: the player picked a game, then a "math type" (Add to 10, Subtract Fractions…) and a difficulty on one screen. The owner's direction (2026-10-19) is to grow beyond math as **one umbrella app**, with subjects such as words or memory alongside math. One app, not cloned repositories or a family of sites, because fixes then land once and the app can one day be wrapped for the app stores as a single listing.

Two things had to change for that:
- **The order of choices.** What a child practises is usually set once (often by a parent or teacher); the game is the fun part they hop between. Picking the math type on every game's Difficulty screen made that awkward, and it wouldn't scale to several subjects.
- **The vocabulary in the code.** "Math type" was baked into the round settings, so a second subject would have meant renaming under pressure.

## Decision

1. **The flow is Subject → Challenge type → Game → Difficulty** (sprint 2.9.0).
   - "Challenge type" (or just "challenge") is the kid-facing word for what was the math type; "topic" was too bland.
   - **"Pick your challenge!"** (`ChallengePickerScene`) shows one tab per subject and that subject's challenges, each with its points ("1.5x Points!"). It opens on the first Start of a visit (no challenge yet; a reload resets it) and from the challenge chip, Game Over and, as a card inside it, Pause.
   - Game Select and each game's Difficulty show the challenge as a chip ("Challenge: Add to 10 🔄") that opens the picker and comes back.
   - **Difficulty stays per game**, so every game keeps its own labels ("3 holes · 25s"). It shows "Up to N points!", computed by `maxRoundScore` from `config.scoring` with each game's round length (`questionsPerRoundFor`); a test locks it to what `ScoreCalculator` pays.
   - The picker is its own scene, started with `scene.start`, never laid over another scene (their Esc and key handlers would stack). Each opening passes where a pick goes and where Back goes. The pause card is the exception: it shows the same buttons inside itself, so Back keeps the paused round, and only a different challenge ends it (unscored, the same path as Change Game).
2. **Subjects and challenges in code** (sprint 2.9.1).
   - `core/subjects.ts`: `SubjectId` (today only `'math'`), `ChallengeId` (today `= MathId`), and `SUBJECTS`, which lists each subject's challenges in picker order. Nothing else lives there: a challenge's label stays with its question generator and its points with `config.scoring`, so nothing is copied.
   - `Settings.round.challengeId` and `Settings.setChallenge` replace `mathId` / `setMathId`. Game scenes read `challengeId` and hand it to the math code as a `MathId`, which is what it is today.
   - **Kept stable:** the `mathId` telemetry property (cross-version queries; the values didn't change), the scoring and timing tables (keyed by challenge), and the persisted settings keys.
   - `GameId` moved to `core/gameIds.ts` (`Settings` re-exports it), which removed one of ADR-0006's two known exceptions.

## Consequences

- **Adding a challenge to Math** is unchanged: a generator, a scoring row and a timing row; the subjects list picks it up from the scoring table.
- **Adding a subject** means: widen `SubjectId` and `ChallengeId`; add its entry to `SUBJECTS`; give its challenges question generators, scoring rows and timing rows; decide which games can show its answers (word answers need a fit check in every game's answer carrier). The picker grows a tab on its own. The pause card shows the current challenge's subject; it would need a tab row too.
- **Deliberately not built yet** (no caller until a second subject exists): per-game "answer kinds", a word-label fit check, a subject tab row in the pause card.
- **The name "mathBasher" stays for now** (owner, 2026-10-22). A second subject will need an umbrella name; that's the owner's call when it comes.
- **App-store packaging waits** (owner, 2026-10-22). When it comes, it pulls kids-store and COPPA work forward from Phase 4.
