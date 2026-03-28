---
status: current
module: silk-router-action
category: testing
created: 2026-03-26
updated: 2026-03-28
last-synced: 2026-03-28
---

# Testing Strategy

Three-layer testing approach: unit tests via Vitest, local integration tests via Vitest + execa, and CI integration tests on GitHub Actions runners.

## Test Directory Structure

Tests follow the @savvy-web/vitest discovery convention:

```text
__test__/
  errors/errors.test.ts              Error type construction
  schemas/phase.test.ts              Phase literal validation
  schemas/trigger.test.ts            Trigger struct encode/decode
  schemas/registry.test.ts           Registry + RegistryTarget
  schemas/release-plan.test.ts       ReleasePlan round-trip
  services/phase-resolver.test.ts    All 9 phase detection cases
  services/github-event-context.test.ts  Push + PR trigger contexts
  services/pull-request-detector.test.ts  Release commit detection
  services/changeset-reader.test.ts  Read + config with Option
  services/tag-strategy-resolver.test.ts  Single vs scoped
  services/target-resolver.test.ts   NPM, multi-target, non-publishable
  services/release-plan-assembler.test.ts  Full plan assembly
  services/summary-writer.test.ts    Markdown generation
  program.test.ts                    Full routing pipeline integration
  utils/test-logger.ts               TestLogCollector + silentLoggerLayer
  integration/
    act-workflow.int.test.ts         6 scenarios via runAction helper
    utils/setup-execa.ts             Runs dist/main.js with mocked env
    fixtures/                        (excluded from discovery)
```

## Vitest Multi-Project

`VitestConfig.create()` automatically discovers two project kinds based on filename patterns:

- `silk-router-action:unit` -- files matching `*.test.ts` (excludes `*.int.test.ts`)
- `silk-router-action:int` -- files matching `*.int.test.ts`

Run specific projects:

```bash
pnpm vitest run --project silk-router-action:unit   # 57 unit tests
pnpm vitest run --project silk-router-action:int    # 6 integration tests
pnpm vitest run                                     # all 63 tests
```

## Unit Tests (57 tests)

### Pattern: Effect Layer Substitution

Every service exports a `*Test` namespace with a `layer()` factory:

```typescript
export const PullRequestDetectorTest = {
  layer: (config: { isReleaseCommit: boolean }) =>
    Layer.succeed(PullRequestDetector, {
      // Real signature: (sha, releaseBranch, targetBranch) => Effect<boolean>
      // Test layer ignores args and returns configured value
      isReleaseCommit: () => Effect.succeed(config.isReleaseCommit),
    }),
};
```

No `vi.mock()` anywhere. All testing is done through Effect's dependency injection.

### Test Data: Schema.Class Instances

```typescript
new SimpleChangeset({ id: "happy-dogs", summary: "Add feature", releases: [...] })
new PhaseInput({ trigger, targetBranch: "main", releaseBranch: "changeset-release/main", ... })
new WorkspacePackageInfo({ name: "pkg", version: "1.0.0", path: "." })
```

### Program Integration Tests

Compose a full test layer from individual service test layers:

```typescript
const makeTestLayer = (opts) => {
  const assemblerLayer = ReleasePlanAssemblerLive.pipe(
    Layer.provide(Layer.mergeAll(
      ChangesetReaderTest.layer({...}),
      TargetResolverTest.layer({...}),
      TagStrategyResolver.Live,
    )),
  );
  return Layer.mergeAll(
    GitHubEventContextTest.layer(opts.trigger),
    PullRequestDetectorTest.layer({ isReleaseCommit: false }),
    assemblerLayer,
    PhaseResolver.Live,
    SummaryWriterTest.captureLayer(),
    silentLoggerLayer,
  );
};
```

### Test Logger Utilities

`__test__/utils/test-logger.ts` provides:

- **TestLogCollector** -- captures log entries into an array for assertions
- **silentLoggerLayer** -- suppresses all log output (default in program tests)

```typescript
// Capture logs for assertions
const logs = new TestLogCollector();
const layer = Layer.mergeAll(myLayer, testLoggerLayer(logs));
await Effect.runPromise(program.pipe(Effect.provide(layer)));
expect(logs.messages).toContain("Phase: silk-branch");

// Suppress logs
const layer = Layer.mergeAll(myLayer, silentLoggerLayer);
```

### Config

- `vitest.config.ts` uses `VitestConfig.create()` from `@savvy-web/vitest`
- Coverage thresholds disabled: `coverage: VitestConfig.COVERAGE_LEVELS.none`
- Agent reporter disabled: `agentReporter: false`
- `vitest.setup.ts` loads `.act.secrets` into `process.env` for integration tests

## Local Integration Tests (6 tests)

Run the built action (dist/main.js) as a real node process with mocked GitHub env vars. Uses `execa` to spawn the process, not Effect layer substitution.

### runAction Helper

`__test__/integration/utils/setup-execa.ts` provides `runAction(opts)`:

```typescript
const result = await runAction({
  fixture: "pnpm-basic-changesets",   // under .github/workflows/__fixtures__/pnpm/
  event: "push",                      // GITHUB_EVENT_NAME
  ref: "refs/heads/main",             // GITHUB_REF
  sha: "abc123test",                  // GITHUB_SHA
  eventPayload: "push-main.json",     // under __fixtures__/events/
});
expect(result.exitCode).toBe(0);
expect(result.outputs["next-phase"]).toBe("silk-branch");
```

The helper:

1. Sets all GITHUB env vars required by ActionEnvironment (15 vars)
2. Points GITHUB_WORKSPACE at the fixture directory
3. Creates empty GITHUB_OUTPUT/STATE/ENV/PATH files
4. Runs `node dist/main.js` via execa
5. Runs `node dist/post.js` afterwards
6. Parses outputs from GITHUB_OUTPUT file
7. Cleans up temp files

### Credential Loading

`vitest.setup.ts` loads `.act.secrets` into `process.env` using `String.matchAll()`. Integration tests skip gracefully without credentials:

```typescript
const hasCredentials = Boolean(process.env.APP_ID && process.env.APP_PRIVATE_KEY);
describe.skipIf(!hasCredentials)("silk-router integration", () => { ... });
```

### Test Matrix

| Test | Fixture | Mock Event | Expected Phase |
| ---- | ------- | ---------- | -------------- |
| Push to feature branch | pnpm-basic | push, refs/heads/feat/some-feature | skip |
| Push to main with changesets | pnpm-basic-changesets | push, refs/heads/main | silk-branch |
| Push to main no changesets | pnpm-basic | push, refs/heads/main | skip |
| Push to release branch | pnpm-basic-changesets | push, refs/heads/changeset-release/main | silk-validate |
| Release PR merged | pnpm-basic | pull_request + pr-merged-release.json | close-issues |
| Release PR open | pnpm-basic | pull_request + pr-open-release.json | silk-validate |

## CI Integration Tests (GitHub Actions)

6 matrix entries in `.github/workflows/test.yml` testing the same scenarios as local integration tests, but on real GitHub runners with real secrets.

### test-fixture Composite Action

`.github/actions/test-fixture/action.yml` orchestrates:

1. Validate fixture directory exists
2. Run dist/main.js via `node` (not `uses:`) with mocked GITHUB env vars
3. Point GITHUB_WORKSPACE at fixture directory
4. Run dist/post.js
5. Verify outputs against expected-phase and expected-reason-contains

Key: uses `run:` step with `node` instead of `uses:` step because `uses:` doesn't pick up env var overrides from prior steps.

### Fixture Directory Structure

Single source of truth at `.github/workflows/__fixtures__/`:

```text
.github/workflows/__fixtures__/
  events/                           Event payload JSON fixtures
    push-main.json
    push-release-branch.json
    push-feature.json
    pr-merged-release.json
    pr-open-release.json
  pnpm/                             Self-contained workspace fixtures
    pnpm-basic/                     Single package, no changesets
    pnpm-basic-changesets/          Single package with .changeset/
    pnpm-basic-monorepo/            Multi-package, no changesets
```

Fixtures must be self-contained: package.json name must match changeset references, pnpm-workspace.yaml must be present.

### CI Workflow

```yaml
jobs:
  unit-tests:      # Checkout -> workflow-runtime-action -> typecheck + lint + test
  integration-test: # Checkout -> workflow-runtime-action -> build -> test-fixture (x6)
```

`savvy-web/workflow-runtime-action@main` handles Node.js, pnpm, and biome setup from devEngines and biome.jsonc.

### Security

- Secrets (APP_ID, APP_PRIVATE_KEY) are NOT exposed to fork PRs
- `pull_request` trigger runs fork code in sandboxed context without secrets
- Integration tests fail on missing secrets (Config.string fails on empty input)

## Local Testing with act

### Configuration

`.actrc`:

```text
--container-architecture linux/amd64
-W .github/workflows/act-test.yml
--secret-file .act.secrets
```

`.act.secrets` (gitignored) -- uses actual multiline PEM, not escaped newlines:

```text
APP_ID=12345
APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEo...actual newlines here...
-----END RSA PRIVATE KEY-----"
APP_CLIENT_ID=Iv2...
APP_CLIENT_SECRET=c71...
```

### Limitations

- act's default runner images ship Node.js 16; action uses node24
- PEM key must use actual newlines (not `\n` escapes) -- act's godotenv parser doesn't expand them
- `ACT` env var is set automatically -- can use `if: ${{ !env.ACT }}` to skip steps
