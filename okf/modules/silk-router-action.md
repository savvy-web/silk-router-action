---
type: Module
title: silk-router-action
description: The one GitHub Action module — entry point, pipeline, layer wiring, and build.
status: draft
kind: action
resource: ../../src
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 75fb0e5aaa26ff2315cb74cf4b6990e2ba3086f820aae3a5f76f9693bb4f47b5
sources:
  - id: main-ts
    resource: ../../src/main.ts
  - id: program-ts
    resource: ../../src/program.ts
  - id: app-ts
    resource: ../../src/layers/app.ts
  - id: format-ts
    resource: ../../src/format.ts
  - id: domain-ts
    resource: ../../src/schema/domain.ts
  - id: inputs-ts
    resource: ../../src/schema/inputs.ts
  - id: outputs-ts
    resource: ../../src/schema/outputs.ts
  - id: detect-phase-ts
    resource: ../../src/steps/detect-phase.ts
  - id: parse-changesets-ts
    resource: ../../src/steps/parse-changesets.ts
  - id: write-summary-ts
    resource: ../../src/steps/write-summary.ts
  - id: action-config-ts
    resource: ../../action.config.ts
---

# silk-router-action module

## Entry point

`src/main.ts` is the entire entry surface: a `program` import plus one
`Action.run(program, { layer: AppLayer })` call, guarded on
`process.env.GITHUB_ACTIONS !== undefined`[^main-ts]. The guard is what keeps
the module importable — and therefore testable — without executing the
action as an import side effect[^main-ts]. There is no `pre.ts` or `post.ts`;
this action runs one phase. `Action.run` installs the Effect runtime and
wires the `ConfigProvider` so `Config.string(...)` reads `INPUT_*`
environment variables before the layer starts[^main-ts]. The previous
implementation mutated `process.env.INPUT_TOKEN` into `GITHUB_TOKEN` above
this call; that bridge is gone because `GitHubClient.layerFromConfig({ name:
"token" })` in `layers/app.ts` now reads the input directly through the
runner's own `INPUT_` derivation, as a `Redacted` value[^main-ts].

## Pipeline: `src/program.ts`

`program` is pure composition, run inside `Effect.gen`, in this
order[^program-ts]:

1. **Read inputs** — `yield* readInputs` (`src/schema/inputs.ts:124`).
2. **Detect phase** — `step("Detect workflow phase", detectPhase({
   inputs }))`.
3. **Parse changesets** — `step("Parse changesets", parseChangesets())`.
4. **Fold and emit outputs** — `step("Emit outputs", emitOutputs(foldOutputs({
   phase, changesets })))`.
5. **Write job summary** — `step("Write job summary", writeSummary({ phase,
   changesets, inputs }))`.

Each step runs through a local `step` helper: `logger.group(name,
logger.withStep(name, effect))`[^program-ts]. This reproduces the shape the
legacy toolkit's `groupStep` produced — a collapsible block in the Actions
runner UI, collapsed on success and expanded on failure, with buffered
output discarded on success and one info line reporting the step
happened[^program-ts]. Neither `withStep` nor its predecessor `withBuffer`
buffers warnings or errors, so a long-running step still reports trouble
while it runs[^program-ts].

On any failure in the pipeline, `program` publishes the all-disabled output
contract before the failure reaches `Action.run`, via a trailing
`Effect.onError(() => emitOutputs(DISABLED_OUTPUTS).pipe(Effect.ignore))`
(`src/program.ts:72`)[^program-ts].
This is a deliberate departure from the pre-port program, which emitted
nothing on failure — this action exists solely to gate other workflows, so a
failed run that emits nothing would leave a consumer's
`should_continue == 'true'` check reading an empty string instead of an
explicit `"false"`[^program-ts]. The `Effect.ignore` on the last-ditch write
means a failure writing the disabled contract itself never replaces the
original cause reaching `Action.run`[^program-ts].

## Layer wiring: `src/layers/app.ts`

`AppLayer` is a pure `Layer` composition carrying only what
`ActionRuntime.layer` does not already provide[^app-ts]:

```typescript
const client = GitHubClient.layerFromConfig({ name: "token" }).pipe(Layer.orDie);

export const AppLayer: Layer.Layer<GitHubClient | PullRequest | Repo> = Layer.mergeAll(
 client,
 Repo.layerFromConfig().pipe(Layer.orDie),
 PullRequest.layer.pipe(Layer.provide(client)),
);
```

`ActionRuntime.layer` already composes the Node platform, an HTTP client,
`ActionEnvironment`, `ActionLogger`, `ActionOutputs`, and `ActionState`, so
none of them appear in `AppLayer` — adding one would be over-provision, not
wiring[^app-ts]. `AppLayer` is therefore small on purpose: it supplies only
`GitHubClient` (authenticated from the `token` action input, read as
`Config.redacted` so the token stays `Redacted` end to end), `Repo`, and
`PullRequest`[^app-ts]. `Repo` is a **value** service resolved per call by
the resource methods that need it; capturing it at layer-construction time
would make `Repo.provide` silently do nothing[^app-ts]. `client` construction
uses `Layer.orDie` because a missing token surfaces as core's `ConfigError`
at construction time — a misconfiguration, not a wire failure, and there is
nothing a running action can do about it[^app-ts].

## `format.ts`: the single pure rendering surface

`src/format.ts` is the action's one rendering surface — pure, service-free,
and importable by a test without a layer[^format-ts]. Keeping every
human-readable string in one module is what stops the same fact from being
worded two different ways in a log line and a summary panel[^format-ts].
`renderJobSummary` builds a real markdown tree via `GitHubMarkdown.heading`
and `GitHubMarkdown.table` rather than joining strings by hand[^format-ts],
so a `|` character arriving in a branch name or PR title is escaped by the
table serializer instead of corrupting the rendered table. The panel has
three sections — a phase/reason/should-continue table, a Git-context table
(target/release branch, on-main, on-release, is-release-commit, merged PR
number when present), and a changesets table (has-changesets, count, release
type when non-empty, affected packages when any) — driven entirely off the
pipeline's `PhaseDetectionResult`, `ParseChangesetsResult`, and
`ActionInputs`[^format-ts]. Writing the summary is a separate concern, owned
by `steps/write-summary.ts`, which calls `ActionOutputs.summary(...)` with
this module's output and fails the job (as a defect, via `Effect.orDie`) if
the write fails[^write-summary-ts].

## Schema modules

`src/schema/domain.ts` defines the domain shapes with `effect`'s `Schema`:
`WorkflowPhase` (the five-way literal union), `BumpType` (`major | minor |
patch`), `ChangesetRelease`, `ParsedChangeset`, and
`PhaseDetectionResult`[^domain-ts]. `mergedReleasePRNumber` on
`PhaseDetectionResult` is `Schema.optional` rather than nullable because it
is simply absent whenever no merged release PR was identified — the common
case[^domain-ts].

`src/schema/inputs.ts` declares `INPUT_NAMES` (the frozen four-input
contract: `token`, `release-branch`, `target-branch`, `release-prefix`) and
`INPUT_DEFAULTS`, mirrored byte-for-byte from `action.yml`[^inputs-ts].
`token` appears in `INPUT_NAMES` because the manifest declares it, but is
deliberately absent from the decoded `ActionInputs` interface: it is
consumed directly by `GitHubClient.layerFromConfig` in `layers/app.ts`, so no
program code ever sees it in plaintext[^inputs-ts]. `readInputs` decodes
`release-branch` and `target-branch` through `ActionInput.string(...).pipe(
Config.withDefault(...))`, but `release-prefix` is read through
`Config.option(ActionInput.string("release-prefix")).pipe(Config.map(
Option.getOrElse(() => "")))` instead (`src/schema/inputs.ts:109`),
specifically so an explicit empty value survives as `""` rather than being
collapsed back to the manifest default[^inputs-ts].

`src/schema/outputs.ts` declares `OUTPUT_NAMES` (the frozen ten-output
contract, in emission order) and `DISABLED_OUTPUTS`, the all-disabled
default every fold starts from[^outputs-ts]. `foldOutputs` is a pure function
that always produces a complete `OutputValues` record, so no caller can emit
a partial contract[^outputs-ts]. `emitOutputs` is the single emitter: it
iterates `OUTPUT_NAMES` and calls `outputs.set(name, values[name])` for each,
so a name added to the tuple is emitted without a second edit and no name can
be written twice by a copy-paste slip[^outputs-ts].

## Step modules

- **`steps/detect-phase.ts`** — `detectPhase({ inputs })` returns
  `Effect.Effect<PhaseDetectionResult, never, DetectPhaseRequirements>`,
  where `DetectPhaseRequirements = ActionEnvironment | PullRequest |
  Repo`[^detect-phase-ts]. It owns the PR-association query
  (`pullRequests.listAssociatedWithCommit(github.sha)`), the priority-ordered
  phase decision tree, and the scheduled retry (`ReleasePRNotVisibleYet`,
  caught internally so the error channel stays `never`)[^detect-phase-ts].
- **`steps/parse-changesets.ts`** — `parseChangesets()` reads `.changeset/`
  through core's `FileSystem` service rather than `node:fs`, and owns
  `ChangesetParseError`, the action's one declared typed
  error[^parse-changesets-ts]. A missing `.changeset` directory is not a
  failure — it is the empty result; an unreadable one propagates the typed
  error and fails the job[^parse-changesets-ts].
- **`steps/write-summary.ts`** — `writeSummary(options)` calls
  `renderJobSummary` and writes the result through
  `ActionOutputs.summary(...).pipe(Effect.orDie)`[^write-summary-ts].

## Build system

The build uses `@savvy-web/github-action-builder`, an rsbuild-based bundler
configured in `action.config.ts`: a single `main` entry at `src/main.ts`,
minified, with `xmlbuilder2`, `libxmljs2`, and `ajv-formats-draft2019`
excluded[^action-config-ts]. It bundles `src/main.ts` into `dist/main.js`
with every dependency inlined, so the action executes at runtime with no
`node_modules` resolution — `dist/` is committed, and `runs.using: node24`
in `action.yml` is the entry point GitHub Actions invokes. `persistLocal` is
configured but disabled by default (`enabled: false`, targeting
`.github/actions/local`)[^action-config-ts].

[^main-ts]: ../../src/main.ts
[^program-ts]: ../../src/program.ts
[^app-ts]: ../../src/layers/app.ts
[^format-ts]: ../../src/format.ts
[^domain-ts]: ../../src/schema/domain.ts
[^inputs-ts]: ../../src/schema/inputs.ts
[^outputs-ts]: ../../src/schema/outputs.ts
[^detect-phase-ts]: ../../src/steps/detect-phase.ts
[^parse-changesets-ts]: ../../src/steps/parse-changesets.ts
[^write-summary-ts]: ../../src/steps/write-summary.ts
[^action-config-ts]: ../../action.config.ts
</content>
