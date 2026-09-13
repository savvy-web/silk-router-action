---
type: Limitation
title: An API-failure fallback cannot name the merged PR
description: When the PR-association query degrades, is_release_commit falls back to commit-message patterns and merged_pr_number is left empty
bounds: ../interfaces/action-contract.md
stale_after: 2026-12-12T00:00:00Z
tags:
  - ci
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 6fcaf14a3f507f15f3e0254269e18f5f9de6464d03c404da62d14e41767e64e9
sources:
  - id: detect-phase-ts
    resource: ../../src/steps/detect-phase.ts
---

# An API-failure fallback cannot name the merged PR

## Condition

The PR-association query (`pullRequests.listAssociatedWithCommit`) fails with
one of five degradable `GitHubError` kinds: `transport`, `rateLimited`,
`notFound`, `rejected`, or `unauthorized`. `detect-phase.ts` catches exactly
these, logs a warning, and falls through to commit-message pattern
matching.[^detect-phase-ts]

## Symptom

`is_release_commit` is then set from commit-message patterns rather than
confirmed PR data — a heuristic that can false-positive on a message that
merely resembles a release merge or version bump — and `merged_pr_number` is
left empty, because the pattern fallback has no PR number to offer.

## Why this is acceptable

The action must not fail the job on transient API trouble: a rate limit, an
outage, or a permissions hiccup on the token is not a reason to block the
whole workflow. Degrading to a best-effort phase call keeps the pipeline
moving. A downstream consumer that specifically needs the PR number can
re-run the workflow once the API is healthy again; nothing here is
unrecoverable.

## What bounds this

This bounds the `merged_pr_number` and `is_release_commit` outputs of the
action contract.

See also: [API-authoritative release detection](../decisions/api-authoritative-release-detection.md).

[^detect-phase-ts]: ../../src/steps/detect-phase.ts
</content>
