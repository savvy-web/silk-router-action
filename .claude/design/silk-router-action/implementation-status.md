---
status: current
module: silk-router-action
category: status
created: 2026-03-26
updated: 2026-03-28
last-synced: 2026-03-28
---

# Implementation Status

*Last updated: 2026-03-28*

Tracking progress against the design spec at `docs/superpowers/specs/2026-03-26-silk-router-design.md` (in the savvy-web/.github repository).

## Completed

### Infrastructure (Phase 1)

- [x] Project setup (package.json, action.yml, action.config.ts)
- [x] Entry points: main.ts with Action.run + GitHubApp.withToken
- [x] Entry points: post.ts (no-op, token handled by acquireUseRelease)
- [x] AppLayer composition with all domain + library layers
- [x] CI workflow with workflow-runtime-action (typecheck, lint, test)
- [x] Integration test infrastructure (test-fixture composite action)
- [x] Event payload fixtures (push-main, push-release-branch, push-feature, pr-merged, pr-open)
- [x] Repository fixtures (pnpm-basic, pnpm-basic-changesets, pnpm-basic-monorepo)

### Domain Foundation (Phase 2)

- [x] Error types: PhaseDetectionError, ChangesetReadError, ChangesetConfigError, ReleasePlanError, TargetResolutionError, TriggerContextError
- [x] Schemas: Phase, Trigger, Registry, RegistryTarget, NpmParams, JsrParams
- [x] Schemas: BumpType, TagStrategy, ReleaseEntry, ReleasePlan

### Services (Phase 3)

- [x] GitHubEventContext -- reads GITHUB env vars + event payload
- [x] PhaseResolver -- pure priority-ordered decision logic (9 test cases, includes releaseBranch matching)
- [x] PullRequestDetector -- two-strategy release commit detection via API (sha, releaseBranch, targetBranch)
- [x] ChangesetReader -- reads .changeset/ via @changesets/read
- [x] TagStrategyResolver -- single vs scoped from workspace + release count
- [x] TargetResolver -- resolves publishConfig to registry targets (standard + Silk multi-target)
- [x] ReleasePlanAssembler -- orchestrates changeset + target + tag strategy
- [x] SummaryWriter -- generates GitHub Actions job summary markdown

### Integration (Phase 4)

- [x] program.ts routing pipeline (takes targetBranch, releaseBranch, cwd; returns ProgramResult)
- [x] Program integration tests (6 test cases via layer substitution)
- [x] 6 GitHub Actions integration test scenarios (all passing)
- [x] Token lifecycle verified end-to-end (no double revocation)
- [x] Retry only on 5xx (not 422 client errors)

### Testing Infrastructure

- [x] Tests restructured to follow vitest discovery convention
- [x] Vitest multi-project: silk-router-action:unit (57 tests) and silk-router-action:int (6 tests)
- [x] runAction helper runs dist/main.js with mocked GITHUB env vars and GITHUB_WORKSPACE at fixture
- [x] TestLogCollector + silentLoggerLayer for capturing/suppressing logs in tests
- [x] vitest.setup.ts loads .act.secrets for local integration test credentials
- [x] .act.secrets uses actual multiline PEM format (not escaped newlines)
- [x] Integration tests skip gracefully without credentials via describe.skipIf

## Test Coverage

- Unit tests (silk-router-action:unit): 57 passing
- Local integration tests (silk-router-action:int): 6 passing (with credentials)
- GitHub Actions integration tests: 6 matrix entries, all passing
- Scenarios covered: silk-branch, silk-validate, silk-publish (unit), silk-release (unit), close-issues, skip

## Spec vs Implementation Divergences

### 1. Token lifecycle (better than spec)

Spec says: save token to ActionState, revoke in post step.
Implementation: uses withToken's acquireUseRelease bracket -- token is automatically revoked when callback completes. Post.ts is a no-op. This is simpler and safer.

### 2. Input naming

Spec says: `app-private-key`. Implementation: `private-key`. Matches the action.yml convention used in other savvy-web actions.

### 3. Release commit detection (more resilient than spec)

Spec says: fail hard if API cannot resolve after retries. Implementation: defaults isReleaseCommit to false with a warning. Only retries on 5xx server errors, not 4xx client errors. A 422 for an invalid SHA is a definitive "not a release commit", not a transient failure.

### 4. ChangesetReader scope

Spec defines a releasePlan() method on ChangesetReader. Implementation only has read() and config(). The @changesets/assemble-release-plan package is a dependency but not yet used -- the assembler builds a plan from parsed changesets directly.

### 5. WorkspacesLive not integrated

Spec calls for WorkspacesLive from workspaces-effect for workspace detection and PublishabilityDetector layer swap. Not yet integrated -- program.ts currently passes an empty packages array to ReleasePlanAssembler.

### 6. Logging granularity

Spec calls for per-step ActionLogger.group() (6 named groups). Implementation wraps the program in a single "Detect phase and compute release plan" group, with a separate "Set outputs" group. Individual pipeline steps are not yet in separate groups.

### 7. Summary helpers

Spec says to use GithubMarkdown helpers from github-action-effects. SummaryWriter generates markdown directly with string concatenation. Works but doesn't benefit from the helper API.

### 8. No pre step (matches spec intent)

Spec says no pre step needed. Template had pre.ts which was correctly removed. action.config.ts only has main and post entries.

## Open Questions

1. Should we adopt full @changesets/assemble-release-plan or keep the simpler changeset-read-only approach? The spec calls for it, but the current approach works for phase detection. The full assemble-release-plan would compute newVersion values.

2. The newVersion field in ReleaseEntry is always empty string. Should the router compute this (requires assemble-release-plan or semver logic) or leave it for downstream actions to fill in?

3. When should WorkspacesLive from workspaces-effect be integrated? Currently the TargetResolver reads package.json directly from the filesystem. WorkspacesLive would provide proper workspace enumeration and the PublishabilityDetector interface.

4. The PublishabilityDetector Silk layer swap (detecting publishConfig.targets at startup) -- implement now or defer until a consumer needs multi-target resolution?

5. Should the vitest integration tests (silk-router-action:int) run in CI? They need APP_ID and APP_PRIVATE_KEY env vars. Currently only the GitHub Actions composite action tests run in CI.

6. act local testing: PEM key format requires actual newlines in .act.secrets, not escaped newlines. This is a known act/godotenv limitation. Should we document a setup guide?

## Suggested Next Steps (Priority Order)

1. **WorkspaceDiscovery integration** -- Use workspaces-effect to enumerate workspace packages and pass them to ReleasePlanAssembler. This unblocks accurate release plan computation for monorepos.

2. **Full assemble-release-plan** -- Use @changesets/assemble-release-plan to compute newVersion values. Requires WorkspaceDiscovery integration first.

3. **Per-step ActionLogger.group() logging** -- Wrap each pipeline step in its own named group per the spec (detect config, read changesets, resolve targets, compute plan, detect phase, write summary).

4. **GithubMarkdown helpers in SummaryWriter** -- Replace string concatenation with the GithubMarkdown utility from github-action-effects for richer formatting.

5. **Monorepo integration test fixtures** -- pnpm-basic-monorepo exists but no integration test uses it. Add scenarios for multi-package release plans with scoped tags.

6. **PublishabilityDetector Silk layer swap** -- Detect publishConfig.targets at startup and provide the appropriate layer.
