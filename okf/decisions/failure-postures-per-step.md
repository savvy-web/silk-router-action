---
type: Decision
status: stable
title: Each step declares its failure posture at contract time
description: >-
  detectPhase degrades to a warning, parseChangesets fails the job through one
  typed error, and writeSummary fails the job as a defect; program.ts
  publishes the disabled output contract on any failure path before the
  original cause reaches the runner.
tags:
  - architecture
  - observability
  - ci
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: a95ecee9bc2b9935ac522a42b1dd5f71d4f06293aeef085c4b1711ba8be33772
sources:
  - id: detect-phase
    resource: ../../src/steps/detect-phase.ts
  - id: parse-changesets
    resource: ../../src/steps/parse-changesets.ts
  - id: write-summary
    resource: ../../src/steps/write-summary.ts
  - id: program
    resource: ../../src/program.ts
verified:
  - by: human:spencer
    at: 2026-09-13T20:11:55Z
---

# Each step declares its failure posture at contract time

## Context

`program.ts` composes three steps — `detectPhase`, `parseChangesets`,
`writeSummary` — and each one settles, in its own signature and TSDoc, what
happens when it cannot do its job. There is no shared error-handling
middleware and no per-resource error taxonomy; a step's error channel is
either `never` because failure is absorbed inside the step, or one narrow
tagged error that the step owns outright.

## Decision

Three postures, one per step, fixed at the type level:

| Step | Error channel | Posture |
| --- | --- | --- |
| `detectPhase`[^detect-phase] | `never` | **Degrade-to-warning.** A GitHub API failure logs a warning and falls back to commit-message detection; the run continues. `Effect.orDie` is used at two points (reading `env.github` and `env.payload`, lines 117–118) for conditions that mean the runtime contract itself is broken, not that the API failed to answer. |
| `parseChangesets`[^parse-changesets] | `ChangesetParseError` | **Fail-the-job.** An unreadable `.changeset` directory, or a file that vanishes between `readDirectory` and `readFileString`, propagates as the one declared error and the run goes red. A *missing* `.changeset` directory is not one of these shapes — `fs.exists` returning `false` produces the empty result (lines 161–164), never a failure. |
| `writeSummary`[^write-summary] | `never` (via `Effect.orDie`) | **Fail-the-job as a defect.** A summary-write failure is preserved as a defect rather than softened to a warning, matching the pre-port behaviour verbatim. |

Every step's TSDoc states its posture in prose (`@remarks`), not just in its
type signature, so a reader does not have to infer the contract from `E`.

On top of the three step postures, `program.ts`[^program] (lines 69–72) wraps
the whole composition in `Effect.onError(() => emitOutputs(DISABLED_OUTPUTS)
.pipe(Effect.ignore))`. Whatever step fails, and however it fails, the action
writes the all-disabled output contract before the original cause reaches
`Action.run`. `Effect.ignore` on that last-ditch write is deliberate: if
publishing the disabled contract itself fails, that failure must not replace
the real cause — the run still fails on the original error, not on a
write error from the recovery path.

## Alternatives rejected

- **A shared error type across all steps.** Collapsing `ChangesetParseError`
  and a hypothetical `detectPhase` error into one umbrella type would blur the
  distinction between "this step cannot fail" (`never`) and "this step can
  fail in one specific way" — the type signature is the posture, and a shared
  error type erases that.
- **Per-resource error classes** (e.g. separate errors for "directory
  unreadable" vs. "file vanished mid-read"). `ChangesetParseError` carries one
  shape with a `file`/`reason`/`cause` triple; the two reachable failure modes
  are distinguished by their `reason` string, not by a type hierarchy, because
  both share the same posture (fail-the-job) and nothing downstream branches
  on which one occurred.
- **An input-validation error type.** There is no dedicated error for a
  malformed input — decoding happens once in `readInputs`, and a decode
  failure is a `Config.ConfigError` surfaced through `program`'s own error
  channel, not a step-owned type.
- **Modelling a missing `.changeset` directory as a failure.** Rejected
  because it is the common, expected case (no pending release) rather than a
  broken condition — see `parseChangesets`'s emptyResult path.
- **Custom rendering per failure.** Failures are not translated into
  bespoke user-facing messages; `writeSummary` and the disabled-outputs
  publish both use the same rendering and emission surfaces (`format.ts`,
  `emitOutputs`) that a success path uses.
- **Publishing nothing on failure** (the pre-port behaviour). Rejected because
  this action exists solely to gate other workflows: a failed run that
  publishes no outputs leaves a consumer's `if: … should_continue == 'true'`
  reading an empty string rather than an explicit `"false"`.

## Consequences

- A step's signature alone tells a caller what to expect: `E = never` means
  "cannot fail, only degrade or defect"; a named tagged error means "can fail
  this one way." Widening `detectPhase`'s catch predicate, for example, would
  make the posture table in `src/CLAUDE.md` a lie rather than merely stale.
- `ChangesetParseError`'s reachability is a standing verification obligation:
  a test must construct **and fire** the error along a real code path (an
  unreadable directory, or a file removed between listing and reading) rather
  than merely asserting the schema decodes. A test that only constructs the
  error's shape without ever driving `parseChangesets` into that branch would
  leave the "fail-the-job" claim unverified.
- Consumers of this action can rely on `should_continue` and the other nine
  outputs always being present — either populated or explicitly disabled —
  because `Effect.onError` guarantees an emission on every path, success or
  failure.
- The recovery write's own failure mode is intentionally invisible: a
  downstream job never learns whether the disabled-contract emission
  succeeded, because `Effect.ignore` discards that outcome to protect the
  original cause.

[^detect-phase]: `../../src/steps/detect-phase.ts`
[^parse-changesets]: `../../src/steps/parse-changesets.ts`
[^write-summary]: `../../src/steps/write-summary.ts`
[^program]: `../../src/program.ts`
