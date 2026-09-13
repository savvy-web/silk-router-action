# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **silk-router-action** — a lightweight GitHub Action for pre-flight workflow control checks. It enables splitting monolithic release workflows into targeted pieces that only run when needed.

**Background:** The parent project `savvy-web/silk-release-action` has a comprehensive release workflow handling branch management, validation, and publishing. The problem: a single workflow triggering on all pushes runs unnecessary jobs. This action provides lightweight pre-flight checks so workflows can be split into targeted pieces.

**Repository note:** This repository was renamed from `savvy-web/workflow-control-action` to `savvy-web/silk-router-action` and ships as `1.0.0` at the rename. GitHub auto-redirects the old URL; consumers should update their `uses:` to `savvy-web/silk-router-action@v1` once the v1 alias tag is in place.

## Action Interface

```yaml
inputs:
 token:
  description: GitHub token for API calls (detects merged release PRs)
  required: false
  default: ${{ github.token }}
 release-branch:
  description: Release branch name
  required: false
  default: changeset-release/main
 target-branch:
  description: Target branch name (usually main)
  required: false
  default: main
 release-prefix:
  description: Commit-message prefix that gates release-detection retry on the target branch
  required: false
  default: "release:"

outputs:
 phase:              # Detected workflow phase (branch-management | validation | publishing | close-issues | none)
 has_changesets:     # Whether changeset files exist in .changeset/
 changeset_count:    # Number of changeset files
 release_type:       # Highest release type across changesets (major | minor | patch | "")
 is_release_commit:  # Whether this commit is from a merged release PR
 is_release_branch:  # Whether currently on the release branch
 is_main_branch:     # Whether currently on the target (main) branch
 merged_pr_number:   # PR number of the merged release PR (if detected)
 should_continue:    # Whether the workflow should proceed (phase != "none")
 reason:             # Human-readable explanation of the phase detection
```

## Example Workflow Split

Three workflows replace one monolithic workflow:

```yaml
# release-branch.yml - Phase 1: Create/update release branch
on:
 push:
  branches: [main]
# Uses: has_changesets && !is_release_commit

# release-validate.yml - Phase 2: Validate release branch
on:
 push:
  branches: [changeset-release/main]
# Always runs on release branch

# release-publish.yml - Phase 3: Publish on PR merge
on:
 pull_request:
  types: [closed]
  branches: [main]
# Uses: is_release_pr_merged
```

Workflows use conditionals like: `if: steps.control.outputs.should_continue == 'true'`

## Architecture

Single `main.ts` entry — NO `pre.ts` / `post.ts`. The action runs one Effect program in one phase. Layout:

**Start at [`okf/index.md`](okf/index.md).** For the project shape and boundaries, read [`okf/project.md`](okf/project.md) and [`okf/modules/silk-router-action.md`](okf/modules/silk-router-action.md); for the input/output contract, [`okf/interfaces/action-contract.md`](okf/interfaces/action-contract.md); for the design rationale behind a structural change, the [decisions index](okf/decisions/index.md); for step-by-step procedures, the [runbooks index](okf/runbooks/index.md).

- `src/main.ts` — the entry point: a program import plus one `Action.run` call guarded on `GITHUB_ACTIONS`, so the module stays importable in tests.
- `src/program.ts` — pure composition: read inputs, run steps, fold outputs, report.
- `src/layers/app.ts` — `AppLayer`: only what `ActionRuntime.layer` does not already provide.
- `src/schema/domain.ts` — `WorkflowPhase`, `BumpType`, `ChangesetRelease`, `ParsedChangeset`, `PhaseDetectionResult` schemas.
- `src/schema/inputs.ts` — `INPUT_NAMES` (4), `INPUT_DEFAULTS` mirrored from `action.yml`, and a decoded-once `readInputs`.
- `src/schema/outputs.ts` — `OUTPUT_NAMES` (10), `DISABLED_OUTPUTS`, the fold, and the single emitter.
- `src/steps/detect-phase.ts` — phase detection; owns the PR-association query and the scheduled retry.
- `src/steps/parse-changesets.ts` — changeset reader over core `FileSystem`; owns `ChangesetParseError`.
- `src/steps/write-summary.ts` — writes the job-summary panel.
- `src/format.ts` — the single rendering surface, pure and service-free.
- Tests live under `__test__/unit/` and `__test__/integration/`, with doubles in `__test__/utils/`.

## Technical Stack

- **Effect v4** (`effect@4.0.0-rc.109`, `catalog:effect`) for typed errors, dependency injection, and service composition. The catalog is supplied by the `@effected/pnpm-plugin-effect` config dependency in `pnpm-workspace.yaml`, not by a `catalogs:` block in this repo.
- **`@effected/github-actions` ^0.6.0** — the runner: `Action.run`, `ActionRuntime.layer`, `ActionInput.*`, `ActionOutputs`, `ActionLogger`, `GitHubMarkdown`. Each service ships its own `makeTest`/`layerTest`; there is no separate testing subpath.
- **`@effected/github` ^0.3.0** — the GitHub API: `GitHubClient`, `PullRequest`, `Repo`, and one `GitHubError` carrying a `kind` discriminant.
- **`@savvy-web/github-action-builder` ^2.2.3** (rsbuild-based) configured via `action.config.ts`.
- **`@effect/platform-node`** at catalog:effect — a required peer of `@effected/github-actions`, composed by `ActionRuntime.layer` rather than wired by hand. `FileSystem` imports from `effect` core.
- **`@savvy-web/silk` ^3.5.2** release toolchain (changesets v3 engine).
- **pnpm 11.20.0**, **Node 26.5.1** (`devEngines.runtime`); the action itself bundles to `runs.using: node24` (the latest supported by GitHub Actions runners today).
- **Biome 2.5.1** with strict rules.
- **Vitest** with Effect test layers.
- **Type checking:** `tsc --noEmit` from **TypeScript 7** (the native compiler; the `tsgo` preview binary graduated into `typescript@7`'s `tsc` and is no longer installed).
- **Direct dependencies:** Zero `@actions/*` packages — all GitHub Actions integration comes from `@effected/github-actions` and `@effected/github`.

## Build & Development Commands

```bash
# Install dependencies (required first)
pnpm install

# Build the action (bundles to dist/)
pnpm build

# Run tests
pnpm test                    # or pnpm ci:test

# Run a single test file
pnpm vitest __test__/unit/steps/detect-phase.test.ts

# Run tests matching a pattern
pnpm vitest -t "branch-management"

# Linting
pnpm lint                    # Check only
pnpm lint:fix                # Apply safe fixes
pnpm lint:fix:unsafe         # Apply all fixes

# Type checking (TypeScript 7 native tsc; there is no tsgo binary)
pnpm typecheck               # Via turbo
pnpm exec tsc --noEmit       # Direct

# Markdown linting
pnpm lint:md                 # Check only
pnpm lint:md:fix             # Apply fixes

# Validate action.yml and dist
pnpm validate
```

## Dogfooding First-Party Dependencies

See [`okf/runbooks/dogfood-a-first-party-dependency.md`](okf/runbooks/dogfood-a-first-party-dependency.md) for the full link → iterate → unlink procedure.

Commits must be GPG-signed with the GitHub-verified key for `C. Spencer Beggs <spencer@savvyweb.systems>` or the signature ruleset rejects them.

## Development & Release Cycle

See [`okf/runbooks/release-cycle.md`](okf/runbooks/release-cycle.md) for the full `dev` → `main` → release flow and post-release housekeeping. Two corrections to keep in mind if you've seen an older description of this: `.github/workflows/release.yml` pins the shared workflow at `@main`, not `@dev`; and the post-release housekeeping lives in `.github/workflows/branch-sync.yml` (jobs `sync-dev`, `major-tag`, `promote`) rather than a `release-sync.yml`, which does not exist. `sync-dev` is not an unconditional hard reset — it resets `dev` to `main` only when `git merge-tree` shows `dev` holds nothing `main` lacks, otherwise it rebases `dev` onto `main`, aborting untouched on conflict.

## Workflow Phase Detection Logic

Phases are evaluated in strict priority order (close-issues, then publishing, then validation, then branch-management, then none) because two phases can match the same event — see [`okf/decisions/priority-ordered-phase-detection.md`](okf/decisions/priority-ordered-phase-detection.md). Release-commit detection retries the PR-association lookup up to 3 times, 10 seconds apart, but only when the head commit message starts with `release-prefix`, to absorb GitHub's PR-association propagation lag — see [`okf/decisions/bounded-retry-on-release-prefixed-pushes.md`](okf/decisions/bounded-retry-on-release-prefixed-pushes.md).

## Code Style

Biome enforces strict rules:

- **Tabs** for indentation, 120 character line width.
- **Explicit `.js` extensions** in imports (even for `.ts` files).
- **Separate type imports:** `import type { Foo } from "./foo.js";`
- **Node.js protocol:** `import * as fs from "node:fs";`
- **Explicit types** required for exports (except in tests/scripts).

## Project Structure

```text
.
├── src/
│   ├── main.ts                # guarded Action.run(program, { layer: AppLayer })
│   ├── program.ts             # pure composition
│   ├── format.ts              # the one rendering surface
│   ├── layers/
│   │   └── app.ts             # AppLayer composition
│   ├── schema/
│   │   ├── domain.ts
│   │   ├── inputs.ts          # INPUT_NAMES (4) + readInputs
│   │   └── outputs.ts         # OUTPUT_NAMES (10) + fold + emitter
│   └── steps/
│       ├── detect-phase.ts
│       ├── parse-changesets.ts
│       └── write-summary.ts
├── __test__/
│   ├── unit/                  # mirrors src/ module for module
│   ├── integration/           # *.int.test.ts
│   └── utils/                 # doubles — helper code, never tests
├── dist/
│   └── main.js                # compiled bundle
├── okf/                        # okfit knowledge bundle — start at okf/index.md
├── .github/
│   ├── actions/local/         # mirrored bundle for local testing
│   └── workflows/             # CI workflows
├── .config/
│   └── okfit.toml             # okfit bundle config
├── action.config.ts
├── action.yml
└── package.json
```

## Important Notes

1. **Always commit `dist/`** — the compiled JavaScript must be in git for GitHub Actions to execute the action.
2. **Build before pushing** — `pnpm build` after any source change.
3. **No `src/pre.ts` or `src/post.ts`** — this action runs one phase; everything fits in `main`.
4. **Changesets for versioning** — `pnpm changeset` to create a changeset describing your change.
5. **Biome is authoritative** — defer formatting decisions to Biome.
