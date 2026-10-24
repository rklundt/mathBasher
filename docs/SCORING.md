# Scoring

Reference doc for mathBasher's scoring model — formula, multipliers, max-score grid, star ladders. This file **describes**; it does not define. The authoritative sources are `src/core/config.ts` (the `config.scoring` block) and `src/services/ScoreCalculator.ts` (per-question recording + star derivation). Per the project's "keep SCORING.md in sync" rule, this file must be updated in the same commit that changes any of those sources.

---

## Formula

Each correct answer earns:

```
score per correct = basePerCorrect
                  × mathDifficulty[mathId]
                  × speed[speedKey].multiplier
                  × (afterWrongShotMultiplier if you've taken a wrong shot this round, else 1.0)
```

| Knob | Value | Source |
|---|---|---|
| `basePerCorrect` | 100 | `config.scoring.basePerCorrect` |
| `afterWrongShotMultiplier` | 0.5 | `config.scoring.afterWrongShotMultiplier` |

A wrong shot in a round halves every *future* correct answer's score until the round ends (it does NOT retroactively halve correct answers from earlier in the round). The kid's total is the simple sum of per-correct-answer scores.

## Speed bonus (sprint 2.11)

A right answer keeps its points; a quick one earns extra on top, by the share of the question's time used when it lands (`config.scoring.speedBonus`):

| Time used | Popup | Extra |
|---|---|---:|
| first 15% (free thinking time) | ⚡⚡⚡ + a random cheer | +50% |
| up to 30% | ⚡⚡ | +30% |
| up to 45% | ⚡ | +10% |
| after that | — | nothing |

- After a miss it's a share of the halved points, timed from when the question restarts (games that don't restart it, like Alien Shoot, keep the original time).
- Timed from when the answers can be tapped. Alien Shoot: how far the alien has fallen; Asteroid Field: its countdown (a wrong shot's lost seconds count); Space Escape: each floor's share of the round timer (the per-question time), restarted after a wrong pick's fall; the others: their question clock (Math-a-lotl from the first bubble in view, Penguin Slide from when taps open).
- Not part of the round-end bonuses: Finish and Perfect stay 3 answers' worth; Perfect Round doesn't need speed.
- Game Over shows the round's total as "⚡ Speed Bonus! +N", first in the bonus row.
- "Up to N points!" assumes every answer is ⚡⚡⚡: Add to 10 · Easy 1,200 × 1.5 + 300 + 300 = 2,400.

## Round-end bonuses (sprint 2.10)

- **Finish Bonus!** — the round reached its end (the last question, the top, the far bank, the last row or carrot), whatever the stars. Running out of lives or time, or leaving, doesn't earn it. Worth `finishBonusAnswers` (3) right answers: `3 × 100 × challenge × difficulty`, rounded to whole points.
- **Perfect Round!** — reached the end with every question right on the first try (no wrong pick, no time-out, no life lost). Worth `perfectBonusAnswers` (3) more, on top of the Finish Bonus.
- Never halved by a wrong shot. Both are part of the round's score: Game Over, the high score, My Scores and "This visit" all include them, and so does "Up to N points!" (the perfect round with both).

| Add to 10 | Easy | Medium | Hard |
|---|---:|---:|---:|
| Finish Bonus | +300 | +375 | +450 |
| Perfect Round | +300 | +375 | +450 |
| Up to (12 right at ⚡⚡⚡ + both, sprint 2.11) | 2,400 | 3,000 | 3,600 |

## Round length

**12 questions per round** for every game mode (`config.round.questionsPerRound`). Number Climb's 12 floors = 12 questions; the arcade modes' rounds = 12 questions. Calibrated across modes by sprint 2.2.1 story 10.

## Per-math-type multipliers

Source: `config.scoring.mathDifficulty`. Ladder: addition baseline 1.0; +0.5 per operation step; +0.5 per range step.

| Math type | Multiplier | Notes |
|---|---|---|
| `add-to-10` | 1.0 | baseline |
| `add-to-20` | 1.5 | +0.5 range step |
| `sub-to-10` | 1.5 | +0.5 operation step |
| `sub-to-20` | 2.0 | +0.5 range step |
| `mult-to-100` | 2.5 | +0.5 operation step |
| `mult-to-144` | 3.0 | +0.5 range step |
| `div-to-100` | 3.5 | +0.5 operation step |
| `div-to-144` | 4.0 | +0.5 range step |
| `mixed` | 2.5 | representative average across the 8 integer types (sprint 1.5) |
| `add-fractions` | 4.0 | sprint 2.4 — peer of `div-to-144`; grade 4/5 territory |
| `subtract-fractions` | 4.5 | sprint 2.4 — top of the ladder; +0.5 over add (non-negative-result + borrow logic) |

## Per-difficulty (Speed) multipliers

Source: `config.scoring.speed[*].multiplier`.

| Difficulty | `SpeedKey` | Multiplier |
|---|---|---|
| Easy | `slow` | 1.0 |
| Medium | `medium` | 1.25 |
| Hard | `fast` | 1.5 |

(`SpeedKey` is the internal name; the player-facing labels differ per game mode — Climb uses Easy/Medium/Hard, the arcade modes use Slow/Medium/Fast.)

## Max score per (math type × difficulty)

**Cross-game parity:** scoring has no game-mode axis. A perfect 12-question round of `(mathId, speedKey)` produces the same max score regardless of which game mode was played (Alien Shoot, Asteroid Field, Number Climb, Math-a-lotl, Frog Splash, Space Shooter). Locked by `ScoreCalculator.test.ts` parity tests (sprint 2.2.1 story 11, sprint 2.4 story 7).

Formula: `max = 12 × 100 × mathMult × speedMult = 1200 × mathMult × speedMult`. Assumes a clean round (no wrong shot taken). These are the answers only; since sprint 2.10 a perfect round also earns both round-end bonuses (`+ 2 × 300 × mathMult × speedMult`), which "Up to N points!" includes.

| Math type | Easy (×1.0) | Medium (×1.25) | Hard (×1.5) |
|---|---:|---:|---:|
| `add-to-10` (×1.0) | 1,200 | 1,500 | 1,800 |
| `add-to-20` (×1.5) | 1,800 | 2,250 | 2,700 |
| `sub-to-10` (×1.5) | 1,800 | 2,250 | 2,700 |
| `sub-to-20` (×2.0) | 2,400 | 3,000 | 3,600 |
| `mult-to-100` (×2.5) | 3,000 | 3,750 | 4,500 |
| `mult-to-144` (×3.0) | 3,600 | 4,500 | 5,400 |
| `div-to-100` (×3.5) | 4,200 | 5,250 | 6,300 |
| `div-to-144` (×4.0) | 4,800 | 6,000 | 7,200 |
| `mixed` (×2.5) | 3,000 | 3,750 | 4,500 |
| `add-fractions` (×4.0) | 4,800 | 6,000 | 7,200 |
| `subtract-fractions` (×4.5) | 5,400 | 6,750 | 8,100 |

## Star ladders

Stars are awarded at round end. The two game families use different ladders.

### Arcade modes (Alien Shoot, Asteroid Field, Math-a-lotl, Space Shooter) — by correct count

Source: `config.round.starThresholds` (currently `[8, 10, 11]`).

| Correct out of 12 | Stars |
|---|---|
| 0–7 | 0 |
| 8–9 | 1 ★ |
| 10 | 2 ★★ |
| 11–12 | 3 ★★★ |

### Number Climb (ships as "Space Escape!"), Frog Splash, Penguin Slide and Bunny Garden — by floor / row / question reached

Frog Splash uses the same ladder with rows crossed in place of floors (`computeClimbStars(rowsCrossed, 12)`); reaching the far bank is 12 of 12. Penguin Slide uses it with questions answered (`computeClimbStars(answeredCount, 12)`): a wrong fish or a time-out retries the same question, so the count only grows on a right answer, and running out of lives ends the slide early. Bunny Garden counts the same way (carrots in the basket, `computeClimbStars(answeredCount, 12)`).

Source: `computeClimbStars(floorReached, totalFloors)` in `src/services/ScoreCalculator.ts`. Thresholds derive from `totalFloors` via `floor(totalFloors × 0.4 / 0.7 / 1.0)`, so a future round-size change auto-scales.

| Floor reached (out of 12) | Stars |
|---|---|
| 0–3 | 0 |
| 4–7 | 1 ★ |
| 8–11 | 2 ★★ |
| 12 | 3 ★★★ |

(Climb's rating is **height-based**, not correct-count-based — a kid who reaches the top with the maximum allowed wrong picks still earns ★★★.)

## Where points go (sprint 2.9.2)

Each round's points are counted once, by `GameSceneLifecycle`:
- **Game Over** (out of lives included): a finished round.
- **Leaving mid-round** (Quit to Menu, Change Game, Change Challenge): the points so far, as a round that ended early. A round left before the first answer isn't counted.

They go to the top bar's "This visit" total (`SessionTotalScore`, this page load) and to **My Scores** (`src/services/MyScores.ts`, saved in the browser by local day and challenge; days older than 90 fold into one total). Game Over's "New High Score!" badge still looks at finished rounds only.

## Where to edit

| Want to change… | Edit |
|---|---|
| Per-math-type multipliers | `src/core/config.ts` → `config.scoring.mathDifficulty` |
| Per-difficulty multiplier | `src/core/config.ts` → `config.scoring.speed[*].multiplier` |
| Base per-correct points | `src/core/config.ts` → `config.scoring.basePerCorrect` |
| Wrong-shot penalty | `src/core/config.ts` → `config.scoring.afterWrongShotMultiplier` |
| Round length | `src/core/config.ts` → `config.round.questionsPerRound` (NumberClimb overrides via RoundController constructor — currently matches the global 12) |
| Arcade star ladder | `src/core/config.ts` → `config.round.starThresholds` |
| Climb star ladder | `src/services/ScoreCalculator.ts` → `computeClimbStars` |
| Round-end bonuses | `src/core/config.ts` → `config.scoring.finishBonusAnswers` / `perfectBonusAnswers` |
| Speed bonus tiers | `src/core/config.ts` → `config.scoring.speedBonus`; cheers in `src/game/ui/speedPhrases.ts` |

**After any edit above, update this file in the same commit.** A stale entry here is a documentation bug — keep the table truthful.

## Change log

- **Sprint 2.11** — Speed bonus (+50 / +30 / +10% within 15 / 30 / 45 % of the time; first tried at 25 / 50 / 75 %, which made ⚡⚡⚡ too easy); "Up to N points!" assumes every answer is ⚡⚡⚡.
- **Sprint 2.10** — Finish Bonus and Perfect Round (3 right answers' worth each); "Up to N points!" includes them.
- **Sprint 2.9.2** — "Where points go": unfinished rounds now count their points (This visit, My Scores). Scoring itself unchanged.
- **Sprint 2.4 (story 8)** — file created. Added `add-fractions` (4.0) and `subtract-fractions` (4.5) entries; max-score grid extended. Multiplier ladder for the integer types unchanged.
