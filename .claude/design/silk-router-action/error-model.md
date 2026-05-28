---
status: current
module: silk-router-action
category: architecture
created: 2026-05-28
updated: 2026-05-28
last-synced: 2026-05-28
completeness: 88
related:
  - silk-router-action/architecture.md
dependencies: []
---

# Error model and effects library adoption

## Overview

This doc covers two tightly coupled design decisions that were introduced together in v2: the `Schema.TaggedError` error model and the adoption of `@savvy-web/github-action-effects` as the exclusive Actions runtime abstraction layer. These decisions together are what makes the codebase testable without process environment mutations or module mocking.

## Current state

All error types live in `src/errors/errors.ts`. All Actions runtime access (inputs, outputs, GitHub context, Octokit) goes through `@savvy-web/github-action-effects` service interfaces. No `@actions/*` packages are imported directly anywhere in `src/`.

## Error model

### Schema.TaggedError classes

Each failure mode is a `Schema.TaggedError` subclass. There are three:

- `PhaseDetectionError` — phase detection failed (operation, reason, optional cause)
- `ChangesetParseError` — a changeset file could not be parsed (file, reason, optional cause)
- `SummaryWriteError` — the job summary could not be written (reason, optional cause)

See `src/errors/errors.ts` for the exact field shapes.

Each class has a computed `get message(): string` getter that formats a human-readable description from its fields. This means `error.message` works as expected anywhere a standard Error is expected, without a separate formatting step.

### ActionError union

```typescript
export type ActionError = PhaseDetectionError | ChangesetParseError | SummaryWriteError;
```

The union exists to make exhaustive `Effect.catchTag` handling possible. When a caller handles all members of `ActionError`, TypeScript confirms at compile time that no branch is missing.

### Why Schema.TaggedError instead of plain Error subclasses?

`Schema.TaggedError` gives each error class a `_tag` discriminant field automatically. This is what powers `Effect.catchTag("PhaseDetectionError", ...)` — the runtime dispatches on the literal string tag rather than an `instanceof` check. The result is that tagged errors survive serialization boundaries (e.g., across fiber boundaries or `Effect.runPromise` calls) and remain correctly identified even when the class prototype chain is unavailable.

The Schema integration also means error fields are schema-validated on construction: passing a zero-length string to `reason` (declared as `Schema.String.pipe(Schema.minLength(1))`) produces a schema error rather than a silently bad error object at runtime.

## @savvy-web/github-action-effects adoption

### What the library provides

`@savvy-web/github-action-effects` is an Effect-native wrapper around the GitHub Actions runtime. It exposes services for everything the action needs:

| Service | Production layer | Test layer |
| :------ | :--------------- | :--------- |
| `ActionEnvironment` | `ActionEnvironmentLive` | `ActionEnvironmentTest.layer(env, payload)` |
| `ActionOutputs` | `ActionOutputsLive` | `ActionOutputsTest.layer(state)` |
| `GitHubClient` | `GitHubClientLive.fromEnv()` | hand-rolled `Layer.succeed(GitHubClient, {...})` |
| `Step` | (module, not a service) | same module in tests |
| `GithubMarkdown` | (module, not a service) | same module in tests |

`Action.run(program, { layer })` is the entry point that installs the Effect runtime, wires the ConfigProvider for `INPUT_*` env vars and bridges `INPUT_TOKEN` → `GITHUB_TOKEN` before the layer starts.

### Why drop direct @actions/* imports?

The v1 implementation imported `@actions/core`, `@actions/github` and `@octokit/rest` directly. This created two problems:

1. **Tests required process.env mutation.** Every test that exercised phase detection or output setting had to set `process.env.GITHUB_TOKEN`, `process.env.GITHUB_EVENT_NAME`, etc., and clean them up in `afterEach`. Race conditions and test-order dependencies were a constant risk.
2. **Mocking was fragile.** `vi.mock("@actions/core")` replaces the module at the loader level; any change to how the module was imported (named vs. default, re-exports) could silently break mocks.

With service layers, tests provide `ActionEnvironmentTest.layer(env, payload)` which injects arbitrary context into the Effect runtime without touching the process environment at all. The production code and test code run through exactly the same `program` — only the layer differs.

### Token plumbing

The action declares a `token` input in `action.yml`. `Action.run` bridges `INPUT_TOKEN` → `GITHUB_TOKEN` before the layer starts. `GitHubClientLive.fromEnv()` then reads `GITHUB_TOKEN` to authenticate the Octokit client. This means the token never appears in `program.ts` — it flows through the runtime bridge automatically and is never a `Config.redacted(...)` value that could be accidentally logged.

### Library-routed Octokit

The `GitHubClient` service exposes a `rest<T>(name, fn)` method. The caller provides a typed function `(octokit) => Promise<SomeResponse>` and receives `T` back. The library owns the Octokit instance, handles authentication and manages the HTTP client Layer (`NodeHttpClient`). This keeps all Octokit wiring out of the application code and makes the API call surface small enough to mock with a hand-rolled Layer:

```typescript
Layer.succeed(GitHubClient, {
  repo: Effect.succeed({ owner: "acme", repo: "test" }),
  rest: (_name, fn) => Effect.tryPromise(() => fn(mockOctokit)),
})
```

## Rationale

### Why not use Effect.catchAllCause everywhere?

`Effect.catchAllCause` is used only at the API call site inside `PhaseDetector`, where losing the error is an acceptable trade-off (falling back to commit-message detection is safe). The rest of the program propagates typed errors through the `ActionError` channel so callers can handle them exhaustively. Using `catchAllCause` broadly would discard type information and make it impossible to know at compile time whether all failure modes are handled.

### Why computed message getters instead of static strings?

The `get message()` getter interpolates the error's fields into the message string at read time. This ensures the message always reflects the actual field values rather than a snapshot taken at construction time, and avoids duplicating the format string between the constructor and the message.

## Related documentation

- Overall action architecture: `silk-router-action/architecture.md`
- Phase detection service: `src/services/phase-detector.ts`
- Error definitions: `src/errors/errors.ts`
