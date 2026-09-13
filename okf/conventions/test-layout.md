---
type: Convention
title: Collect tests only from unit and integration, never restore stripped env vars
description: Place every test under __test__/unit or __test__/integration, keep __test__/utils free of tests, and never restore the environment variables vitest.setup.ts strips.
status: draft
stale_after: 2026-12-12T00:00:00Z
tags: [testing]
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 1b7b9a147df7abec4521168c377be4c8d8aa0f3787e8cd70ce89797aa5bbe0b6
---

# Collect tests only from unit and integration, never restore stripped env vars

Place a test in exactly one of two locations: `../../__test__/unit/`,
mirroring `../../src/` module for module, named `*.test.ts`; or
`../../__test__/integration/`, exercising the whole pipeline, named
`*.int.test.ts`, with a `fixtures/` subdirectory when a case needs one.
Keep `../../__test__/utils/` free of tests — it holds doubles and other
helper code only. A test file placed outside these two locations can be
silently skipped by project-scoped discovery, indistinguishable from a
green suite. If you introduce a third collected location, make its
placement assert itself executably rather than trusting convention alone.

Never restore `GITHUB_ACTIONS`, `GITHUB_OUTPUT`, or `GITHUB_STATE` inside
a test. `../../vitest.setup.ts`'s `setup()` deletes all three from the
process before vitest forks its workers, and `../../src/main.ts` guards
its `Action.run` call on `GITHUB_ACTIONS` — so importing the entry point
in a suite while that variable is set would execute the action mid-run as
an import side effect. `GITHUB_OUTPUT` and `GITHUB_STATE` are stripped for
the same reason applied to file writes: a local `act` session should not
be able to write a real runner file by accident. Restoring any of the
three inside a test reopens the exact hazard the global setup closed.
