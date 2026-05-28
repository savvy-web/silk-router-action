# @savvy-web/workflow-control-action

## 1.0.1

### Bug Fixes

* [`907b088`](https://github.com/savvy-web/silk-router-action/commit/907b08818c3a23111b93d259dbcf4392ec28caee) Bump `@savvy-web/github-action-effects` to `^2.0.1` and rebuild `dist/main.js` against it. The library's `WebhookPayload` schema now accepts `null` in `IssueRef.body`, `IssueRef.html_url`, `Repository.full_name`, and `Repository.html_url`, matching what GitHub actually sends when a PR has no description. Without this, every `pull_request` event whose body or url was `null` aborted the action with `[ActionEnvironmentError] Event payload did not match the expected shape: WebhookPayload — Expected string, actual null`.

## 1.0.0

### Breaking Changes

* [`1afebd7`](https://github.com/savvy-web/silk-router-action/commit/1afebd7df93a3810e1bb7ec051bd53fe5bb0bb8d) Repository renamed from `savvy-web/workflow-control-action` to `savvy-web/silk-router-action`. The GitHub redirect keeps old `uses:` references resolving, but consumers should update to `savvy-web/silk-router-action@v1` once the v1 alias tag is in place. Action inputs and outputs are byte-identical with `0.0.4` — no workflow-level changes are required beyond updating the `uses:` reference.

### Refactoring

* [`1afebd7`](https://github.com/savvy-web/silk-router-action/commit/1afebd7df93a3810e1bb7ec051bd53fe5bb0bb8d) Standardized on `@savvy-web/github-action-effects` v2. Every direct `@actions/*` and `@octokit/*` dependency is dropped in favor of the library's services.
* Restructured `src/` to the canonical `services/` + `errors/` + `schemas/` + `layers/` layout with a single `main.ts` entry (no `pre.ts` / `post.ts`).
* Emoji-prefixed `logger.*` calls replaced by `Step.groupStep` + plain `Effect.log*` lines.
* `ts-markdown` summary builder replaced by `GithubMarkdown.*` helpers from the library.
* Inputs read via `Config.string`; outputs written via `ActionOutputs.set`.
* `GitHubClientLive.fromEnv()` reads `GITHUB_TOKEN` (with `INPUT_TOKEN` bridged in by `Action.run`).

### Tests

* [`1afebd7`](https://github.com/savvy-web/silk-router-action/commit/1afebd7df93a3810e1bb7ec051bd53fe5bb0bb8d) Migrated from `vi.mock("@actions/*")` patterns to library `<Service>Test.layer(state)` from `@savvy-web/github-action-effects/testing`. Tests are co-located at `src/**/*.test.ts`; the `__test__/` directory is gone.

### Build System

* [`1afebd7`](https://github.com/savvy-web/silk-router-action/commit/1afebd7df93a3810e1bb7ec051bd53fe5bb0bb8d) Switched from `@vercel/ncc` to `@savvy-web/github-action-builder` (rsbuild-based) configured via `action.config.ts`.

## 0.0.4

### Dependencies

* [`5c5fc9c`](https://github.com/savvy-web/workflow-control-action/commit/5c5fc9cc2e049a784a303454068cf1f433895851) @savvy-web/changesets: ^0.1.1 → ^0.4.1
* @savvy-web/commitlint: ^0.3.3 → ^0.4.0
* @savvy-web/github-action-builder: ^0.1.4 → ^0.2.0
* @savvy-web/lint-staged: ^0.4.5 → ^0.5.0
* @savvy-web/vitest: ^0.1.0 → ^0.2.0

## 0.0.3

### Bug Fixes

* [`7bcfff5`](https://github.com/savvy-web/workflow-control-action/commit/7bcfff5f608fa59ef6e52df9ce1d78388aeb3cfc) Supports @savvy-web/vitest

## 0.0.2

### Patch Changes

* 97f53ad: ## Features
  * Support for @savvy-web/changesets
* 04093be: ## Dependencies
  * @savvy-web/commitlint: ^0.3.1 → ^0.3.2
  * @savvy-web/github-action-builder: ^0.1.0 → ^0.1.2
  * @savvy-web/lint-staged: ^0.3.1 → ^0.4.0

## 0.0.1

### Patch Changes

* 8896358: Standardize the build with `@savvy-web/github-action-builder`
