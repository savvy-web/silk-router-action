---
type: Decision
status: stable
title: Only five of seven GitHubError kinds degrade the release-commit query
description: >-
  detectPhase's catchIf predicate degrades transport, rateLimited, notFound,
  rejected, and unauthorized to a commit-message fallback; decode and
  alreadyExists fall through to Effect.orDie and surface as defects.
tags:
  - architecture
  - observability
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: e4a16b59a23a5f522cd0af2b1f923f741afc8ae45cfca35b1d4de0708405a229
sources:
  - id: detect-phase
    resource: ../../src/steps/detect-phase.ts
verified:
  - by: human:spencer
    at: 2026-09-13T20:11:56Z
---

# Only five of seven GitHubError kinds degrade the release-commit query

## Context

`detectPhase`'s[^detect-phase] PR-association lookup
(`pullRequests.listAssociatedWithCommit`, `detect-phase.ts:166-183`) is
wrapped in `Effect.catchIf` against a `GitHubError.hasKind` predicate before
falling through to `Effect.orDie`.
`GitHubError` carries seven possible `kind` values:

| Kind | Degrades? | Meaning |
| --- | --- | --- |
| `transport` | yes | Network-level failure — the API could not be reached. |
| `rateLimited` | yes | GitHub throttled the request. |
| `notFound` | yes | The queried resource does not exist from the API's point of view. |
| `rejected` | yes | The API refused the request. |
| `unauthorized` | yes | The token could not authenticate or lacks scope. |
| `decode` | **no** | The response did not match the kit's expected schema. |
| `alreadyExists` | **no** | Cannot arise from a GET at all. |

Only the five "the API could not answer" kinds pass the predicate at
`detect-phase.ts:176`; both `decode` and `alreadyExists` fall through
unmatched to `Effect.orDie` immediately below (line 182) and surface as
defects rather than degrading to the commit-message fallback.

## Decision

Keep the degradation predicate narrow: exactly the five kinds listed above,
never widened to catch everything `GitHubError` can carry.

The load-bearing row is `decode`. A `decode` failure means the API answered,
but the payload did not match the shape this action (or the kit) expects —
in other words, a bug in this action or in `@effected/github`, not a
transient condition. Silently degrading on `decode` would convert a broken
integration into a *plausible wrong release verdict*: `detectPhase` would
fall back to commit-message pattern matching against a payload it never
actually inspected correctly, and report a phase with the same confidence as
a correct detection. Loud failure (a defect that fails the job) is strictly
preferable to a wrong answer delivered with no visible sign anything went
wrong.

`alreadyExists` degrades for a narrower reason: it is structurally
unreachable from a read-only `listAssociatedWithCommit` GET, so including it
in the predicate would document a code path that can never fire.

## Alternatives rejected

- **`Effect.catchCause` absorbing everything.** This is what the pre-port
  code did — any `GitHubError`, regardless of kind, degraded to the
  commit-message fallback. Rejected because it makes a `decode` failure
  indistinguishable from a transient API outage: both would quietly become a
  guess, and a genuine schema mismatch between this action and the kit would
  never surface as anything louder than an occasional wrong phase.
- **Excluding `notFound` from the degrade set.** Considered because a `404`
  on a commit-association query could indicate a real configuration problem
  (wrong repository, wrong token scope) rather than a transient one. Rejected
  because the effect is the same either way — the API could not answer the
  question — and the commit-message fallback already exists to absorb exactly
  this class of "the primary source is unavailable" condition.

## Consequences

- A future `GitHubError` kind must be triaged explicitly against this table
  before it is added to the predicate — the default for an unclassified kind
  is to fall through to `Effect.orDie`, not to be swept in by widening the
  `hasKind` call.
- The predicate is the one place this repository's "loud failure over a
  plausible wrong answer" stance is enforced at the type level; a code review
  on `detect-phase.ts` that touches line 176 should read this decision before
  approving a widened list.
- Because `decode` and `alreadyExists` are defects, a test asserting the
  degrade path must construct a `GitHubError` with one of the five listed
  kinds — a test built against `decode` would be asserting the wrong branch
  entirely.

[^detect-phase]: `../../src/steps/detect-phase.ts`
