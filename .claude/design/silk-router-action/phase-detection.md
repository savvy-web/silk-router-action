---
status: current
module: silk-router-action
category: architecture
created: 2026-02-07
updated: 2026-08-04
last-synced: 2026-08-04
completeness: 92
related:
  - silk-router-action/architecture.md
  - silk-router-action/error-model.md
dependencies: []
---

# Phase detection algorithm

## Overview

The phase detection algorithm is the core logic of the silk-router-action. It examines the GitHub Actions event context (branch, commit, PR state) and determines which of five workflow phases should execute. It is a **pipeline step**, not a service — used exactly once, so it stays in `steps/` rather than being promoted to `services/`. It requires `ActionEnvironment` for context and payload reads, and `PullRequest` plus `Repo` for the PR-association query. A commit-message fallback runs when the API cannot answer.

## Current state

The algorithm is implemented in `src/steps/detect-phase.ts` as a single exported function:

```typescript
detectPhase({ inputs })  // inputs: { releaseBranch, targetBranch, releasePrefix }
  => Effect.Effect<PhaseDetectionResult, never>
```

The error channel is `never`: any failure inside `detect` (context reads, the API call, payload parsing) is promoted to a defect at the boundary rather than surfaced as a typed domain error.

The implementation is covered by `__test__/unit/steps/detect-phase.test.ts`, which exercises all phase transitions and edge cases using `actionEnvironmentTest` (a payload-serving double) and `PullRequest.layerTest`. Every case runs under a virtual clock so a stray retry surfaces as a wrong call count rather than a test timeout.

### Workflow phases

| Phase | Trigger | Purpose |
| :---- | :------ | :------ |
| `branch-management` | Push to main (non-release) | Create/update release branch |
| `validation` | Push to release branch or open release PR | Run build, test, lint |
| `publishing` | Release PR merged (push event on main) | Publish packages |
| `close-issues` | Release PR merged (pull_request event) | Close linked issues |
| `none` | Any other scenario | No action needed |

## Detection algorithm

### Priority order

The algorithm evaluates conditions in strict priority order. The first matching condition determines the phase:

```text
1. Phase 3a (close-issues)
   - Event: pull_request
   - PR merged: true
   - Head branch: release branch
   - Base branch: target branch

2. Phase 2a (validation, PR-triggered)
   - Event: pull_request
   - PR merged: false (open PR)
   - Head branch: release branch
   - Base branch: target branch

3. Release commit detection (via GitHubClient API)
   - Event: push
   - Branch: target (main)
   - API query: check for merged release PR associated with commit

4. Phase 3 (publishing)
   - Branch: target (main)
   - isReleaseCommit: true

5. Phase 2 (validation, push-triggered)
   - Branch: release branch

6. Phase 1 (branch-management)
   - Branch: target (main)
   - isReleaseCommit: false

7. Phase none
   - No conditions matched
```

### Decision tree

```text
Is this a pull_request event?
  |
  +-- Yes: Is the PR merged?
  |     |
  |     +-- Yes: Is it from release branch to target?
  |     |     +-- Yes --> close-issues (Phase 3a)
  |     |     +-- No  --> none
  |     |
  |     +-- No: Is it from release branch to target?
  |           +-- Yes --> validation (Phase 2a)
  |           +-- No  --> none
  |
  +-- No: Is this a push event?
        |
        +-- On target (main) branch?
        |     |
        |     +-- Yes: Is this a release commit?
        |     |     +-- Yes --> publishing (Phase 3)
        |     |     +-- No  --> branch-management (Phase 1)
        |     |
        |     +-- No: continue
        |
        +-- On release branch?
        |     +-- Yes --> validation (Phase 2)
        |
        +-- Otherwise --> none
```

## Release commit detection

The most complex part of the algorithm is determining whether a push to main is a release commit (i.e., came from a merged release PR). Two strategies are used in sequence.

### Primary strategy: the PR-association query

The step calls the resource method by the question it answers:

```typescript
yield* pullRequests.listAssociatedWithCommit(github.sha)
```

The route literal never appears in this repository — `@effected/github` owns it,
and types both parameters and response from it. `Repo` arrives through the
method's own requirement channel and is resolved **per call**, never captured.

The call **paginates**, which the pre-port implementation did not: a commit with
more than 30 associated pull requests previously truncated silently.

It then searches the returned pull requests for one that:

1. Has `merged === true` (merged, not merely closed)
2. Has `head === releaseBranch` (came from the release branch)
3. Has `base === targetBranch` (targeted the main branch)

Note the shape: `PullRequestInfo` flattens `head` and `base` to **branch-name
strings**, and reports merge state as a boolean alongside an
`Option`-typed `mergedAt` — not octokit's nested `{ ref }` and nullable
`merged_at`.

If found, the commit is confirmed as a release commit and the PR number captured.

**On failure, degradation is narrow.** Five `GitHubError` kinds — `transport`,
`rateLimited`, `notFound`, `rejected`, `unauthorized` — log a warning and yield no
match, so the fallback runs. `decode` and `alreadyExists` are **not** caught and
surface as defects. The pre-port implementation used `Effect.catchCause` and
absorbed everything, including a malformed response; see `error-model.md` for why
that changed.

### Fallback strategy: Commit message patterns

When the API call fails, the algorithm falls back to commit message pattern matching.

**Merge patterns** (indicates merge from release branch):

- Contains `from {owner}/{releaseBranch}`
- Contains `Merge branch '{releaseBranch}'`
- Contains both `Merge pull request` and `{releaseBranch}`

**Version patterns** (indicates a version bump commit):

- Contains `chore: version packages`
- Contains `version packages` (case-insensitive)
- Starts with `chore: release`

A commit matching any merge pattern or any version pattern is classified as a release commit. The fallback cannot determine the PR number.

### Trade-offs

| Aspect | API strategy | Message strategy |
| :----- | :----------- | :--------------- |
| Accuracy | High — queries actual PR data | Medium — patterns can false-positive |
| PR number | Available | Not available |
| Token required | Yes | No |
| Network required | Yes | No |
| Speed | Slower (API call) | Instant |

## Bounded retry on the push-to-main path

### Problem: PR-association propagation lag

When GitHub merges a release PR, the push event to the target branch can arrive before GitHub's internal indexing has associated that merged PR with the new commit. In this window the API returns an empty array, causing the algorithm to fall through to `branch-management` and trigger an unwanted second run of the release-branch phase.

### Retry gate: `release-prefix` input

To avoid retrying on every push to main, the algorithm first checks whether the head commit message starts with the `release-prefix` input value (default `"release:"`). Only when this prefix matches does it enter the retry loop.

**Empty prefix disables the retry — deliberately, and it is a supported setting.** Without a guard, `"".startsWith("")` is `true` for every message, so an empty prefix would retry every push to the target branch. The guard turns that into the opposite and documented behavior: `release-prefix: ""` switches the retry off.

⚠️ **This depends on an unverified premise.** The runner publishes `action.yml`'s default for an *unsupplied* input, so the variable is only ever empty when a caller writes `release-prefix: ""` explicitly — which is what makes the two cases distinguishable. `readInputs` therefore reads this one input through `Config.option` rather than `Config.withDefault`, since the latter collapses an explicit empty back to the default. **Whether GitHub really publishes an empty variable for an explicitly-empty `with:` value has not been confirmed on a real runner, and no local test can confirm it.** The discharge procedure is recorded in the TSDoc at the `releasePrefixConfig` call site in `src/schema/inputs.ts`.

### Retry loop (push-to-main path only)

The retry applies exclusively to the push-to-main code path (the release-commit detection step in the decision tree). It does not affect `pull_request` events or pushes to the release branch.

- **Retry budget:** `RELEASE_DETECT_ATTEMPTS = 3` retries after the initial lookup — up to **4 lookups total**
- **Delay between lookups:** 10 seconds (`RELEASE_DETECT_DELAY = "10 seconds"`)
- **Early stop:** as soon as a lookup returns a confirmed release commit, the retry stops and routes to `publishing`
- **Constants:** both are defined once in `detect-phase.ts`

**Mechanism.** The retry is `Effect.retry` on `Schedule.spaced`, not a hand-rolled loop. Because retry acts on the error channel and cannot see an empty success, "not visible yet" is modelled as an internal tagged failure (`ReleasePRNotVisibleYet`) that is caught at the boundary and converted back to "no match". It never widens `detectPhase`'s error channel, which stays `never`, and it is deliberately not a `GitHubError` — putting it in the degrade predicate would short-circuit the retry it exists to drive.

### API remains authoritative

The `release-prefix` value never sets `is_release_commit` by itself — it only controls whether the retry loop runs. The GitHub API remains the sole authority for `is_release_commit`. The commit-message fallback strategy is not consulted during the retry loop.

### Exhaustion fallback

If the initial lookup and all 3 retries (4 lookups total) return without a confirmed release PR association, the algorithm falls through to `branch-management` (Phase 1). This is intentional: it is safer to trigger an idempotent branch-management run than to incorrectly route to `publishing`. The operator can re-run the workflow manually if needed.

## PhaseDetectionResult interface

The `detect` method returns a `PhaseDetectionResult` (defined in `src/schemas/domain.ts`) with these fields:

```typescript
interface PhaseDetectionResult {
  phase: WorkflowPhase;
  reason: string;
  isReleaseBranch: boolean;
  isMainBranch: boolean;
  isReleaseCommit: boolean;
  mergedReleasePRNumber?: number;
  isPullRequestEvent: boolean;
  isPRMerged: boolean;
  isReleasePRMerged: boolean;
  commitMessage: string;           // truncated to 100 chars
}
```

## Context extraction

The service reads all context from `ActionEnvironment` services:

| Field | Source |
| :---- | :----- |
| `commitMessage` | `ActionEnvironment.payload` → `PayloadSubset.head_commit?.message` |
| `isReleaseBranch` | `ActionEnvironment.github` → `github.ref === refs/heads/{releaseBranch}` |
| `isMainBranch` | `ActionEnvironment.github` → `github.ref === refs/heads/{targetBranch}` |
| `isPullRequestEvent` | `ActionEnvironment.github` → `github.eventName === "pull_request"` |
| `isPRMerged` | `ActionEnvironment.payload` → `PayloadSubset.pull_request?.merged === true` |
| `isReleasePRMerged` | `isPRMerged && head.ref === releaseBranch && base.ref === targetBranch` |

The payload is cast to a `PayloadSubset` interface that declares only the fields the service actually uses, keeping the runtime boundary explicit:

```typescript
interface PayloadSubset {
  readonly head_commit?: { message?: string };
  readonly pull_request?: PullRequestPayload;
}
```

## Edge cases

### Push to unrelated branch

If the push is to a branch that is neither the target nor the release branch, the algorithm returns `phase: "none"` with the reason "Not on {target} or {release} branch".

### Pull request to unrelated branches

If a pull_request event involves branches other than the release-to-target combination, the algorithm returns `phase: "none"`.

### API failure

If the GitHub API call fails, the algorithm logs a warning via `Effect.logWarning` and falls back to message pattern matching. This ensures the action never fails due to transient API issues.

### Empty commit message

If `payload.head_commit?.message` is undefined (possible in some event types), an empty string is used. The message pattern fallback will not match, and the algorithm proceeds based on branch detection alone.

### Commit message truncation

The commit message is truncated to 100 characters in the result to prevent excessively long output in logs and summaries. A `...` suffix is added when truncation occurs.

## Rationale

### Why priority-based detection?

The algorithm uses a strict priority order rather than independent condition checks because phases are mutually exclusive. A release PR merge event on the main branch could match both "publishing" (push to main with release commit) and "close-issues" (PR merge event). The priority ordering ensures the most specific phase is selected.

### Why ActionEnvironment instead of direct context reads?

Accessing `context.payload` and `context.ref` directly from the GitHub Actions context object couples the service to the Actions runtime and makes it impossible to test without environment variables. `ActionEnvironment` provides the same data through an Effect service interface, allowing `ActionEnvironmentTest.layer` to inject any context in tests without touching `process.env`.

### Why check PR state on pull_request events?

The `pull_request` event fires for many actions (opened, synchronize, closed, etc.). Only the "closed with merged=true" state indicates a completed merge. Checking `isPRMerged` prevents the action from triggering publishing logic on PR updates or closures without merge.

### Why separate close-issues from publishing?

These phases need different workflow triggers. Publishing runs on a `push` event to main (after the merge commit lands), while issue closing runs on the `pull_request` closed event (which has access to the PR metadata needed to find linked issues). Separating them allows each workflow to use the natural trigger for its task.

## Related documentation

- Overall action architecture: `silk-router-action/architecture.md`
- Test coverage: `__test__/unit/steps/detect-phase.test.ts`
