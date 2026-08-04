---
status: current
module: silk-router-action
category: architecture
created: 2026-02-07
updated: 2026-08-04
last-synced: 2026-08-04
completeness: 92
related:
  - silk-router-action/phase-detection.md
  - silk-router-action/error-model.md
dependencies: []
---

# Workflow control action architecture

## Overview

The silk-router-action is a lightweight GitHub Action that performs pre-flight checks to determine which release workflow phase should execute. It replaces a monolithic release workflow with targeted workflows that only run when needed, reducing CI/CD resource usage and improving clarity.

The action is built on an Effect-based layered architecture. GitHub Actions runtime abstractions (inputs, outputs, environment context, logging) come from `@effected/github-actions`; the GitHub API comes from `@effected/github`. No `@actions/*` package is imported anywhere. `src/main.ts` is an entry point guarded on `GITHUB_ACTIONS` so the module stays importable without executing the action; `program.ts` is pure composition over one module per pipeline step.

## Current state

The action is fully implemented and production-ready with:

- **Single entry point** (`src/main.ts`) — no pre/post scripts; the only lifecycle script is `main`
- **Effect pipeline** (`src/program.ts`) — reads inputs, runs each step inside a local `step` helper (`ActionLogger.group` wrapping `withBuffer`), folds the results into the output contract and emits it
- **5 workflow phases** detected: `branch-management`, `validation`, `publishing`, `close-issues`, `none`
- **10 action outputs** providing fine-grained workflow control signals
- **Markdown job summaries** rendered by `src/format.ts` via `GitHubMarkdown` and written through `ActionOutputs.summary`
- **rsbuild-based bundler** via `@savvy-web/github-action-builder`
- **Fast execution** completing in under 5 seconds

### File structure

```text
src/
  main.ts                          # Entry point — guarded Action.run(program, { layer: AppLayer })
  program.ts                       # Top-level Effect pipeline and orchestrator
  layers/
    app.ts                         # AppLayer composition (pure wiring, no logic)
  steps/
    detect-phase.ts                # phase detection, PR association, scheduled retry
    changesets.ts                  # parseChangesets() — reads .changeset/*.md files
    summary.ts                     # writeJobSummary() — builds + writes markdown summary
  schema/
    domain.ts                      # Effect Schema definitions for domain types
  errors/
    errors.ts                      # Schema.TaggedErrorClass classes for all failure modes
```

## System architecture

### Entry point: `src/main.ts`

The entry point is intentionally minimal:

```typescript
import { Action } from "@effected/github-actions";
import { AppLayer } from "./layers/app.js";
import { program } from "./program.js";

if (process.env.GITHUB_ACTIONS !== undefined) {
  await Action.run(program, { layer: AppLayer });
}
```

`Action.run` installs the Effect runtime, wires the ConfigProvider so `Config.string(...)` reads from `INPUT_*` environment variables and bridges the `token` action input to `GITHUB_TOKEN` before the layer starts. All error handling, process exit codes and job failure signals are managed by the library.

### Layer wiring: `src/layers/app.ts`

`AppLayer` is a pure Layer composition with no logic, and carries **only** what `ActionRuntime.layer` does not already provide:

```typescript
const githubClient = GitHubClientLive.fromEnv().pipe(Layer.orDie);

export const AppLayer = Layer.mergeAll(
  githubClient,
  ActionOutputsLive.pipe(Layer.provide(NodeFileSystem.layer)),
  ActionEnvironmentLive,
  NodeFileSystem.layer,
  PhaseDetectorLive.pipe(Layer.provide(Layer.mergeAll(ActionEnvironmentLive, githubClient, NodeFileSystem.layer))),
);
```

`ActionRuntime.layer` composes the Node platform, an HTTP client, `ActionEnvironment`, `ActionLogger`, `ActionOutputs` and `ActionState`, so none of those appear in `AppLayer` — putting them there would be over-provision rather than wiring. `AppLayer` carries the GitHub client (authenticated from the `token` input through the runner's own `INPUT_` derivation, as a redacted value), `Repo`, and `PullRequest`.

`Repo` is a **value** service resolved per call by the resource methods that need it. Capturing it at layer-construction time would make `Repo.provide` silently do nothing.

### Pipeline: `src/program.ts`

The pipeline follows a linear sequence, each step wrapped by the local `step` helper:

1. **Read inputs** — `Config.string(...).pipe(Config.withDefault(...))` for `release-branch`, `target-branch` and `release-prefix`
2. **Detect phase** — `step("Detect workflow phase", detector.detect(...))`
3. **Parse changesets** — `step("Parse changesets", parseChangesets())`
4. **Emit outputs** — `step("Emit outputs", …)` sets all 10 action outputs via `ActionOutputs.set`
5. **Write summary** — `step("Write job summary", writeJobSummary(...))`

`step(title, effect)` opens a collapsible group in the Actions runner UI. Groups are collapsed on success and expanded on failure, keeping logs quiet in CI and verbose only when something goes wrong.

### Subsystem: Phase detection

See `silk-router-action/phase-detection.md` for the full algorithm.

The phase detection subsystem is implemented as an Effect service (`src/services/phase-detector.ts`). `PhaseDetector` is a class-based `Context.Service` (exporting a `PhaseDetectorShape` interface); `PhaseDetectorLive` is the production Layer that depends on `ActionEnvironment` (for `github.ref`, `github.eventName`, `payload`), `GitHubClient` (for the PR-association API call) and the core `FileSystem` service (to read the event payload from `$GITHUB_EVENT_PATH`). Both inputs and outputs are typed. The payload is cast to a `PayloadSubset` interface that declares only the fields the service actually uses, keeping the boundary explicit.

### Subsystem: Changeset parsing

The changeset parser (`src/services/changesets.ts`) is a pure Effect function `parseChangesets()` that reads `.changeset/*.md` files from disk via `node:fs` wrapped in `Effect.try` (not a service dependency) and extracts:

- **Changeset count** and presence flag
- **Per-changeset data** — ID, summary and releases (package name + bump type)
- **Aggregated data** — highest release type across all changesets, deduplicated affected packages and a map of package-to-highest-bump

Each changeset file uses a YAML frontmatter format:

```markdown
---
"package-name": major
"@scope/package": minor
---

Summary of changes
```

### Subsystem: Logging and summaries

Structured logging uses `program.ts`'s local `step` helper — `ActionLogger.group` wrapping `ActionLogger.withBuffer(…, { onSuccess: "discard" })` — giving a collapsible block whose verbose output is discarded on success and spilled on failure. Individual log lines use `Effect.logInfo`, `Effect.logWarning` and `Effect.logError`; `ActionLogger.layerLogger` maps them onto runner annotations.

The pre-port `Step.groupStep` also emitted one summary line per step on success. `ActionLogger` has no equivalent and that line is gone — an accepted, changeset-recorded loss rather than something reproduced locally.

Job summaries are rendered in `src/format.ts` — the action's single rendering surface, pure and service-free — using `GitHubMarkdown` (headings, tables) and written by `steps/write-summary.ts` via `ActionOutputs.summary(markdown)`. That writer builds and serializes a real markdown tree rather than joining strings, so a `|` arriving from a branch name or PR title is escaped instead of corrupting the table.

### Error model

Tagged errors live in `src/errors/errors.ts`. See `silk-router-action/error-model.md` for the design and rationale.

## Data flow

```text
GitHub Event
    |
    v
+----------------------+
|     program.ts       |
|    (Effect pipe)     |
+----------------------+
    |               |
    v               v
+---------------+ +------------------+
| PhaseDetector | | parseChangesets() |
|   (service)   | |    (pure fn)     |
+---------------+ +------------------+
    |               |
    v               v
+----------------------+
|   Set 10 outputs     |
|   Write summary      |
+----------------------+
    |
    v
Downstream workflow steps
use outputs for conditionals
```

## Action inputs and outputs

### Inputs

| Input | Required | Default | Description |
| :---- | :------- | :------ | :---------- |
| `token` | No | `github.token` | GitHub token for API calls |
| `release-branch` | No | `changeset-release/main` | Release branch name |
| `target-branch` | No | `main` | Target branch name |
| `release-prefix` | No | `release:` | Commit-message prefix that gates release-detection retry on the target branch |

### Outputs

| Output | Type | Description |
| :----- | :--- | :---------- |
| `phase` | string | Detected workflow phase |
| `has_changesets` | string | Whether changesets exist |
| `changeset_count` | string | Number of changeset files |
| `release_type` | string | Highest release type (major/minor/patch) |
| `is_release_commit` | string | Whether this is a release merge commit |
| `is_release_branch` | string | Whether on the release branch |
| `is_main_branch` | string | Whether on the target branch |
| `merged_pr_number` | string | PR number of merged release PR |
| `should_continue` | string | Whether the workflow should proceed |
| `reason` | string | Human-readable detection explanation |

## Build system

The build uses `@savvy-web/github-action-builder`, which is rsbuild-based. It bundles `src/main.ts` into `dist/main.js` with all dependencies inlined, so the action executes with no `node_modules` resolution at runtime.

Key build commands:

- `pnpm build` — Production build via turbo
- `pnpm build:prod` — Direct build via github-action-builder
- `pnpm validate` — Validates the action configuration

## Integration points

### Workflow split pattern

The action enables splitting one monolithic workflow into three targeted workflows:

1. **release-branch.yml** (Phase 1) — Triggers on push to main, uses `has_changesets` and `!is_release_commit` to create/update the release branch
2. **release-validate.yml** (Phase 2) — Triggers on push to the release branch or open PR from release to main, always runs validation
3. **release-publish.yml** (Phase 3) — Triggers on `pull_request` closed event on main, uses `is_release_commit` to publish packages

Each workflow runs this action first, then conditionally proceeds:

```yaml
- uses: savvy-web/silk-router-action@main
  id: control
  with:
    token: ${{ secrets.GITHUB_TOKEN }}

- name: Run release step
  if: steps.control.outputs.should_continue == 'true'
  run: ...
```

### Type system

The `src/schemas/` directory contains Effect Schema definitions that are the single source of truth for all domain types. `domain.ts` defines `WorkflowPhase`, `BumpType`, `ParsedChangeset` and `PhaseDetectionResult`. Tagged errors live in `src/errors/errors.ts` — see `silk-router-action/error-model.md`.

## Rationale

### Why Effect services instead of direct @actions/* imports?

Using kit services (`ActionEnvironment`, `ActionOutputs`, `ActionLogger`, `GitHubClient`, `PullRequest`, `Repo`) decouples the business logic from the Actions runtime. Tests provide doubles from `__test__/utils/doubles.ts` without touching `process.env` or mocking module imports, and the production and test paths share exactly the same program code.

One sharp edge: `ActionEnvironment.layerTest` hard-provides a noop filesystem, so it cannot serve a webhook payload. Payload-driven tests compose `ActionEnvironment.makeTest` with their own stubbed `FileSystem` instead — see `__test__/CLAUDE.md`.

### Why Config API instead of core.getInput?

`Config.string("release-branch").pipe(Config.withDefault(...))` lets tests inject inputs via `Effect.withConfigProvider(ConfigProvider.fromMap(...))` without mutating `process.env`. It also integrates naturally with the Effect error channel: a missing required input surfaces as a typed `ConfigError` rather than an empty string at runtime.

### Why rsbuild (github-action-builder)?

`@savvy-web/github-action-builder` uses rsbuild to produce a leaner bundle with better tree-shaking than the previous `@vercel/ncc` bundler. The build API is the same from the action author's perspective (`pnpm build`), but the output is smaller and build times are faster.

### Why hand-written changeset parsing?

The current regex-based parser handles the simple YAML frontmatter format used by changesets reliably. Using official `@changesets/*` packages would add dependencies that the bundler inlines anyway, but the current implementation is simpler and well-tested. Replacement is noted as a future improvement but is not urgent.

### Why separate close-issues from publishing?

These phases need different workflow triggers. Publishing runs on a `push` event to main (after the merge commit lands), while issue closing runs on the `pull_request` closed event (which has access to the PR metadata needed to find linked issues). Separating them allows each workflow to use the natural trigger for its task.

## Related documentation

- Phase detection algorithm: `silk-router-action/phase-detection.md`
- Error model and tagged errors: `silk-router-action/error-model.md`
- Project README: `README.md`
- Action configuration: `action.yml`
