# src/CLAUDE.md

Source code architecture for silk-router-action.

**Parent:** [Root CLAUDE.md](../CLAUDE.md)

**For full architecture details:**
-> `@../.claude/design/silk-router-action/architecture.md`

Load when working on service wiring, layer composition, or entry points.

## Architecture

Effect-TS action with composable service layers. Phase detection + release plan computation for the Silk deployment pipeline.

**Entry points:**

- `main.ts` -- Action.run with GitHubApp.withToken, runs program, sets outputs
- `post.ts` -- No-op (token revoked by withToken's acquireUseRelease)
- `program.ts` -- Core routing pipeline, fully testable via layer substitution

**Services** (in `services/`):

- `github-event-context.ts` -- Reads GITHUB_* env vars and event payload
- `phase-resolver.ts` -- Pure decision logic: trigger + state -> phase + reason
- `pull-request-detector.ts` -- Two-strategy release commit detection via API
- `changeset-reader.ts` -- Reads .changeset/ via @changesets/read
- `tag-strategy-resolver.ts` -- Single vs scoped from workspace structure
- `target-resolver.ts` -- Resolves publishConfig to registry targets
- `release-plan-assembler.ts` -- Orchestrates changeset + target + tag strategy
- `summary-writer.ts` -- Generates job summary markdown

**Schemas** (in `schemas/`):

- `phase.ts` -- Schema.Literal for next-phase enum
- `trigger.ts` -- Trigger context (event, branch, pr_number, is_merged, sha)
- `registry.ts` -- Registry, RegistryTarget, NpmParams, JsrParams
- `release-plan.ts` -- ReleasePlan, ReleaseEntry, BumpType, TagStrategy

**Layers** (in `layers/`):

- `app.ts` -- AppLayer (all services wired) and PostLayer (GitHubApp only)

## Coding Standards

- Use `Schema.Class` for domain types (not interface/type)
- Use `Context.Tag` + `Layer.effect`/`Layer.succeed` for services
- Every service exports `*Test.layer()` for testing
- `Config.redacted()` for secrets (not deprecated `Config.secret`)
- `.js` extensions on all imports
- Biome enforces import ordering and `interface` over `type`
- No `@actions/core` -- use `@savvy-web/github-action-effects` services
- No `vi.mock()` -- pure layer substitution for all tests

## Error Handling

- `Schema.TaggedError` for domain errors
- `Effect.mapError` at service boundaries to convert error types
- `Effect.catchAll` with safe defaults for non-critical failures
- Retry only 5xx errors (not 4xx) via `while` filter in `Effect.retry`
