# src/CLAUDE.md

Source conventions for `src/`. **See also:** [Root CLAUDE.md](../CLAUDE.md) for
the repository overview and the action interface.

## Overview

Built on `@effected/github-actions` (the runner) and `@effected/github` (the
GitHub API). The layout follows the kit's canonical action shape: a guarded entry
point, a `program.ts` that is pure composition, one module per pipeline step
under `steps/`, the input/output contracts as data under `schema/`, and exactly
one rendering surface in `format.ts`.

**Start at [`../okf/index.md`](../okf/index.md).** For the seams this module leans on, read [`kit-seams`](../okf/conventions/kit-seams.md), [`action-yml-single-source`](../okf/conventions/action-yml-single-source.md), and [`step-module-shape`](../okf/conventions/step-module-shape.md); for the failure model, [`failure-postures-per-step`](../okf/decisions/failure-postures-per-step.md), [`narrow-degradation-predicate`](../okf/decisions/narrow-degradation-predicate.md), and [`bounded-retry-on-release-prefixed-pushes`](../okf/decisions/bounded-retry-on-release-prefixed-pushes.md); for known traps, the [gotchas index](../okf/gotchas/index.md).

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

See [`kit-seams`](../okf/conventions/kit-seams.md) (input reads, per-call `Repo`
resolution, the single emitter) and
[`action-yml-single-source`](../okf/conventions/action-yml-single-source.md)
(the 4-input/10-output parity contract). The hyphen-preserving mangling is
[`input-mangling-preserves-hyphens`](../okf/gotchas/input-mangling-preserves-hyphens.md).

## Step conventions

See [`step-module-shape`](../okf/conventions/step-module-shape.md) for the
result-type/tagged-error/requirement-channel/TSDoc shape every step follows,
and [`failure-postures-per-step`](../okf/decisions/failure-postures-per-step.md)
and [`narrow-degradation-predicate`](../okf/decisions/narrow-degradation-predicate.md)
for each step's posture.

## Logging

See [`step-module-shape`](../okf/conventions/step-module-shape.md) for the
`group` + `withStep` wrapping and why it replaced `withBuffer`, and
[`withstep-invisible-through-double`](../okf/gotchas/withstep-invisible-through-double.md)
for why the test double can't tell the two apart.

## Code style

Enforced by Biome; violations fail CI. Tabs, 120 columns, `.js` extensions on
every relative import, `node:` protocol for built-ins, separate `import type`,
explicit return types on exports.

## The release-detection retry

See [`bounded-retry-on-release-prefixed-pushes`](../okf/decisions/bounded-retry-on-release-prefixed-pushes.md)
for the retry gate and the `ReleasePRNotVisibleYet` sentinel, and
[`retry-count-does-not-pin-interval`](../okf/gotchas/retry-count-does-not-pin-interval.md)
for why a call-count assertion alone doesn't pin the ten-second spacing.
