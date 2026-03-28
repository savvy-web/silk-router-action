---
status: current
module: silk-router-action
category: architecture
created: 2026-03-26
updated: 2026-03-28
last-synced: 2026-03-28
---

# silk-router Architecture

## Overview

silk-router is a composable GitHub Action that serves as the entry point for the Silk deployment pipeline. It inspects GitHub event context, repository state, and changeset configuration to determine which phase of the release pipeline should execute next, then computes a structured release plan for downstream actions.

## Three-Layer Silk System

```text
Layer 1: Effect Libraries (npm packages)
  @savvy-web/github-action-effects    GitHub API, runtime, caching
  workspaces-effect                   Workspace detection, package discovery
  @changesets/*                       Changeset reading, release plan assembly

Layer 2: Composable Actions (separate repos, thin Effect wrappers)
  savvy-web/silk-router-action        Phase detection + release plan (this repo)
  savvy-web/silk-branch-action        Release branch + PR lifecycle (future)
  savvy-web/silk-publish-action       Multi-registry npm publishing (future)
  savvy-web/silk-release-action       GitHub Releases + attestations (future)

Layer 3: Reusable Workflows (in savvy-web/.github)
  silk-release.yml                    Pipeline dispatcher (future)
```

## Entry Points

### main.ts

Thin bootstrap that calls `Action.run(main, { layer: PostLayer })`:

1. Read inputs via Config API (app-id, private-key, target-branch, release-branch)
2. `GitHubApp.withToken` generates an installation token via acquireUseRelease
3. Set `process.env.GITHUB_TOKEN` for GitHubClientLive
4. Run `program(targetBranch, releaseBranch, cwd)` inside ActionLogger.group, providing AppLayer
5. Set outputs (next-phase, reason, release-plan, trigger) in a second group
6. Write job summary via `outputs.summary()`
7. Token automatically revoked when withToken callback completes

### post.ts

No-op -- logs "Post step complete". Token revocation is handled by `withToken`'s `Effect.acquireUseRelease` in main.ts. No ActionState needed.

### program.ts

The core routing pipeline (takes targetBranch, releaseBranch, cwd as arguments):

1. Read trigger context from GitHubEventContext
2. If push to target branch: detect release commit via PullRequestDetector (sha, releaseBranch, targetBranch) with retry on 5xx only, defaulting to false on failure
3. Assemble release plan via ReleasePlanAssembler (reads changesets, resolves targets, determines tag strategy), defaulting to empty plan on failure
4. Resolve phase via PhaseResolver (pure decision logic using PhaseInput with trigger, targetBranch, releaseBranch, isReleaseCommit, hasChangesets, hasPublishablePackages)
5. Generate summary via SummaryWriter
6. Return ProgramResult (Schema.Class)

## Service Dependency Graph

```text
program.ts
  GitHubEventContext        reads GITHUB_* env vars + event payload
  PullRequestDetector       queries GitHub API for associated PRs
    GitHubClient            REST API via Octokit
  ReleasePlanAssembler      orchestrates plan computation
    ChangesetReader         reads .changeset/ via @changesets/read
    TargetResolver          resolves publishConfig to registry targets
    TagStrategyResolver     determines single vs scoped tag strategy
  PhaseResolver             pure decision logic (no deps)
  SummaryWriter             generates markdown (no deps)
```

## Layer Composition

```typescript
// src/layers/app.ts
const prDetector = PullRequestDetectorLive.pipe(Layer.provide(GitHubClientLive));
const planAssembler = ReleasePlanAssemblerLive.pipe(
  Layer.provide(Layer.mergeAll(ChangesetReaderLive, TargetResolverLive, TagStrategyResolver.Live)),
);

const libraryLayers = Layer.mergeAll(
  GitHubClientLive,
  GitHubAppLive.pipe(Layer.provide(OctokitAuthAppLive)),
);

const domainLayers = Layer.mergeAll(
  GitHubEventContextLive, prDetector, planAssembler,
  PhaseResolver.Live, SummaryWriterLive,
);

export const AppLayer = Layer.provideMerge(domainLayers, libraryLayers);

// PostLayer provides GitHubApp for the post step (currently a no-op)
export const PostLayer = GitHubAppLive.pipe(Layer.provide(OctokitAuthAppLive));
```

**Important**: `Action.run` automatically provides CoreServices (ActionLogger, ActionOutputs, ActionEnvironment, ActionState) via ActionsRuntime.Default. Do NOT include these in AppLayer.

## Token Lifecycle

`GitHubApp.withToken` uses `Effect.acquireUseRelease`:

- **Acquire**: Generate installation token via GitHub App JWT + auth-app
- **Use**: Run callback with token string
- **Release**: Revoke token (errors swallowed via `Effect.catchAll(() => Effect.void)`)

This means:

- No need to save token to ActionState
- No need for manual revocation in post.ts
- Token is always revoked, even if the main step fails

**Spec divergence**: The design spec describes saving the token to ActionState and revoking in post.ts. The implementation uses the simpler acquireUseRelease bracket pattern which is safer and requires no cross-step state. Post.ts is a no-op that just logs completion.

**Input naming**: The spec references `app-private-key` but the action.yml input is `private-key`, matching the convention in other savvy-web actions.

## Schema Design

All domain types use `Schema.Class` for type inference, encoding/decoding, and construction:

- `PhaseInput`, `PhaseResult` -- phase resolver I/O (includes releaseBranch field)
- `SimpleChangeset`, `SimpleConfig` -- changeset reader output
- `TagStrategyInput` -- tag strategy resolver input
- `WorkspacePackageInfo` -- workspace package metadata
- `ProgramResult` -- main program output (phase, reason, releasePlan, trigger, summary)

Enums use `Schema.Literal`: `Phase`, `BumpType`, `TagStrategy`, `RegistryProtocol`

Structured data uses `Schema.Struct`: `Trigger`, `Registry`, `RegistryTarget`, `NpmParams`, `JsrParams`, `ReleaseEntry`, `ReleasePlan`

## Phase Detection Priority

PhaseResolver.resolve(PhaseInput) evaluates in strict priority order:

1. PR event + release branch merged -> `close-issues`
2. PR event + release branch open (not merged) -> `silk-validate`
3. Push to target + release commit + publishable packages -> `silk-publish`
4. Push to target + release commit + no publishable packages -> `silk-release`
5. Push to release branch (not target) -> `silk-validate`
6. Push to target + not release commit + has changesets -> `silk-branch`
7. Push to target + not release commit + no changesets -> `skip`
8. Everything else -> `skip`

Note: "release branch" defaults to `changeset-release/main` (configurable via `release-branch` input).

## Config API

Inputs read via Effect Config backed by ActionsConfigProvider:

```typescript
Config.string("app-id")           // reads INPUT_APP-ID
Config.redacted("private-key")    // reads INPUT_PRIVATE-KEY (masked in logs)
Config.string("target-branch").pipe(Config.withDefault("main"))
Config.string("release-branch").pipe(Config.withDefault("changeset-release/main"))
```
