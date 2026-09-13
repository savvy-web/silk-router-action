---
type: Decision
status: stable
title: Close-issues is a separate phase from publishing
description: >-
  publishing is a push to the target branch after a merged release commit;
  close-issues is the pull_request closed event carrying the same merge, kept
  distinct because the two triggers arrive on different events with different
  payload shapes.
tags:
  - release
  - ci
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 8eab39914a67b2357c0cf99ad2dc1e95223ce97b67d3c2b8288e4b67ca11f19f
sources:
  - id: detect-phase
    resource: ../../src/steps/detect-phase.ts
  - id: domain
    resource: ../../src/schema/domain.ts
verified:
  - by: human:spencer
    at: 2026-09-13T20:11:56Z
---

# Close-issues is a separate phase from publishing

## Context

`WorkflowPhase`[^domain] enumerates five phases:
`branch-management | validation | publishing | close-issues | none`. Two of
these — `publishing` and `close-issues` — both fire from the same underlying
event: a release PR merging into the target branch. `detectPhase`[^detect-phase]
distinguishes them by which GitHub event carried the trigger:

- `close-issues` fires on a `pull_request` event where the PR was merged, the
  head branch is the release branch, and the base branch is the target branch
  (`isReleasePRMerged`, lines 140–148). The `pull_request` payload carries the
  PR's `number` directly, which is why `mergedReleasePRNumber` is always
  populated on this branch.
- `publishing` fires on a `push` event to the target branch whose commit is
  confirmed (via the PR-association query, or its commit-message fallback) to
  be a release commit (lines 227–238). A push event carries no PR metadata at
  all — `mergedReleasePRNumber` is only set here when the PR-association query
  found the merge; the commit-message fallback path leaves it absent.

## Decision

Keep `publishing` and `close-issues` as two distinct phases rather than one
`publishing` phase that both a `push` and a `pull_request: closed` trigger
can produce.

The two triggers arrive on different GitHub events with different payload
shapes and different natural consumers: a `push`-triggered workflow builds
and publishes packages using the target branch's new HEAD; a
`pull_request: closed`-triggered workflow acts on the PR object itself
(closing linked issues, posting a comment referencing the PR number) and does
not need the branch's push context at all. Merging them into one phase would
force a single workflow to branch internally on `github.event_name`, which is
exactly the per-event splitting this action exists to avoid pushing onto
consumers.

## Alternatives rejected

- **One `publishing` phase covering both triggers.** Rejected because a
  consumer workflow subscribed only to `push` would never see the
  `pull_request: closed` event fire at all — GitHub Actions triggers are
  bound to `on:` blocks per workflow file, not dispatched by this action.
  Collapsing the phases would not eliminate the two triggers; it would just
  make one workflow's `if:` condition responsible for telling them apart
  after the fact, using logic this action already has.
- **A single `WorkflowPhase` value with a nested trigger discriminant** (e.g.
  `{ phase: "publishing", trigger: "push" | "pull_request" }`). Rejected as
  unnecessary indirection: the five flat literals in `WorkflowPhase` already
  let a consumer's `if: steps.control.outputs.phase == 'close-issues'` read
  directly, without unpacking a second field.

## Consequences

- A consumer that wants both publishing and issue-closing behaviour needs two
  workflow files (or two jobs) with different `on:` triggers, matching the
  three-workflow split this action was built to enable
  (`release-branch.yml`, `release-validate.yml`, `release-publish.yml`,
  described in the root `CLAUDE.md`).
- `mergedReleasePRNumber` is reliably present on `close-issues` (sourced
  directly from the `pull_request` payload) but only conditionally present on
  `publishing` (sourced from the PR-association API, which can degrade to
  the commit-message fallback and leave it unset). A consumer reading
  `merged_pr_number` on the `publishing` phase must handle the empty case;
  on `close-issues` it is unconditional.
- Adding a third trigger for the same underlying merge event (a hypothetical
  future workflow_run trigger, for example) would mean adding a third phase
  literal rather than overloading either of the two existing ones.

[^detect-phase]: `../../src/steps/detect-phase.ts`
[^domain]: `../../src/schema/domain.ts`
