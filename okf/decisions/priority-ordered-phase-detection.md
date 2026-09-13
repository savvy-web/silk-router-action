---
type: Decision
title: Priority-ordered phase detection
description: Evaluate phase conditions in strict priority order rather than as independent checks, since two phases can match the same event.
status: stable
tags: [architecture]
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 8ca49c4085bdf8079d976d5e24fd3cb200ac65a429e26e81e4ed1c384a7cdb02
verified:
  - by: human:spencer
    at: 2026-09-13T20:11:54Z
---

# Priority-ordered phase detection

## Context

`detectPhase` (`../../src/steps/detect-phase.ts`) must assign exactly one of
five phases — `close-issues`, `validation`, `publishing`, `branch-management`,
`none` — to a single GitHub event. A release PR merge event on the target
branch can satisfy more than one phase's conditions at once: it is a
`pull_request` event with `merged: true` (which could mean `close-issues`),
and — on the corresponding `push` event to the target branch — it is also a
release commit (which could mean `publishing`). Evaluating conditions
independently would leave the result ambiguous or let two mutually exclusive
phases both fire.

## Decision

`detectPhase` evaluates conditions as a strict priority chain, returning on
the first match, read from the function body top to bottom:

1. **close-issues** — `pull_request` event, PR merged, head branch is the
   release branch, base branch is the target branch (`isReleasePRMerged`).
2. **validation (PR-triggered)** — `pull_request` event, PR open (not
   merged), head is the release branch, base is the target branch
   (`isReleasePROpen`).
3. **Release-commit detection** — on a `push` event to the target branch,
   queries the GitHub API for a merged release PR associated with the commit
   (see `api-authoritative-release-detection.md`).
4. **publishing** — target branch and `isReleaseCommit`.
5. **validation (push-triggered)** — on the release branch.
6. **branch-management** — target branch, not a release commit.
7. **none** — no condition matched.

As a decision tree:

```text
Is this a pull_request event?
  |
  +-- Yes: Is the PR merged?
  |     |
  |     +-- Yes: Is it from release branch to target?
  |     |     +-- Yes --> close-issues
  |     |     +-- No  --> none
  |     |
  |     +-- No: Is it from release branch to target?
  |           +-- Yes --> validation (PR-triggered)
  |           +-- No  --> none
  |
  +-- No: Is this a push event?
        |
        +-- On target (main) branch?
        |     |
        |     +-- Yes: Is this a release commit?
        |     |     +-- Yes --> publishing
        |     |     +-- No  --> branch-management
        |     |
        |     +-- No: continue
        |
        +-- On release branch?
        |     +-- Yes --> validation (push-triggered)
        |
        +-- Otherwise --> none
```

On `pull_request` events specifically, only the "closed with `merged: true`"
state is checked as a merge, because the `pull_request` event fires for many
actions (opened, synchronize, closed without merge, etc.). Checking
`isPRMerged` before treating anything as a completed merge prevents the
action from triggering `close-issues` logic on a PR update or an unmerged
close.

## Alternatives rejected

- **Independent condition checks with no priority.** Two phases could both
  evaluate true for the same event (a release-PR-merge push also looking like
  a plain target-branch push), leaving the caller to reconcile a set instead
  of receiving one phase.
- **Splitting close-issues and publishing detection into the same phase.**
  Rejected separately in `separate-close-issues-from-publishing.md`; the two
  fire on different event types (`pull_request` vs `push`) and therefore
  cannot share one condition check regardless of ordering.

## Consequences

- Adding a new phase means inserting it at the correct point in this ordered
  chain, not appending an independent check — the chain's order is itself
  part of the contract.
- The chain is one function with early returns, so its priority is legible by
  reading top to bottom; there is no separate priority-number field to keep
  in sync with the code.
- `__test__/unit/steps/detect-phase.test.ts` exercises every phase transition
  and the edge cases where two conditions could otherwise collide.
