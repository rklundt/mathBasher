# Sprints

Every meaningful unit of work in mathBasher is captured as a sprint file in this folder. Sprints are the contract between intent and implementation.

## Folder structure

- `/foundation/` — prerequisite work: scaffold, math engine, score store, scenes, gameplay core, mobile, art polish. These deliver the playable MVP.
- `/phase-1/` — additional math types beyond Add-to-10 (added after foundation closes).
- `/phase-2/` — additional game modes beyond Alien Shoot (added later).
- `/phase-3/` — backend integration: persisted high scores, accounts.

`SPRINT-PLAN.md` in this folder is the catalog of all sprints with one-line status.

## Sprint file structure

Every sprint file follows the same shape:

1. **Header table:** sprint id, phase, status, blocks, estimated effort
2. **Summary:** one paragraph, what the sprint delivers
3. **Stories:** discrete units of work, each with type, output, acceptance criteria
4. **Definition of done:** checklist of what "complete" means
5. **Notes for Claude Code:** standard guidance + sprint-specific gotchas

## How to execute a sprint

1. Read the sprint file from start to finish
2. Run `/start-sprint <sprint-id>` in Claude Code to re-ground context and confirm readiness
3. Create the sprint branch: `git checkout -b sprint/<id>-<short-title>` (e.g. `sprint/0.1-scaffold`)
4. Work through stories in order; respect blocks. Commit per-story with messages like `0.1 story 4: central config file`.
5. When a story requires human input (asset choice, gameplay tuning, sign-off), pause and ask
6. Run `/wrap-sprint <sprint-id>` to produce a wrap-up review with a fix plan and test list (also runs the six-reviewer audit: InfoSec, Architect, Senior Dev, Support, DevOps, Legal — spawned in parallel)
7. Iterate until APPROVED
8. Get human sign-off
9. Open a PR from `sprint/<id>-...` to `main`; merge after review
10. Run `/close-sprint <sprint-id>` to update `SPRINT-PLAN.md` and the sprint file's status

## How to create a new sprint

1. Mirror an existing sprint file's structure
2. Be explicit about acceptance criteria (testable, not "looks good")
3. Be explicit about blocks (what must finish before this can start)
4. Add the new sprint to `SPRINT-PLAN.md` with status "Planned"

## Story types

| Type | Description | Output |
| --- | --- | --- |
| Claude Code preparation | Re-grounding, reading context | Confirmation |
| Code | Implementation | TypeScript file(s) |
| Code/data definition | Configuration, schemas | TypeScript or JSON file |
| Asset | Adding free CC0 assets to `/public/assets/` | File(s) committed |
| Test | Vitest specs or manual playtest plan | Test file or test list |
| Human input | Requires the human to do/decide something | Decision recorded in sprint |
| Human review | Human sign-off | Explicit approval |

## When stories block other stories

The sprint file says explicitly. Common patterns within foundation:

- **0.1 Scaffold** blocks everything else (no project to build into)
- **0.2 Math engine** blocks 0.5 Gameplay core (no questions to ask)
- **0.3 Score store** blocks 0.5 Gameplay core (nowhere to put the round result)
- **0.4 Scene flow** blocks 0.5 Gameplay core (no scenes to render gameplay in)
- **0.5 Gameplay core** blocks 0.6 Mobile (nothing playable to test mobile against)
- **0.6 Mobile** blocks 0.7 Art polish (we want to art-polish what mobile actually shows)

## Sprint status

Statuses tracked in `SPRINT-PLAN.md`:

- **Planned** — file exists, work not started
- **In Progress** — actively being worked
- **Built** — code complete, awaiting review
- **Reviewed** — wrap-up review approved
- **Closed** — human signed off, sprint complete

`/close-sprint` updates this automatically.

## What if a sprint is wrong?

If a sprint specification turns out to be incorrect (gameplay assumption was wrong, an interface design doesn't fit, an acceptance criterion is impossible):

1. Don't silently change scope mid-build
2. Pause and surface the issue to the human
3. Update the sprint file with the correction and a brief note explaining the change
4. Continue

## What if requirements change mid-sprint?

If the human asks for a change that affects an in-flight sprint:

1. Note the change
2. Decide together whether it's a sprint amendment (update this sprint file) or a follow-up sprint (open a new file)
3. Don't carry the change implicitly. Document it.

## Standards

- Use hyphens, not em-dashes, in sprint files
- Acceptance criteria must be testable. "Looks good" is not acceptance.
- Sprint files are specifications, not essays. Be terse.
- Every code-producing story names the file(s) it creates or modifies.
