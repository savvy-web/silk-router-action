---
status: current
module: silk-router-action
category: patterns
created: 2026-03-26
updated: 2026-03-28
last-synced: 2026-03-28
---

# Effect Best Practices

Patterns and lessons learned building silk-router with Effect-TS.

## Schema.Class Over Manual Types

**Always use Schema.Class for domain data shapes.** Never manually declare `interface` or `type` for data that flows through the system.

```typescript
// GOOD: Schema.Class gives types, encoding, decoding, comparison, construction
export class PhaseInput extends Schema.Class<PhaseInput>("PhaseInput")({
  trigger: Trigger,
  targetBranch: Schema.String,
  isReleaseCommit: Schema.Boolean,
}) {}

const input = new PhaseInput({ trigger, targetBranch: "main", isReleaseCommit: false });

// BAD: Manual interface -- no encoding, no validation, Biome complains about type vs interface
export interface PhaseInput { trigger: TriggerType; targetBranch: string; }
```

**Why**: Schema.Class provides validation, serialization, structural equality, and type inference in one declaration. It also avoids Biome's `useConsistentTypeDefinitions` rule (which forces `interface` over `type`).

## Service Pattern

Every service follows this structure:

```typescript
// 1. Define service with Context.Tag
export class MyService extends Context.Tag("silk-router/MyService")<
  MyService,
  {
    readonly method: (arg: T) => Effect.Effect<R, E>;
  }
>() {
  // 2a. Static Live layer for pure services (no deps)
  static readonly Live: Layer.Layer<MyService> = Layer.succeed(MyService, {
    method: (arg) => Effect.succeed(compute(arg)),
  });
}

// 2b. Separate Live layer for services with dependencies
export const MyServiceLive = Layer.effect(
  MyService,
  Effect.gen(function* () {
    const dep = yield* SomeDependency;
    return {
      method: (arg) => dep.doSomething(arg),
    };
  }),
);

// 3. Test layer factory
export const MyServiceTest = {
  layer: (config: { result: R }) =>
    Layer.succeed(MyService, {
      method: () => Effect.succeed(config.result),
    }),
};
```

**When to use which Live pattern:**

- `static readonly Live` on the Tag class -- for pure services with no dependencies (PhaseResolver, TagStrategyResolver)
- Separate `*Live` export -- for services that need to `yield*` dependencies (PullRequestDetectorLive, ReleasePlanAssemblerLive)

## Layer Composition

```typescript
// Library layers (from npm packages)
const libraryLayers = Layer.mergeAll(
  GitHubClientLive,
  GitHubAppLive.pipe(Layer.provide(OctokitAuthAppLive)),
);

// Domain layers (with their dependencies wired)
const domainLayers = Layer.mergeAll(
  GitHubEventContextLive,
  PullRequestDetectorLive.pipe(Layer.provide(GitHubClientLive)),
  ReleasePlanAssemblerLive.pipe(Layer.provide(
    Layer.mergeAll(ChangesetReaderLive, TargetResolverLive, TagStrategyResolver.Live),
  )),
  PhaseResolver.Live,
  SummaryWriterLive,
);

// Combine: domain layers get access to library layers
export const AppLayer = Layer.provideMerge(domainLayers, libraryLayers);
```

**Key**: `Action.run` provides CoreServices (ActionLogger, ActionOutputs, ActionEnvironment, ActionState) automatically. Never include these in AppLayer.

## Token Lifecycle

`GitHubApp.withToken` uses `Effect.acquireUseRelease`:

```typescript
yield* ghApp.withToken(appId, Redacted.value(privateKey), (token) =>
  Effect.gen(function* () {
    process.env.GITHUB_TOKEN = token;  // Bridge to GitHubClientLive
    // ... do work with token ...
  }),
);
// Token is automatically revoked here, even on failure
```

**Do NOT:**

- Save token to ActionState for post-step revocation
- Manually call revokeToken
- Create a separate post.ts revocation step

The `acquireUseRelease` pattern handles all of this. Post.ts should be a no-op.

## Error Handling

### Schema.TaggedError for Domain Errors

```typescript
export class PhaseDetectionError extends Schema.TaggedError<PhaseDetectionError>()(
  "PhaseDetectionError",
  { reason: NonEmptyString, sha: Schema.String },
) {
  get message(): string {
    return `Phase detection failed for ${this.sha}: ${this.reason}`;
  }
}
```

### Error Mapping at Service Boundaries

When a service wraps another service whose error type doesn't match:

```typescript
// GitHubEventContextLive wraps ActionEnvironment
const github = yield* env.github.pipe(
  Effect.mapError((e) => new TriggerContextError({
    reason: `Environment error: ${e.reason}`,
  })),
);
```

### Graceful Degradation Over Hard Failure

For non-critical operations, catch errors and provide safe defaults:

```typescript
isReleaseCommit = yield* detector.isReleaseCommit(sha).pipe(
  Effect.retry({ ... }),
  Effect.catchAll((error) =>
    Effect.gen(function* () {
      yield* Effect.logWarning(`Defaulting to false: ${error}`);
      return false;
    }),
  ),
);
```

## Retry Strategy

Only retry on transient server errors, not client errors:

```typescript
Effect.retry({
  schedule: Schedule.exponential("2 seconds").pipe(
    Schedule.compose(Schedule.recurs(3)),
    Schedule.union(Schedule.spaced("3 seconds")),
  ),
  // 422 = invalid SHA, don't retry. 5xx = transient, retry.
  while: (error) =>
    "status" in error && typeof error.status === "number" && error.status >= 500,
})
```

**Why**: A 422 for an invalid SHA will never succeed on retry. Only 5xx and timeouts are transient. Without this filter, retries add ~30s of wasted time.

## Config API

```typescript
Config.string("app-id")              // Required string, reads INPUT_APP-ID
Config.redacted("private-key")       // Secret (masked in logs), reads INPUT_PRIVATE-KEY
Config.string("target-branch").pipe(
  Config.withDefault("main"),        // Optional with default
)
Config.boolean("dry-run").pipe(     // illustrative -- not yet in codebase
  Config.withDefault(false),
)
```

**Note**: `Config.secret` is deprecated. Use `Config.redacted` instead. Access the value with `Redacted.value(secret)`.

## Test Logging

Suppress Effect log output in unit tests to keep vitest output clean:

```typescript
import { silentLoggerLayer } from "./utils/test-logger.js";

const layer = Layer.mergeAll(myServiceLayer, silentLoggerLayer);
```

Capture logs for assertions when testing log output matters:

```typescript
import { TestLogCollector, testLoggerLayer } from "./utils/test-logger.js";

const logs = new TestLogCollector();
const layer = Layer.mergeAll(myServiceLayer, testLoggerLayer(logs));
await Effect.runPromise(program.pipe(Effect.provide(layer)));
expect(logs.messages).toContain("Phase: silk-branch");
```

## Biome Compatibility

Biome's `noAssignInExpressions` rule rejects `while ((match = regex.exec(content)))`. Use `matchAll` instead:

```typescript
// Biome rejects this:
while ((match = regex.exec(content)) !== null) { ... }

// Use this:
for (const match of content.matchAll(regex)) { ... }
```

Biome's `useConsistentTypeDefinitions` forces `interface` over `type` for object shapes. Prefer `Schema.Class` which avoids the issue entirely since it produces a class, not a type alias.

## Commit Message Conventions

Avoid double-underscore paths in commit messages. The commitlint `silk/body-no-markdown` rule treats `__text__` as markdown bold formatting:

```text
# Bad: commitlint rejects __test__/ as bold markdown
refactor: move tests to __test__/ directory

# Good: describe without literal path
refactor: restructure tests for vitest discovery
```

## Import Conventions

```typescript
// .js extensions required for ESM
import { Phase } from "./schemas/phase.js";

// Biome enforces import ordering:
// 1. External packages (@savvy-web/..., effect)
// 2. Internal modules (./services/..., ../errors/...)
// 3. Type imports (import type { ... })
```
