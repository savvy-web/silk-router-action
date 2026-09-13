---
type: Decision
title: API-authoritative release detection
description: The GitHub PR-association API is the sole authority for is_release_commit; commit-message pattern matching is a degraded fallback only, used when the API cannot answer.
status: stable
tags: [architecture, ci]
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 5eb646c2b6971c86934b7fd962d78be0934a1344d9ae4517fa9eded2c34655cf
verified:
  - by: human:spencer
    at: 2026-09-13T20:11:54Z
---

# API-authoritative release detection

## Context

On a `push` event to the target branch, `detectPhase`
(`../../src/steps/detect-phase.ts:162-225`) must decide whether the pushed
commit came from a merged release PR (`publishing`) or not
(`branch-management`). Two strategies are available: query GitHub's API for
pull requests associated with the commit, or pattern-match the commit
message.

## Decision

The primary strategy is the PR-association query:

```typescript
yield* pullRequests.listAssociatedWithCommit(github.sha)
```

(`../../src/steps/detect-phase.ts:166`). `Repo` arrives through the method's
own requirement channel and is resolved per call, never captured. The call
paginates, so a commit with more than one page of associated pull requests is
still searched exhaustively. It searches the results for a `PullRequestInfo`
where `p.merged && p.head === releaseBranch && p.base === targetBranch`
(`:168`) — merged (not merely closed), from the release branch, into the
target branch. `PullRequestInfo` flattens `head` and `base` to plain
branch-name strings and reports merge state as a boolean, unlike octokit's
nested `{ ref }` shape and nullable `merged_at`.

If found, the commit is confirmed a release commit and the PR number is
captured for `merged_pr_number`. If the API call fails, only five of
`GitHubError`'s kinds degrade to the fallback — `transport`, `rateLimited`,
`notFound`, `rejected`, `unauthorized` (`:176`) — logging a warning via
`Effect.logWarning` first. `decode` and `alreadyExists` are not caught and
surface as defects via `Effect.orDie` (`:182`); see
`narrow-degradation-predicate.md` for why.

Only when the API call itself fails does the fallback run: pattern-matching
the commit message (`detectReleaseCommitFromMessage`,
`../../src/steps/detect-phase.ts:66-80`). A commit matching any **merge
pattern** — contains `` from {owner}/{releaseBranch} ``, contains
`` Merge branch '{releaseBranch}' ``, or contains both `Merge pull request`
and `{releaseBranch}` — or any **version pattern** — contains
`chore: version packages`, contains `version packages` case-insensitively, or
starts with `chore: release` — is classified as a release commit. The
fallback cannot determine a PR number.

| Aspect | API strategy | Message strategy |
| --- | --- | --- |
| Accuracy | High — queries actual PR data | Medium — patterns can false-positive |
| PR number | Available | Not available |
| Token required | Yes | No |
| Network required | Yes | No |
| Speed | Slower (API call) | Instant |

**The API remains authoritative in every case where it answers.** The
`release-prefix` input (see `bounded-retry-on-release-prefixed-pushes.md`)
never sets `is_release_commit` by itself — it only controls whether the
PR-association lookup retries before giving up. The commit-message fallback
is never consulted during that retry loop; it runs only after the API path
has exhausted its attempts or failed outright.

## Alternatives rejected

- **Commit-message matching as the primary strategy.** Faster and
  token-free, but patterns can false-positive (a manually authored commit
  that happens to contain `version packages`) and can never recover a PR
  number, which `merged_pr_number` depends on.
- **Absorbing every API failure into the fallback (the pre-port behavior).**
  The pre-port implementation used `Effect.catchCause`, so a malformed API
  response (`decode`) was silently treated the same as a legitimate
  transport failure. See `narrow-degradation-predicate.md` for why that
  changed.

## Consequences

- `merged_pr_number` is only ever populated by the API path; a run that falls
  back to message matching reports `is_release_commit` correctly in the
  common case but leaves `merged_pr_number` empty even when it is a true
  release commit — see `../limitations/fallback-cannot-name-the-pr.md`.
- A production API outage during the retry window still produces a phase
  decision via the fallback rather than failing the job, per the
  degrade-to-warning posture in `failure-postures-per-step.md`.
