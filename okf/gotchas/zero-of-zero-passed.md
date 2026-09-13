---
type: Gotcha
title: "\"Tests: 0/0 passed\" reads as green but proves nothing"
description: A project-filtered vitest run from the wrong directory collects no tests, prints 0/0 passed, and exits 0
resource: ../../vitest.config.ts
stale_after: 2026-12-12T00:00:00Z
tags:
  - testing
  - ci
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 359f018713cea822ba8b391385a1e6820779dc5bece44121f4b42f5e6934ddb9
sources:
  - id: vitest-config-ts
    resource: ../../vitest.config.ts
---

# "Tests: 0/0 passed" reads as green but proves nothing

## What a reader sees

A run prints `Tests: 0/0 passed` and the process exits `0`.

## What they will wrongly conclude

That the suite is green: every test that ran, passed.

## What is actually true

A project-filtered run invoked from the wrong directory collects nothing at
all — zero test files matched, zero tests run — and vitest still exits `0`,
because an empty collection is not a failure condition to the runner. This
project resolves its projects and tags through `AgentPlugin.discover()` in
`vitest.config.ts`,[^vitest-config-ts] and a positional filter argument is a
substring match against each collected file path as rendered from the current
working directory, while a `--project` filter resolves against the config
root — so an invocation that works from the repository root can collect
nothing from a subdirectory, and vice versa.

Read the reporter's `Tests:` line and its unhandled-errors list, not the exit
code, before trusting a run. Prefer the `run_tests` MCP tool over shelling out
to `vitest` directly: it persists results, so a `0/0` collection is visible in
the record rather than only in scrollback that has already scrolled past.

[^vitest-config-ts]: ../../vitest.config.ts
</content>
