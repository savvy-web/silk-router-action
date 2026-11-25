---
type: Gotcha
title: The silent logger double cannot see the step log
description: Every ActionLogger wrapper in the silent double is a pass-through, so a suite asserting only outputs stays green whether program.ts runs a step through ActionLogger.step or not at all; only the ActionLogger.recording() assertion in the integration suite catches it.
status: draft
stale_after: 2026-12-12T00:00:00Z
resource: ../../src/program.ts
tags: [testing, observability]
generated:
  by: okfit/claude-code
  at: 2026-11-21T22:15:16Z
x-okfit-integrity:
  generated:
    body: e0cd3fe758873ece
---

# The silent logger double cannot see the step log

A suite runs `../../src/program.ts` end to end against
`ActionLogger.layerSilent` (or `layerTest`) and asserts the usual things:
the run completes, outputs are emitted, the phase is right. It stays green
whether `program.ts`'s local `step` helper runs a step through
`logger.step(name, effect)`, wraps it in `logger.group` as well, or skips
the wrapper altogether. The reader concludes the logging shape — one
folded block per step with a result line — is covered by that suite.

It is not. Every logger wrapper the silent double provides is a
pass-through that just runs the wrapped effect, so it cannot observe what
the real runner's log would show. This is not hypothetical: before the
`step` API, the port shipped `group` + `withBuffer`, which reproduced the
collapsible block and the buffering but silently dropped the per-step
success line the legacy `groupStep` produced — and the outputs-only
suites stayed green through that regression.

The one assertion that does catch it is "runs every unit of work as a
top-level step" in `../../__test__/integration/program.int.test.ts`,
which provides `ActionLogger.recording()` and asserts its `entries()` are
exactly the four steps, in order, none nested in another. Dropping the
`step` wrapper fails only that assertion; every outputs-only test in the
suite keeps passing. The recording double records structure only: it
does not model `group` nesting, so a step wrapped in `group` — which the
live logger cannot fold — still passes it. Keep `group` out of the
helper by convention (`../conventions/step-module-shape.md`).
