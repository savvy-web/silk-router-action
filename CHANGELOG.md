# @savvy-web/workflow-control-action

## 1.3.1

### Dependencies

* | Dependency               | Type       | Action  | From   | To     |                                                                              |
  | ------------------------ | ---------- | ------- | ------ | ------ | ---------------------------------------------------------------------------- |
  | @effected/github         | dependency | updated | ^0.2.2 | ^0.2.3 |                                                                              |
  | @effected/github-actions | dependency | updated | ^0.5.0 | ^0.5.1 | [#182][#182] Thanks [@savvy-web-bot](https://github.com/apps/savvy-web-bot)! |

### Patch Changes

[#182]: https://github.com/savvy-web/silk-router-action/pull/182

## 1.3.0

### Features

* ### Outputs are published even when the run fails

  A failed run now publishes the full output contract with every value disabled, instead of publishing nothing. Because this action exists to gate other workflows, a failure that emitted no outputs left a consumer's condition reading an empty string:

  ```yaml
  if: steps.control.outputs.should_continue == 'true'
  ```

  That now reads an explicit `false` on a failed run rather than `''`.

  ### An empty `release-prefix` disables release-detection retry

  `action.yml` has always documented that an empty `release-prefix` disables the retry that absorbs GitHub's PR-association lag. It never did — an explicitly empty value was indistinguishable from an unsupplied one and fell back to the `release:` default. Passing `release-prefix: ""` now disables the retry as documented.

### Bug Fixes

* Pull requests associated with a commit are now paginated. Previously only the first page was read, so a commit with more than 30 associated pull requests could silently fail release detection.
* Job-summary tables are escaped correctly. The previous renderer joined strings, so a phase reason containing a `|` character — reasons interpolate branch names and pull-request titles — corrupted the rendered table.
* The GitHub token is held as a redacted value from the moment it is read, rather than as a plain string.

### Refactoring

* Ported from `@savvy-web/github-action-effects` to `@effected/github-actions` and `@effected/github`. The action's interface is unchanged: the same four inputs, the same ten outputs, the same phase-detection algorithm, and the same `node24` runtime.

  Two visible differences come with the move:

  * Release detection no longer degrades on every error. Transport, rate-limit, not-found, rejected and unauthorized failures still fall back to commit-message detection, so a flaky or throttled API behaves as before. A malformed API response now fails the run instead of silently guessing from the commit message — previously any failure at all, including a malformed response, was absorbed. A run that used to succeed on a broken response will now go red, which is the intended trade: a wrong release decision is worse than a loud failure.
  * Failure output is rendered differently, as a tagged one-line summary with the full cause at debug level.

  Per-step summary lines are preserved. The legacy toolkit's `Step.groupStep` logged a one-line summary on a step's success in addition to the collapsible, buffer-on-success block; `program.ts`'s `step` helper now composes `ActionLogger.group` with `ActionLogger.withStep`, restoring that summary line exactly.

  The bundle grows by 81,362 bytes, from 303,618 to 384,980. The markdown writer accounts for 101,451 of that; the rest of the port is 20,089 bytes smaller than the implementation it replaces. The action is loaded once per job rather than shipped to a browser, so the trade buys a correctness fix at a cost paid in a place that does not matter much.

### Dependencies

* | Dependency                       | Type       | Action  | From   | To     |                                                                       |
  | :------------------------------- | :--------- | :------ | :----- | :----- | --------------------------------------------------------------------- |
  | @savvy-web/github-action-effects | dependency | removed | ^3.1.0 | —      |                                                                       |
  | @effected/github-actions         | dependency | added   | —      | ^0.5.0 |                                                                       |
  | @effected/github                 | dependency | added   | —      | ^0.2.2 | [#171][#171] Thanks [@spencerbeggs](https://github.com/spencerbeggs)! |

### Minor Changes

[#171]: https://github.com/savvy-web/silk-router-action/pull/171

## 1.2.3

### Dependencies

* | Dependency                       | Type       | Action  | From   | To     |                                                                              |
  | -------------------------------- | ---------- | ------- | ------ | ------ | ---------------------------------------------------------------------------- |
  | @savvy-web/github-action-effects | dependency | updated | ^3.0.5 | ^3.1.0 | [#157][#157] Thanks [@savvy-web-bot](https://github.com/apps/savvy-web-bot)! |

### Patch Changes

[#157]: https://github.com/savvy-web/silk-router-action/pull/157

## 1.2.2

### Dependencies

* | Dependency                       | Type       | Action  | From          | To             |                                                                              |
  | -------------------------------- | ---------- | ------- | ------------- | -------------- | ---------------------------------------------------------------------------- |
  | @effect/platform-node            | dependency | updated | 4.0.0-beta.99 | 4.0.0-beta.101 |                                                                              |
  | @savvy-web/github-action-effects | dependency | updated | ^3.0.4        | ^3.0.5         |                                                                              |
  | effect                           | dependency | updated | 4.0.0-beta.99 | 4.0.0-beta.101 | [#154][#154] Thanks [@savvy-web-bot](https://github.com/apps/savvy-web-bot)! |

### Patch Changes

[#154]: https://github.com/savvy-web/silk-router-action/pull/154

## 1.2.1

### Dependencies

* | Dependency                       | Type       | Action  | From   | To     |                                                                              |
  | -------------------------------- | ---------- | ------- | ------ | ------ | ---------------------------------------------------------------------------- |
  | @savvy-web/github-action-effects | dependency | updated | ^3.0.1 | ^3.0.4 | [#143][#143] Thanks [@savvy-web-bot](https://github.com/apps/savvy-web-bot)! |

- | Dependency            | Type       | Action  | From          | To            |                                                                              |
  | --------------------- | ---------- | ------- | ------------- | ------------- | ---------------------------------------------------------------------------- |
  | @effect/platform-node | dependency | updated | 4.0.0-beta.98 | 4.0.0-beta.99 |                                                                              |
  | effect                | dependency | updated | 4.0.0-beta.98 | 4.0.0-beta.99 | [#146][#146] Thanks [@savvy-web-bot](https://github.com/apps/savvy-web-bot)! |

### Patch Changes

[#143]: https://github.com/savvy-web/silk-router-action/pull/143

[#146]: https://github.com/savvy-web/silk-router-action/pull/146

## 1.2.0

### Refactoring

* Migrates the entire action runtime to Effect v4. Domain schemas, services, layers, and their co-located tests were rewritten against the v4 API surface — `Schema.Literals` for enumerated unions, class-based `Context.Service` (with an exported `PhaseDetectorShape`), the flattened `Cause`, and `TestClock.layer()` in tests. Phase-detection behavior and the action's `action.yml` inputs and outputs are unchanged.

### Build System

* `vitest.config.ts` temporarily runs a basic Vitest config with the `@vitest-agent/plugin` integration commented out. The plugin's latest release is still on the Effect v3 line and cannot load alongside Effect v4; the integration is restored once a v4-compatible plugin ships. [#136][#136]

### Dependencies

* | Dependency                       | Type          | Action  | From     | To            |
  | :------------------------------- | :------------ | :------ | :------- | :------------ |
  | effect                           | dependency    | updated | ^3.21.4  | 4.0.0-beta.98 |
  | @effect/platform-node            | dependency    | updated | ^0.107.0 | 4.0.0-beta.98 |
  | @effect/platform                 | dependency    | removed | ^0.96.2  | —             |
  | @savvy-web/github-action-effects | dependency    | updated | ^2.4.0   | ^3.0.0        |
  | @savvy-web/github-action-builder | devDependency | updated | ^1.1.2   | ^2.0.0        |
  | @savvy-web/silk                  | devDependency | updated | ^2.4.2   | ^3.0.0        |

  `effect` and `@effect/platform-node` now resolve through `catalog:effect`; `@effect/platform` is dropped because its modules moved into `effect` core.

### Minor Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

[#136]: https://github.com/savvy-web/silk-router-action/pull/136

## 1.1.7

### Other

* Force bump to release latest `@savvy-web/github-action-effects`.

### Patch Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

## 1.1.6

### Dependencies

* | Dependency                       | Type          | Action  | From    | To            |
  | :------------------------------- | :------------ | :------ | :------ | :------------ |
  | @savvy-web/silk                  | devDependency | updated | ^1.3.11 | ^2.0.0        |
  | @savvy-web/github-action-builder | devDependency | updated | ^1.0.3  | ^1.1.0        |
  | @changesets/cli                  | devDependency | added   | —       | ^3.0.0-next.8 |

  Release-toolchain upgrade to silk 2.0.0 (silk-effects 3.0.0, changesets v3 engine); `@changesets/cli` satisfies silk's new peer range. Dev-tooling only — the bundled action is unchanged (`@savvy-web/github-action-effects` stays at ^2.3.5 and `dist/main.js` is byte-identical). [#111][#111]

### Patch Changes

Thanks to [@spencerbeggs](https://github.com/spencerbeggs) for their contributions!

[#111]: https://github.com/savvy-web/silk-router-action/pull/111

## 1.1.5

### Bug Fixes

* Patch release for new github-action-effects

## 1.1.4

### Bug Fixes

* [`bed4533`](https://github.com/savvy-web/silk-router-action/commit/bed45330a158bdf8e7c47f28965c9560aa41e679) Explicitly declare `@types/node` version.

## 1.1.3

### Dependencies

* [`a60565a`](https://github.com/savvy-web/silk-router-action/commit/a60565aaec7578ae90ee4266921f87499c76edf0) | Dependency | Type | Action | From | To |
  \| :------------------------------- | :------------ | :------ | :----- | :----- |
  \| @savvy-web/github-action-effects | dependency | updated | ^2.3.1 | ^2.3.3 |
  \| @savvy-web/github-action-builder | devDependency | updated | ^0.8.0 | ^1.0.1 |
  \| @savvy-web/silk | devDependency | updated | ^1.3.4 | ^1.3.5 |

## 1.1.2

### Dependencies

* | [`1ffd724`](https://github.com/savvy-web/silk-router-action/commit/1ffd7242f9109ecd6c40c66df70b7a0daaf76626) | Dependency    | Type    | Action | From   | To |
  | :----------------------------------------------------------------------------------------------------------- | :------------ | :------ | :----- | :----- | -- |
  | @savvy-web/github-action-effects                                                                             | dependency    | updated | ^2.3.0 | ^2.3.1 |    |
  | @savvy-web/silk                                                                                              | devDependency | updated | ^1.3.3 | ^1.3.4 |    |

## 1.1.1

### Dependencies

* | [`cf3eb01`](https://github.com/savvy-web/silk-router-action/commit/cf3eb01911485f9511bf82a10d8f3eea67e13a5d) | Dependency    | Type    | Action  | From    | To |
  | :----------------------------------------------------------------------------------------------------------- | :------------ | :------ | :------ | :------ | -- |
  | @effect/platform                                                                                             | dependency    | updated | ^0.96.1 | ^0.96.2 |    |
  | effect                                                                                                       | dependency    | updated | ^3.21.3 | ^3.21.4 |    |
  | @savvy-web/github-action-effects                                                                             | dependency    | updated | ^2.2.1  | ^2.3.0  |    |
  | @savvy-web/github-action-builder                                                                             | devDependency | updated | ^0.7.11 | ^0.8.0  |    |
  | @savvy-web/silk                                                                                              | devDependency | updated | ^1.2.0  | ^1.3.3  |    |
  | @savvy-web/vitest                                                                                            | devDependency | updated | ^1.5.1  | ^1.6.0  |    |

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
