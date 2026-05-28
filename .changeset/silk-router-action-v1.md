---
"@savvy-web/silk-router-action": major
---

## Breaking Changes

- Repository renamed from `savvy-web/workflow-control-action` to `savvy-web/silk-router-action`. The GitHub redirect keeps old `uses:` references resolving, but consumers should update to `savvy-web/silk-router-action@v1` once the v1 alias tag is in place. Action inputs and outputs are byte-identical with `0.0.4` — no workflow-level changes are required beyond updating the `uses:` reference.

## Refactoring

- Standardized on `@savvy-web/github-action-effects` v2. Every direct `@actions/*` and `@octokit/*` dependency is dropped in favor of the library's services.
- Restructured `src/` to the canonical `services/` + `errors/` + `schemas/` + `layers/` layout with a single `main.ts` entry (no `pre.ts` / `post.ts`).
- Emoji-prefixed `logger.*` calls replaced by `Step.groupStep` + plain `Effect.log*` lines.
- `ts-markdown` summary builder replaced by `GithubMarkdown.*` helpers from the library.
- Inputs read via `Config.string`; outputs written via `ActionOutputs.set`.
- `GitHubClientLive.fromEnv()` reads `GITHUB_TOKEN` (with `INPUT_TOKEN` bridged in by `Action.run`).

## Build System

- Switched from `@vercel/ncc` to `@savvy-web/github-action-builder` (rsbuild-based) configured via `action.config.ts`.

## Tests

- Migrated from `vi.mock("@actions/*")` patterns to library `<Service>Test.layer(state)` from `@savvy-web/github-action-effects/testing`. Tests are co-located at `src/**/*.test.ts`; the `__test__/` directory is gone.
