---
type: Gotcha
title: The test double cannot tell withStep from withBuffer
description: Every ActionLogger wrapper in the test double is a pass-through, so a suite asserting only outputs stays green whether program.ts routes a step through withStep or withBuffer; only a member-routing assertion in the integration suite catches a silent revert.
status: draft
stale_after: 2026-12-12T00:00:00Z
resource: ../../src/program.ts
tags: [testing, observability]
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 1218bbb17b5813e73dd3d4e137e22d085314deca486ac92773d0373915dbbfa4
---

# The test double cannot tell withStep from withBuffer

A suite runs `../../src/program.ts` end to end against
`ActionLogger.layerTest` and asserts the usual things: the run completes,
outputs are emitted, the phase is right. It stays green whether
`program.ts`'s local `step` helper wraps a step in
`logger.group(name, logger.withStep(name, effect))` or in
`logger.group(name, logger.withBuffer(name, effect))`. The reader
concludes the logging shape — the collapsible block, the discard-on-
success buffering, and the one info line `withStep` adds on success — is
covered by that suite.

It is not. Every logger wrapper the double provides is a pass-through
that just runs the wrapped effect; nothing in the double distinguishes
"ran through `withStep`" from "ran through `withBuffer`". The two differ
only in what they emit to the real runner's log, which a pass-through
double cannot observe. This is not hypothetical: the port initially
shipped `group` + `withBuffer`, which reproduced the collapsible block
and the buffering but silently dropped the per-step success line the
legacy `groupStep` produced — and the outputs-only suites stayed green
through that regression.

The one assertion that does catch it is "routes every step through
withStep, not withBuffer" in
`../../__test__/integration/program.int.test.ts:192`, which replaces
`ActionLogger.layerTest`'s `withStep` and `withBuffer` members with
recording functions and asserts each of the four steps routed through
`withStep`, with `withBuffer` recording nothing. Reverting `program.ts`'s
`step` helper to `withBuffer` fails only that assertion; every
outputs-only test in the suite keeps passing.
