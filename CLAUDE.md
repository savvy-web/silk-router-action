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

**For full architectural details:**
→ `@./.claude/design/silk-router-action/architecture.md`

Load when making structural changes, adding services, or modifying the layer wiring.

**For phase detection algorithm:**
→ `@./.claude/design/silk-router-action/phase-detection.md`

Load when working on phase detection logic, adding new phases, or debugging incorrect phase assignments.

**For the error model — failure postures, the narrow degradation predicate, the retry sentinel:**
→ `@./.claude/design/silk-router-action/error-model.md`

Load when adding an error type, changing a step's failure posture, or touching the degradation predicate in `detect-phase`.

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

- **Effect v4** (`effect@4.0.0-beta.101`, `catalog:effect`) for typed errors, dependency injection, and service composition.
- **`@effected/github-actions` ^0.4.1** — the runner: `Action.run`, `ActionRuntime.layer`, `ActionInput.*`, `ActionOutputs`, `ActionLogger`, `GitHubMarkdown`. Each service ships its own `makeTest`/`layerTest`; there is no separate testing subpath.
- **`@effected/github` ^0.2.2** — the GitHub API: `GitHubClient`, `PullRequest`, `Repo`, and one `GitHubError` carrying a `kind` discriminant.
- **`@savvy-web/github-action-builder` ^2.0.0** (rsbuild-based) configured via `action.config.ts`.
- **`@effect/platform-node`** at catalog:effect — a required peer of `@effected/github-actions`, composed by `ActionRuntime.layer` rather than wired by hand. `FileSystem` imports from `effect` core.
- **`@savvy-web/silk` ^3.0.0** release toolchain (changesets v3 engine).
- **pnpm 11.13.0**, **Node 26.5.0** (`devEngines.runtime`); the action itself bundles to `runs.using: node24` (the latest supported by GitHub Actions runners today).
- **Biome 2.5.1** with strict rules.
- **Vitest** with Effect test layers.
- **Type checking:** TypeScript Native Preview (`tsgo --noEmit`).
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

# Type checking (use tsgo, not tsc)
pnpm typecheck               # Via turbo
pnpm exec tsgo --noEmit      # Direct

# Markdown linting
pnpm lint:md                 # Check only
pnpm lint:md:fix             # Apply fixes

# Validate action.yml and dist
pnpm validate
```

## Dogfooding First-Party Dependencies

We author every dependency in the table below, so a bug or missing API in one can be fixed **in its own repo** and dogfooded through this action before publishing. The action is a **bundled** artifact — `pnpm build` inlines every dependency into `dist/main.js` — so once a local library build is linked and this repo is rebuilt, the change is baked into the committed `dist`. The integration runs the committed `dist`, **not** `node_modules`.

| Package | Repo | Local checkout |
| --- | --- | --- |
| `@savvy-web/github-action-builder` | `savvy-web/github-action-builder` | `../github-action-builder` |

It is a direct-only dependency with no transitive duplication path, so `pnpm link ../<repo>` is the linking mechanism. The `pnpm-workspace.yaml` `overrides` mechanism is not needed here unless a future first-party transitive dependency is introduced.

**Procedure:**

1. **Build the library:** in its repo run `pnpm ci:build` (produces `dist/dev` link target).
2. **Link it:** `pnpm link ../<repo>` here, then `pnpm install`.
3. **Keep the declared range correct** in this repo's `package.json` for the eventual unlinked install.
4. **Iterate:** edit library source → `pnpm ci:build` there → `pnpm typecheck` + `pnpm test` here → `pnpm build` here → commit (`src` + `dist` + changeset) → push `dev`.
5. **Library edits ship separately:** they land on the library's own branch and release with its next published version.
6. **Final step, only AFTER the dogfooded version publishes:** remove the link, pin the published range, `pnpm install`.

Commits must be GPG-signed with the GitHub-verified key for `C. Spencer Beggs <spencer@savvyweb.systems>` or the signature ruleset rejects them.

## Development & Release Cycle

### The `dev` branch convention

All in-progress feature work lands on a long-lived **`dev`** branch, never directly on `main`. `main` always reflects the last released state.

The shared release workflow at `savvy-web/.github/.github/workflows/release.yml` has a matching **`dev` branch**. This repo's own `release.yml` pins `@dev` so it exercises in-progress workflow changes before they reach `main`.

### Flow: `dev` → `main` → release

1. Feature work accumulates on `dev`; merge it into `main` when ready.
2. The push to `main` triggers **Phase 1** — changeset detection creates/updates `changeset-release/main` and the release PR.
3. Pushes to the release branch trigger **Phase 2** validation (build, publish dry-runs, release-notes preview, sticky comment).
4. Merging the release PR triggers **Phase 3** — publishing, Git tags, and a published GitHub release.
5. The published release fires `release-sync.yml`, which closes the loop by resetting `dev` back to `main`.

### `release-sync.yml` — post-release housekeeping

Triggered by `release: [published]` (and `workflow_dispatch` with a `tag` input + `dry-run` for rehearsal). Runs as the GitHub App bot so its pushes can bypass protection and won't recurse (no workflow triggers on tag/`dev` pushes). On a **stable SemVer 2.0.0 release `>= 1.0.0`** (bare `MAJOR.MINOR.PATCH` — no leading `v`, no `-prerelease`, no `+build`) it:

1. Moves (or creates) the **`v<major>`** alias tag (e.g. `v1`) at the released commit.
2. **Hard-resets `dev` to `main` HEAD** — a genuine clobber, so any `dev` commit not yet in `main` is discarded. This is safe by design: `dev` work always lands in `main` before a release.

Each push is guarded: if the remote `v<major>` tag or `dev` already points at its target commit, that push is skipped. Sub-`1.0.0`, prerelease, build-metadata, and non-SemVer tags are ignored (no-op).

## Workflow Phase Detection Logic

The core detection algorithm:

1. **Phase 3a (close-issues):** `pull_request` event where release PR was merged.
2. **Phase 3 (publishing):** Push to main from a merged release PR.
3. **Phase 2 (validation):** Push to release branch (or open PR from release → main).
4. **Phase 1 (branch-management):** Push to main, non-release commit.
5. **none:** Any other scenario.

Release commits are detected primarily via GitHub API query for PRs associated with the commit; falls back to commit-message patterns (e.g. "chore: version packages", merge commit patterns) on API failure. When the head commit message on the target branch starts with `release-prefix` (default `release:`) but no merged release PR is yet associated with the commit, detection is retried up to 3 times, 10 seconds apart, to absorb GitHub's PR-association propagation lag before falling back to branch-management.

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
├── .github/
│   ├── actions/local/         # mirrored bundle for local testing
│   └── workflows/             # CI workflows
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
