---
type: Decision
title: Kit services over @actions/* packages
description: Route all GitHub Actions runtime and API access through @effected/github-actions and @effected/github rather than @actions/core and @actions/github.
status: stable
tags: [architecture, deps, testing]
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: b645b06696dd39a94faa4a34acc77b14c39333e30a9220f4e26aa0baac4eff0a
verified:
  - by: human:spencer
    at: 2026-09-13T20:11:53Z
---

# Kit services over @actions/* packages

## Context

A GitHub Action needs two kinds of runtime access: the Actions runner itself
(inputs, outputs, environment context, logging, job summaries) and the GitHub
REST API (querying pull requests associated with a commit). The conventional
path is `@actions/core` for the former and `@actions/github`/`@octokit/*` for
the latter, called directly from business logic.

This action instead reads runner concerns through `@effected/github-actions`
services — `ActionInput`, `ActionOutputs`, `ActionLogger`, `ActionEnvironment`
— and GitHub API concerns through `@effected/github` services — `GitHubClient`,
`PullRequest`, `Repo`. `package.json`'s `dependencies` block lists exactly
`@effect/platform-node`, `@effected/github`, `@effected/github-actions`, and
`effect`; no `@actions/*` package appears anywhere in the dependency graph.

## Decision

Business logic (`src/steps/detect-phase.ts`, `src/program.ts`) depends only on
Effect services resolved from context, never on `@actions/core` functions or a
bare `process.env` read, and never on an `@octokit`/`@actions/github` client
constructed by hand. `src/layers/app.ts`'s `AppLayer` wires only the services
`ActionRuntime.layer` does not already provide — `GitHubClient`, `Repo`,
`PullRequest` — composed as plain `Layer.mergeAll`, with `Repo` resolved **per
call** by the resource methods that need it rather than captured once at
layer-construction time (capturing it would make `Repo.provide` silently do
nothing).

Tests inject doubles from `__test__/utils/doubles.ts` — `actionEnvironmentTest`
wraps `ActionEnvironment.layerTest`, `actionOutputsRecording` wraps
`ActionOutputs.layerTest` — without touching `process.env` or mocking module
imports, so the production and test paths share exactly the same program code.

## Alternatives rejected

- **`@actions/core` + `@actions/github` directly.** Couples business logic to
  the Actions runtime's global, ambient style (`core.getInput`,
  `github.context`) rather than an injectable service, making it impossible to
  test without mutating `process.env` or mocking module imports.
- **The earlier `@savvy-web/github-action-effects` package.** An in-house
  predecessor to the current kit; superseded once `@effected/github-actions`
  and `@effected/github` existed as the maintained, more capable
  implementation of the same idea.

## Consequences

- Zero `@actions/*` transitive surface to track for breaking changes; the kit
  packages are the maintained abstraction layer instead.
- One sharp edge: `ActionEnvironment.layerTest` hard-provides a noop
  filesystem, so it cannot serve a webhook payload on its own. Payload-driven
  tests compose `actionEnvironmentTest`'s second positional argument instead —
  see `../conventions/inject-inputs-by-provider.md`.
- Every service this action needs beyond `ActionRuntime.layer` is enumerated
  explicitly in `AppLayer`; anything already provided by the runtime layer
  appearing there as well would be over-provision, not wiring.
