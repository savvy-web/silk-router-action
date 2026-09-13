---
type: Decision
title: Bounded retry on release-prefixed pushes
description: Retry the PR-association lookup up to 3 times, 10 seconds apart, but only when the head commit message starts with release-prefix, to absorb GitHub's PR-association propagation lag without retrying every push.
status: stable
tags: [architecture, ci]
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: c5f0d382126ebd402f061a8ddfaa5cf70d13aa526ea3d1ea3e4adadff68b87a1
verified:
  - by: human:spencer
    at: 2026-09-13T20:11:55Z
---

# Bounded retry on release-prefixed pushes

## Context

When GitHub merges a release PR, the `push` event to the target branch can
arrive before GitHub's internal indexing has associated that merged PR with
the new commit. In this window,
`pullRequests.listAssociatedWithCommit(github.sha)` returns an empty result,
and without a retry the algorithm falls through to `branch-management`,
triggering an unwanted second run of the release-branch phase instead of
`publishing`.

Retrying on every push to the target branch would be wasteful: the vast
majority of pushes are not release commits and gain nothing from waiting.

## Decision

### The gate

The retry only engages when the head commit message starts with the
`release-prefix` input (default `release:`)
(`../../src/steps/detect-phase.ts:212`:
`releasePrefix !== "" && commitMessage.startsWith(releasePrefix)`). An empty
`release-prefix` disables the retry entirely and deliberately: without the
`releasePrefix !== ""` guard, `"".startsWith("")` is `true` for every commit
message, which would retry on every push. Reading `release-prefix` through
`Config.option` rather than `Config.withDefault`
(`../../src/schema/inputs.ts:58-71,109`) is what makes an explicit
`release-prefix: ""` distinguishable from an unsupplied input at all — a
`withDefault` read would collapse both to the same default string. See
`../limitations/empty-release-prefix-unverified-on-runner.md` for the
unverified premise this depends on — whether GitHub really publishes an
empty variable for an explicitly-empty `with:` value has not been confirmed
on a real runner.

### The budget

`RELEASE_DETECT_ATTEMPTS = 3` and `RELEASE_DETECT_DELAY = "10 seconds"`
(`../../src/steps/detect-phase.ts:37-39`), both defined once in
`detect-phase.ts`. `Effect.retry({ schedule: Schedule.spaced("10 seconds"),
times: 3 })` (`:207`) retries 3 times **after** the initial lookup — 4 lookups
total, 10 seconds apart — and stops early the moment a lookup returns a
confirmed release PR.

### The sentinel

Because `Effect.retry` acts on the error channel and cannot see an empty
success, "not visible yet" is modelled as an internal tagged failure,
`ReleasePRNotVisibleYet` (`:56`). Two invariants keep it honest:

- **It never escapes.** It is caught at the boundary of the retry pipeline —
  `Effect.catchTag("ReleasePRNotVisibleYet", () => Effect.succeed(undefined))`
  (`:208`) — and converted back to `undefined`. `detectPhase`'s signature
  stays `Effect.Effect<PhaseDetectionResult, never, ...>`; the sentinel is
  never part of `E`.
- **It is not a `GitHubError`, and is deliberately absent from the degrade
  predicate** in `narrow-degradation-predicate.md`. Putting it there would
  short-circuit the retry it exists to drive, since the degrade predicate
  converts a matching failure straight to "no match" without retrying.

### Exhaustion

If the initial lookup and all 3 retries return without a confirmed release
PR association, `detectPhase` falls through to `branch-management`
(`:213-224`). This is intentional: an idempotent extra `branch-management`
run is safer than incorrectly routing to `publishing` on stale data. The
operator can re-run the workflow manually if `publishing` was in fact
warranted.

## Alternatives rejected

- **Retry on every push to the target branch.** Wastes ~30 seconds of job
  time on every non-release push for no benefit, since the vast majority
  never have an association to wait for.
- **A hand-rolled retry loop.** `Effect.retry` on `Schedule.spaced` already
  expresses "N attempts, fixed spacing, stop early on success" declaratively;
  a manual loop would duplicate that logic and its edge cases (early-stop,
  attempt counting) by hand.
- **Widening the degrade predicate to include the sentinel.** Would let the
  degrade-on-failure logic swallow "not visible yet" as a plain API
  degradation, converting it straight to a fallback-driven guess instead of
  letting the retry run — defeating the sentinel's purpose.

## Consequences

- A release-prefixed push that is genuinely a release commit costs up to
  ~30 seconds of extra job time before falling back, in the worst case where
  the association takes the full retry window to propagate.
- Whether `release-prefix: ""` actually disables the retry on a real GitHub
  runner is unverified; see
  `../limitations/empty-release-prefix-unverified-on-runner.md` for the
  discharge procedure rather than restating it here.
- `__test__/unit/steps/detect-phase.test.ts` runs under a virtual clock so a
  stray retry surfaces as a wrong call count rather than a test timeout, and
  pins the 10-second spacing specifically — a generous virtual-clock advance
  asserting only call count would pass at any spacing; see
  `../gotchas/retry-count-does-not-pin-interval.md`.
