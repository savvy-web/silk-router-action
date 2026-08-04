# src/CLAUDE.md

Source conventions for `src/`. **See also:** [Root CLAUDE.md](../CLAUDE.md) for
the repository overview and the action interface.

## Overview

Built on `@effected/github-actions` (the runner) and `@effected/github` (the
GitHub API). The layout follows the kit's canonical action shape: a guarded entry
point, a `program.ts` that is pure composition, one module per pipeline step
under `steps/`, the input/output contracts as data under `schema/`, and exactly
one rendering surface in `format.ts`.

**Design documentation:**

- Architecture and layer wiring → `@../.claude/design/silk-router-action/architecture.md`
- Phase detection algorithm → `@../.claude/design/silk-router-action/phase-detection.md`
- Error model → `@../.claude/design/silk-router-action/error-model.md`

All three were rewritten for the ported structure.

## Layout

- **`main.ts`** — the entry point, and nothing else: a program import plus one
  call guarded on `process.env.GITHUB_ACTIONS`. The guard is what keeps the
  module importable, and therefore testable, without running the action as an
  import side effect.
- **`program.ts`** — pure composition. Reads inputs, runs the steps in order,
  folds their results into the output contract, reports. No I/O of its own, no
  formatting, no step bodies.
- **`layers/app.ts`** — the only services the runtime does not already provide:
  `GitHubClient`, `Repo`, `PullRequest`. Deliberately small — anything in
  `ActionServices` must not appear here.
- **`schema/domain.ts`** — `WorkflowPhase`, `BumpType`, `ChangesetRelease`,
  `ParsedChangeset`, `PhaseDetectionResult`.
- **`schema/inputs.ts`** — `INPUT_NAMES` (4), `INPUT_DEFAULTS`, and a
  decoded-once `readInputs`.
- **`schema/outputs.ts`** — `OUTPUT_NAMES` (10), `DISABLED_OUTPUTS`,
  `foldOutputs`, and the single `emitOutputs` emitter.
- **`steps/detect-phase.ts`** — which release phase this run is in. Queries the
  pull requests associated with the head commit, falls back to commit-message
  patterns, and absorbs GitHub's PR-association lag with a scheduled retry.
- **`steps/parse-changesets.ts`** — reads `.changeset/` through core's
  `FileSystem`; owns `ChangesetParseError`.
- **`steps/write-summary.ts`** — writes the job-summary panel.
- **`format.ts`** — the one rendering surface. Pure and service-free, so a test
  imports it without a layer.

`services/` and `shims/` are **conventions, not tracked directories**. This
action currently needs neither: a step used exactly once stays a step, and is
promoted to `services/` only when a second step needs the same capability.

## Non-negotiables

- **`action.yml` is the single source of input and output names and defaults.**
  The tuples in `schema/` mirror it; they never re-declare it. The three-way
  check is enforced by `__test__/unit/parity.test.ts` — **4 inputs, 10 outputs**.
- **Read inputs through `ActionInput`, never a bare `Config.*`.** The runner
  publishes `INPUT_<MANGLED>` names.
- **⚠️ The mangling preserves hyphens.** `release-branch` becomes
  `INPUT_RELEASE-BRANCH`, not `INPUT_RELEASE_BRANCH` — only *spaces* become
  underscores. A test seeding the underscore spelling proves nothing.
- **`Repo` is resolved per call**, never captured at layer construction —
  capturing it makes `Repo.provide` silently do nothing.
- **One emitter writes every output**, driven by iterating `OUTPUT_NAMES`.

## Step conventions

Each step module exports a result type, a tagged error **only when the step can
actually fail**, an explicitly annotated requirement channel, and the step
itself. Its failure posture is documented in its TSDoc:

| Step | Posture |
| --- | --- |
| `detectPhase` | degrade-to-warning — an API failure falls back to commit-message detection; `E = never`. **Only** the five `GitHubError` kinds meaning "the API could not answer" degrade; `decode` and `alreadyExists` fall through to `Effect.orDie` and surface as defects. Widening that predicate would make this row a lie. |
| `parseChangesets` | fail-the-job — `ChangesetParseError` propagates |
| `writeSummary` | fail-the-job as a defect — preserved from the pre-port `Effect.orDie` |

## Logging

`program.ts`'s local `step` helper wraps each step in
`logger.group(name, logger.withStep(name, effect))` — a collapsible block, a
buffer discarded on success, and one info line reporting the step happened.
Warnings and errors are never buffered, so a long step still reports trouble
while it runs.

That is the legacy `Step.groupStep` composition verbatim: `group` + `withStep`.
The port initially shipped `group` + `withBuffer`, which reproduced the block and
the buffering but dropped the per-step success line, because `ActionLogger` had
no summary emitter. `withStep` landed in `@effected/github-actions@0.5.0` and
closed the gap.

⚠️ **Nothing observable distinguishes `withStep` from `withBuffer` through the
test double** — every wrapper there is a pass-through, so a suite asserting only
outputs stays green either way. The regression is caught by asserting which
member each step routes through, in `__test__/integration/program.int.test.ts`.
Keep that test; it is the only thing standing between this and a silent revert.

## Code style

Enforced by Biome; violations fail CI. Tabs, 120 columns, `.js` extensions on
every relative import, `node:` protocol for built-ins, separate `import type`,
explicit return types on exports.

## The release-detection retry

`detect-phase` retries the PR-association lookup when the head commit message
starts with `release-prefix`, to absorb GitHub's propagation lag. **Three retries,
ten seconds apart; an empty prefix disables it entirely.**

Absence of the association is modelled as an internal tagged failure —
`ReleasePRNotVisibleYet` — purely so `Effect.retry` has something on the error
channel to act on, since retry cannot see an empty success. It is caught at the
boundary of the retry pipeline and **never** escapes: `detectPhase` keeps
`E = never`, and the tag is deliberately absent from the `GitHubError` degrade
predicate, where it would short-circuit the very retry it drives.

⚠️ The "ten seconds apart" half of that contract is easy to lose. A retry test
that advances a generous virtual budget and asserts only the call *count* passes
whatever the spacing is; `__test__/unit/steps/detect-phase.test.ts` has one case
that advances deliberately short and asserts progress, and that is the only thing
pinning the interval.
