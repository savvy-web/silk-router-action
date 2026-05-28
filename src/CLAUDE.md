# src/CLAUDE.md

Source code architecture and development guidelines for the `src/` directory of silk-router-action.

**See also:** [Root CLAUDE.md](../CLAUDE.md) for repository overview, build commands, and Action interface.

## Overview

The source tree follows an Effect-based layered architecture using `@savvy-web/github-action-effects` for all GitHub Actions runtime abstractions. Services live under `services/`, domain schemas under `schemas/`, tagged errors under `errors/`, and layer wiring under `layers/`. `program.ts` is the Effect pipeline that orchestrates every step — reading inputs, detecting the workflow phase, parsing changesets, emitting outputs, and writing the job summary. `main.ts` is a four-line entry point that hands `program` to `Action.run`. All tests are co-located with their source modules and rely on library-provided test layers from `@savvy-web/github-action-effects/testing` rather than environment variables or process mocks.

**Design documentation for this directory:**

- Architecture and layer wiring → `@./.claude/design/silk-router-action/architecture.md` — Load when modifying `layers/app.ts`, adding services, or changing the Effect pipeline structure.
- Phase detection algorithm → `@./.claude/design/silk-router-action/phase-detection.md` — Load when working on `services/phase-detector.ts` or adding new workflow phases.
- Error model and effects library adoption → `@./.claude/design/silk-router-action/error-model.md` — Load when adding or changing `Schema.TaggedError` classes in `errors/errors.ts`, or when understanding why `@actions/*` packages are absent.

## Layout

- **`main.ts`** — Entry point. Calls `Action.run(program, { layer: MainLive })`. Do not add logic here.
- **`program.ts`** — Top-level Effect pipeline. Reads Config inputs, yields services, calls each step inside `Step.groupStep`, and sets all outputs. Covered by `program.test.ts`.
- **`program.test.ts`** — Integration test for the full pipeline; exercises all 10 outputs using `ActionOutputsTest` and `ActionEnvironmentTest`.
- **`layers/app.ts`** — `MainLive` layer composition. Wires `GitHubClientLive`, `ActionOutputsLive`, `ActionEnvironmentLive`, `NodeFileSystem`, `NodeHttpClient`, and `PhaseDetectorLive`. No logic — pure layer assembly.
- **`services/phase-detector.ts`** — `PhaseDetector` service tag + `PhaseDetectorLive` layer. Determines which workflow phase applies by inspecting the GitHub context, querying the PR-association API, and falling back to commit-message patterns.
- **`services/phase-detector.test.ts`** — Co-located tests for `PhaseDetector`; uses `ActionEnvironmentTest.layer` and a hand-rolled `GitHubClient` mock to simulate all six phase scenarios and API-failure fallback.
- **`services/changesets.ts`** — Pure Effect function `parseChangesets()` that reads `.changeset/*.md` files from disk via `node:fs` and returns counts, bump type, and affected packages.
- **`services/changesets.test.ts`** — Co-located tests for changeset parsing.
- **`services/summary.ts`** — `writeJobSummary()` function. Builds a markdown job summary from detection and changeset results using `GithubMarkdown` and writes it via `ActionOutputs.summary`.
- **`services/summary.test.ts`** — Co-located tests for summary rendering.
- **`schemas/domain.ts`** — Effect Schema definitions for `WorkflowPhase`, `BumpType`, `ParsedChangeset`, and `PhaseDetectionResult`. Single source of truth for all domain types.
- **`schemas/domain.test.ts`** — Co-located schema validation tests.
- **`errors/errors.ts`** — `Schema.TaggedError` classes: `PhaseDetectionError`, `ChangesetParseError`, `SummaryWriteError`. Each has a computed `.message` getter. The `ActionError` union type enables exhaustive `Effect.catchTag` usage.
- **`errors/errors.test.ts`** — Co-located error construction/message tests.

## Step.groupStep Convention

Every discrete step in `program.ts` is wrapped with `Step.groupStep`:

```typescript
const phase = yield* Step.groupStep("Detect workflow phase", detector.detect({ releaseBranch, targetBranch }));
const changesets = yield* Step.groupStep("Parse changesets", parseChangesets());
```

`Step.groupStep(title, effect)` does three things:

1. Opens a collapsible group block in the GitHub Actions runner UI (equivalent to `::group::` / `::endgroup::` annotations).
2. Buffers all log lines emitted inside the group.
3. On success the group is collapsed — quiet in CI. On failure the buffered lines are printed before the error — verbose exactly when you need it.

Use one `Step.groupStep` per logical unit of work. Never nest group steps.

## Inputs — Before and After

### Before (v1 pattern — do not use)

```typescript
const releaseBranch = core.getInput("release-branch") || "changeset-release/main";
const targetBranch = core.getInput("target-branch") || "main";
```

### After (v2 pattern — use this)

```typescript
const releaseBranch = yield* Config.string("release-branch").pipe(Config.withDefault("changeset-release/main"));
const targetBranch = yield* Config.string("target-branch").pipe(Config.withDefault("main"));
```

`Action.run` installs a `ConfigProvider` that maps `INPUT_<NAME>` environment variables to Config keys. Using the Effect Config API means inputs are testable via `ConfigProvider.fromMap` without touching `process.env`.

## Outputs — Before and After

### Before (v1 pattern — do not use)

```typescript
core.setOutput("phase", phase.phase);
core.setOutput("has_changesets", changesets.hasChangesets ? "true" : "false");
```

### After (v2 pattern — use this)

```typescript
const outputs = yield* ActionOutputs;
yield* outputs.set("phase", phase.phase);
yield* outputs.set("has_changesets", changesets.hasChangesets ? "true" : "false");
```

`ActionOutputs` is a service provided by the layer. In production it writes to `$GITHUB_OUTPUT`. In tests it writes to the mutable state object returned by `ActionOutputsTest.empty()`, which can be inspected after the run.

## Library Test Layer Pattern

Tests for `program.ts` and any service that depends on `ActionOutputs` or `ActionEnvironment` use the library's test layers:

```typescript
import { ActionEnvironmentTest, ActionLoggerTest, ActionOutputsTest } from "@savvy-web/github-action-effects/testing";

const state = ActionOutputsTest.empty();
const layer = Layer.mergeAll(
 ActionOutputsTest.layer(state),
 ActionLoggerTest.layer(ActionLoggerTest.empty()),
 ActionEnvironmentTest.layer(env, payload),
);
await Effect.runPromise(program.pipe(Effect.provide(layer)));
```

After the run, assert against `state.outputs` (an array of `{ name, value }` pairs). For services that need a `GitHubClient`, provide a hand-rolled `Layer.succeed(GitHubClient, { ... })` as seen in `services/phase-detector.test.ts`. For failure-injection (simulating API errors), use `Effect.die(...)` inside the mock method.

Action inputs are injected into the Config system via `Effect.withConfigProvider(ConfigProvider.fromMap(...))` — no `process.env` mutation needed.

## Token Plumbing

The action declares a `token` input in `action.yml`. Callers pass their `secrets.GITHUB_TOKEN` to it:

```yaml
- uses: savvy-web/silk-router-action@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
```

`Action.run` (in `main.ts`) bridges `INPUT_TOKEN` → `GITHUB_TOKEN` for the duration of the run before setting up the layer. `GitHubClientLive.fromEnv()` in `layers/app.ts` then reads `GITHUB_TOKEN` to authenticate the Octokit client.

The result: the existing `token` action input authenticates the GitHub client without any explicit `Config.redacted("token")` read in `program.ts`. The token never appears in program logic — it flows through the runtime bridge automatically.

## Code Style Summary

These rules are enforced by Biome and will fail CI if violated:

- **Tabs** for indentation, **120-character** line width.
- **`.js` extensions** on all local imports, even when the source file is `.ts`.
- **`node:` protocol** for built-in Node.js modules (`import * as fs from "node:fs"`).
- **Separate type imports**: `import type { Foo } from "./foo.js"` — never mixed with value imports.
- **Explicit return types** required on all exported functions and class members (except test files and `lib/scripts/`).
