# @savvy-web/workflow-control-action

## 1.1.0

### Features

* [`1e311b4`](https://github.com/savvy-web/silk-router-action/commit/1e311b487836ae0b1329352d0a2bf0b93c914678) ### Retry When a Commit Looks Like a Release

Add a `release-prefix` input (default `release:`). When a push to the target branch carries a commit whose message starts with the prefix but GitHub has not yet associated the merged release PR with the commit, the router now retries detection up to 3 times, 10 seconds apart, before falling back to branch-management. This fixes the race where an auto-merged release PR was misrouted to the branch-management phase and had to be re-run manually. The prefix only gates the retry; the GitHub API remains the sole authority for `is_release_commit`.

### Dependencies

* | [`1e311b4`](https://github.com/savvy-web/silk-router-action/commit/1e311b487836ae0b1329352d0a2bf0b93c914678) | Dependency    | Type    | Action | From    | To |
  | :----------------------------------------------------------------------------------------------------------- | :------------ | :------ | :----- | :------ | -- |
  | @savvy-web/github-action-effects                                                                             | dependency    | updated | ^2.1.4 | ^2.2.1  |    |
  | @savvy-web/github-action-builder                                                                             | devDependency | updated | ^0.7.9 | ^0.7.11 |    |
  | @savvy-web/silk                                                                                              | devDependency | updated | ^1.1.0 | ^1.2.0  |    |
  | @savvy-web/vitest                                                                                            | devDependency | updated | ^1.5.0 | ^1.5.1  |    |

## 1.0.5

### Dependencies

* | [`01b0b83`](https://github.com/savvy-web/silk-router-action/commit/01b0b83cba71224ed9f3fb0d30c8cd139b22db9e) | Dependency    | Type    | Action | From   | To |
  | :----------------------------------------------------------------------------------------------------------- | :------------ | :------ | :----- | :----- | -- |
  | @savvy-web/github-action-effects                                                                             | dependency    | updated | ^2.1.3 | ^2.1.4 |    |
  | @savvy-web/github-action-builder                                                                             | devDependency | updated | ^0.7.6 | ^0.7.8 |    |
  | @savvy-web/silk                                                                                              | devDependency | updated | ^0.4.0 | ^0.4.2 |    |
  | @savvy-web/vitest                                                                                            | devDependency | updated | ^1.4.0 | ^1.5.0 |    |

- | [`b8ef8c2`](https://github.com/savvy-web/silk-router-action/commit/b8ef8c269e581f252156e35c64f1f581a7029f2d) | Dependency    | Type    | Action   | From     | To |
  | :----------------------------------------------------------------------------------------------------------- | :------------ | :------ | :------- | :------- | -- |
  | @effect/platform-node                                                                                        | dependency    | updated | ^0.106.0 | ^0.107.0 |    |
  | effect                                                                                                       | dependency    | updated | ^3.21.2  | ^3.21.3  |    |
  | @savvy-web/github-action-builder                                                                             | devDependency | updated | ^0.7.8   | ^0.7.9   |    |
  | @savvy-web/silk                                                                                              | devDependency | updated | ^0.4.2   | ^1.1.0   |    |

## 1.0.4

### Other

* [`56cc2a6`](https://github.com/savvy-web/silk-router-action/commit/56cc2a65be3c9b75b2dc80e80612df4bc9772cd1) Upgrade to silk-release-action v2.

## 1.0.3

### Other

* [`2b1d50b`](https://github.com/savvy-web/silk-router-action/commit/2b1d50b56a5eabdc08fafcb0f1a077e673aed5ee) Migrate to new `@savvy-web/silk` dependency system.

## 1.0.2

### Dependencies

* | [`f489af7`](https://github.com/savvy-web/silk-router-action/commit/f489af7845b9fd4b3fe8b632d8f8622dd0320f43) | Dependency    | Type    | Action | From   | To |
  | :----------------------------------------------------------------------------------------------------------- | :------------ | :------ | :----- | :----- | -- |
  | @savvy-web/github-action-effects                                                                             | dependency    | updated | ^2.0.1 | ^2.0.2 |    |
  | @savvy-web/github-action-builder                                                                             | devDependency | updated | ^0.7.1 | ^0.7.2 |    |

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
