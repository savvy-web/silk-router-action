---
type: Convention
title: Break the guarded thing before calling a suite done
description: Before calling a test suite done, mutate the code it guards and confirm the suite goes red; keep a recorded mutant-to-test table for this repo's discriminating mutants.
status: draft
stale_after: 2026-12-12T00:00:00Z
tags: [testing]
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: f7c484021eacfbd8fb3191fb1005f3014d28b4099129b53f7aef1553afefca18
---

# Break the guarded thing before calling a suite done

A test that cannot fail is worse than no test. Before calling a suite
done, mutate the thing it guards and confirm the suite goes red. Do this
for every new or changed assertion, not only for the retry and mangling
cases below — those are simply the mutants already recorded for this
repo.

Read the reporter's `Tests:` line and its unhandled-errors list, never
the exit code alone: a project-filtered run from the wrong directory
prints `0/0 passed` and still exits `0` — see
`../gotchas/zero-of-zero-passed.md`.

## Recorded discriminating mutants

| Mutant | Test that must break |
| --- | --- |
| `ActionInput.string` swapped for `Config.string` in `../../src/schema/inputs.ts` | the bare-provider mangled-key test in `../../__test__/unit/schema/inputs.test.ts` |
| `emitOutputs` writes a name twice | the exactly-once and declared-order tests in `../../__test__/unit/schema/outputs.test.ts` |
| `emitOutputs` skips a name | the exactly-once test in `../../__test__/unit/schema/outputs.test.ts` |
| the merge predicate in `detectPhase` inverted | the phase-detection scenario tests in `../../__test__/unit/steps/detect-phase.test.ts` |
| `release-prefix` retry gate forced off | the propagation-lag retry tests in `../../__test__/unit/steps/detect-phase.test.ts` |

Each row names the file the mutant lives in and the file whose tests must
turn red. Adding a new discriminating mutant to this repo means adding a
row here, not only a comment beside the test.
