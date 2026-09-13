---
type: Decision
status: stable
title: Build with the rsbuild-based github-action-builder, not ncc
description: >-
  action.config.ts configures @savvy-web/github-action-builder to bundle
  src/main.ts into the committed dist/main.js that action.yml's runs.using
  node24 entry point executes, in place of @vercel/ncc.
tags:
  - bundle
  - deps
  - ci
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 767cc142148fc9e407b524c84a9c78291e4813584facd9989e218ca7ee71ad31
sources:
  - id: action-config
    resource: ../../action.config.ts
  - id: package-json
    resource: ../../package.json
  - id: action-yml
    resource: ../../action.yml
verified:
  - by: human:spencer
    at: 2026-09-13T20:11:57Z
---

# Build with the rsbuild-based github-action-builder, not ncc

## Context

`action.config.ts`[^action-config] configures
`@savvy-web/github-action-builder` with one entry (`main: "src/main.ts"`),
minification on, three packages excluded from the bundle
(`xmlbuilder2`, `libxmljs2`, `ajv-formats-draft2019`), and `persistLocal`
disabled. `package.json`[^package-json] wires this through two scripts:
`build` runs `turbo run build:prod`, and `build:prod` runs
`github-action-builder build`. `action.yml`[^action-yml] declares
`runs.using: node24` with `main: dist/main.js` — the single JavaScript file
`github-action-builder` produces from the whole dependency graph rooted at
`src/main.ts`. That file is committed to git, since GitHub Actions executes
the committed `dist/main.js` directly and never runs `pnpm install` or
resolves `node_modules` inside a consumer's workflow run.

## Decision

Build with `@savvy-web/github-action-builder`, an rsbuild-based bundler,
rather than `@vercel/ncc`.

`github-action-builder` is a first-party tool this organisation authors and
dogfoods (see the dogfood-a-first-party-dependency runbook): a bug or a
missing capability in the builder can be fixed in its own repository and
exercised in this action before it is published, the same dogfooding loop
this repository already runs for its other first-party dependencies.
Building on rsbuild also gives the config surface in `action.config.ts` —
named entries, a `build.ignore` list for packages the bundle should
deliberately not inline, and the `persistLocal` mirror for local testing —
rather than a bundler this repository does not control the roadmap of.

## Alternatives rejected

- **`@vercel/ncc`.** The conventional choice for bundling a Node-based
  GitHub Action into one file. Rejected because it is a third-party tool
  outside this organisation's control: a bundling bug or gap could not be
  fixed in-house and dogfooded the way `github-action-builder` can, and its
  configuration surface does not offer the per-entry, per-ignore shape
  `action.config.ts` uses.

## Consequences

- `dist/main.js` must be rebuilt and committed on every source change —
  `pnpm build` before every push that touches `src/`. GitHub Actions runs
  the committed bundle, not `node_modules`, so an un-rebuilt `dist/` silently
  ships stale behaviour regardless of what `src/` says.
- The three packages named in `build.ignore` (`xmlbuilder2`, `libxmljs2`,
  `ajv-formats-draft2019`) are excluded from the bundle deliberately, which
  means anything in this action's dependency graph that actually needs them
  at runtime would fail — the ignore list is a statement that nothing on the
  action's real code path requires them, not merely an optimisation.
- Because this action is a bundled artifact, the dogfooding procedure for
  `github-action-builder` itself is: build the library, `pnpm link` it here,
  rebuild `dist/main.js`, and the local build change is baked into the
  committed bundle without needing the library's own release to land first.
- `persistLocal.enabled: false` means no mirrored copy is written under
  `.github/actions/local/` during this build; toggling it on is the
  documented way to exercise the action from a local checkout without
  publishing.

[^action-config]: `../../action.config.ts`
[^package-json]: `../../package.json`
[^action-yml]: `../../action.yml`
