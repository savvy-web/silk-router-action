---
status: current
module: silk-router-action
category: architecture
created: 2026-05-28
updated: 2026-08-04
last-synced: 2026-08-04
completeness: 92
related:
  - silk-router-action/architecture.md
  - silk-router-action/phase-detection.md
dependencies: []
---

# Error model

How this action decides what fails a workflow run, what degrades quietly, and
what surfaces as a defect.

> Rewritten 2026-08-04. This document previously existed to justify adopting
> `@savvy-web/github-action-effects` over the `@actions/*` packages. That
> rationale is obsolete — the action now runs on `@effected/github-actions` and
> `@effected/github` — and the error model itself, which was a footnote, is now
> the subject.

## The three postures

Every step declares its failure posture at contract time, in its TSDoc. There
are three, and the choice is a design decision rather than something discovered
while wiring.

| Step | Posture | Effect |
| --- | --- | --- |
| `detectPhase` | **degrade-to-warning** | An API failure logs and falls back to commit-message detection. `E = never`. |
| `parseChangesets` | **fail-the-job** | `ChangesetParseError` propagates; the run goes red. |
| `writeSummary` | **fail-the-job, as a defect** | `Effect.orDie` on the summary write. |

There is no double-netted tier here, because there is no cleanup phase — the
action is a single `main` with no `pre` or `post`.

## One declared error

`ChangesetParseError` is the only error type this action defines. It lives on
`src/steps/parse-changesets.ts`, the step that constructs it, and carries `file`,
`reason` and an optional `cause` with a computed `.message`.

**It has tests that construct *and* fire it.** That distinction is the point: a
test that constructs an error proves the class exists; only a test that drives a
real code path into it proves the channel can fire. An error channel that cannot
fire is worse than no channel — it forces every caller to handle a case that does
not exist, and makes the type a documented lie.

Its reachable production shapes are an unreadable `.changeset` (a permission
restriction in a CI container) and a file disappearing between the directory
listing and the read. A *missing* directory is not among them: that is the empty
result, not a failure.

## Degradation is deliberately narrow

`detectPhase` degrades on **five** of `GitHubError`'s seven kinds:

| Kind | Behavior | Why |
| --- | --- | --- |
| `transport` | degrade | The API could not be reached. |
| `rateLimited` | degrade | The API declined to answer now. |
| `notFound` | degrade | Nothing to associate. |
| `rejected` | degrade | The API refused the request. |
| `unauthorized` | degrade | The token cannot read pull requests. |
| `alreadyExists` | **defect** | Cannot arise from a `GET`. |
| `decode` | **defect** | The response did not match the expected schema. |

The last row is the load-bearing one. A `decode` failure means this action's
understanding of the API is wrong — kit schema drift, or a GitHub change.
Degrading there would convert a broken integration into a *plausible-looking
wrong answer*: the run would guess the phase from the commit message and carry
on, publishing a confident verdict derived from nothing.

**This is a change from the pre-port implementation**, which used
`Effect.catchCause` and therefore absorbed every failure including defects. A run
that previously succeeded on a malformed response now fails. That trade — a loud
failure over a quiet wrong release decision — is recorded in the changeset,
because it is user-visible.

## The retry sentinel is not an error

`detect-phase` defines `ReleasePRNotVisibleYet`, which looks like an error and is
not one in any meaningful sense. It exists solely because `Effect.retry` acts on
the error channel and cannot see an empty success, so "the association has not
propagated yet" has to be *modelled* as a failure to be retryable.

Two invariants keep it honest:

- It is caught at the boundary of the retry pipeline and converted back to
  `undefined`. It never reaches `detectPhase`'s signature, which stays
  `E = never`.
- It is **not** a `GitHubError` and is absent from the degrade predicate above.
  Putting it there would short-circuit the retry it exists to drive.

## What this action does not model

- **No per-resource error classes.** `@effected/github` ships one `GitHubError`
  with a `kind` discriminant; branching happens on `kind`, never on a rendered
  message.
- **No input-error type.** Inputs are `Config`-based and input failures are
  core's `ConfigError`.
- **No error for a missing `.changeset` directory.** Absence is a valid state
  with a defined result.
- **No custom failure rendering.** `Action.run` renders `[Tag] message` with the
  full cause at debug level.

## Where a failure surfaces

`program.ts` wraps the whole pipeline in `Effect.onError`, which publishes the
all-disabled output contract before the failure propagates. A failed run
therefore still tells a consumer `should_continue=false` rather than leaving the
output empty — the pre-port implementation emitted nothing on failure, which left
a downstream `if:` comparing against an empty string.

That write is `Effect.ignore`d: it is a last-ditch action on a path that is
already failing, and the original cause must reach the runner rather than be
replaced by an output-write error.
