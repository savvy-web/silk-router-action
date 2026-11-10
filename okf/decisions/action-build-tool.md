---
type: Decision
status: draft
title: Build with effected action build from @effected/plugin, configured by effected.toml
description: >-
  effected.toml configures effected action build (rolldown, via
  @effected/bundler) to bundle src/main.ts into the committed dist/main.js,
  validate action.yml and import-check the bundle, replacing the deprecated
  rsbuild-based @savvy-web/github-action-builder.
supersedes: rsbuild-action-builder.md
tags:
  - bundle
  - deps
  - ci
generated:
  by: okfit/claude-code
  at: 2026-11-10T18:01:33Z
sources:
  - id: effected-toml
    resource: ../../effected.toml
  - id: package-json
    resource: ../../package.json
  - id: tsconfig-json
    resource: ../../tsconfig.json
  - id: action-yml
    resource: ../../action.yml
  - id: main-ts
    resource: ../../src/main.ts
  - id: owner-builder-retired
    resource: conversation with the repository owner
    author: human:spencer
    last_modified: 2026-11-10T00:00:00Z
integrity:
  generated:
    body: d056f82636304273
---

# Build with effected action build from @effected/plugin

## Context

`@savvy-web/github-action-builder`, the rsbuild-based builder the
[previous decision](rsbuild-action-builder.md) chose, is
deprecated upstream: its source is deleted and it will receive no further
releases[^owner-builder-retired]. Its whole case rested on being a
first-party tool that could be fixed and dogfooded in-house, which no longer
holds. In the switch the bundle went from 476 KB to 406 KB, and smoke runs of
the old and new bundles produced byte-identical outputs and job summaries for
the `none`, `validation` and `branch-management` phases[^owner-builder-retired].

## Decision

Build with `effected action build` from `@effected/plugin`, a root
devDependency resolved through `catalog:effected`[^package-json], configured
by `effected.toml` at the repository root[^effected-toml]:

- `[action.entries]` declares one entry, `main = "src/main.ts"`.
- `[action.build]` sets `minify = true`.
- `[action.persistLocal]` is `enabled = false` with
  `path = ".github/actions/local"`.

`package.json`'s `build:prod` script runs `effected action build`, still
reached through `pnpm build` (`turbo run build:prod`)[^package-json]. The
bundler underneath is rolldown, through `@effected/bundler`. The output is
still the committed `dist/main.js` that `action.yml`'s `runs.using: node24`
entry executes[^action-yml]. `tsconfig.json` extends
`@effected/plugin/tsconfig/action.json`[^tsconfig-json].

The build does two checks the old toolchain left to a separate step. It
validates `action.yml` itself, so there is no separate `validate` script.
It also runs an import check: the finished bundle is imported in a fresh
Node process with no `GITHUB_*` environment. That check is safe here because
`src/main.ts` calls `Action.run` only when `GITHUB_ACTIONS` is
set[^main-ts], so importing the bundle runs nothing.

`@effected/plugin` comes from the same `@effected` kit that already supplies
the runtime (`@effected/github-actions`, `@effected/github`), whose catalog is
pinned by the `@effected/pnpm-plugin-effected` config dependency. The build
tool therefore moves in lockstep with the libraries it bundles, rather than
on a separately versioned range.

## Alternatives rejected

- **Stay on `@savvy-web/github-action-builder`.** Rejected because it is
  deprecated with its source deleted: a bundling bug or a new Node or
  rsbuild requirement could never be fixed, and its one advantage, in-house
  fixability, is gone.
- **`@vercel/ncc`.** Still a third-party tool outside this organisation's
  control. It also offers neither the in-build `action.yml` validation nor
  the import check, and it versions independently of the `@effected` kit.

## Consequences

- `dist/main.js` must still be rebuilt and committed on every source change:
  `pnpm build` before every push that touches `src/`, because GitHub Actions
  runs the committed bundle, not `node_modules`.
- The old `build.ignore` list (`xmlbuilder2`, `libxmljs2`,
  `ajv-formats-draft2019`) has no equivalent in `effected.toml`. None of
  those packages is in the production dependency graph any more, so there is
  nothing to exclude.
- `pnpm validate` no longer exists; a malformed `action.yml` fails
  `pnpm build` instead.
- The import check makes the `GITHUB_ACTIONS` guard in `src/main.ts`
  load-bearing for the build as well as for tests. Removing it would make
  the import check run the action outside a runner.
- `effected.toml` is a build input: `turbo.json` lists it among the
  `build:prod` inputs, so an edit to it invalidates the cached build.
- `persistLocal` stays disabled. Turning it on writes a mirrored copy under
  `.github/actions/local/` for exercising the action from a local checkout.

[^effected-toml]: `../../effected.toml`
[^package-json]: `../../package.json`
[^tsconfig-json]: `../../tsconfig.json`
[^action-yml]: `../../action.yml`
[^main-ts]: `../../src/main.ts`
[^owner-builder-retired]: conversation with the repository owner
