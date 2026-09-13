---
type: Gotcha
title: A retry call-count assertion does not pin the retry interval
description: A retry test that advances a generous virtual clock budget and asserts only the call count passes at any spacing; only a deliberately-short-advance case in detect-phase.test.ts actually pins the 10-second interval.
status: draft
stale_after: 2026-12-12T00:00:00Z
resource: ../../src/steps/detect-phase.ts
tags: [testing]
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 99f95daecd0ae205e2cb8d40413fa10b5412c37e64d882c7dcb2c23f44f22366
---

# A retry call-count assertion does not pin the retry interval

A retry test advances `TestClock` by a generous virtual budget — say 60
seconds — and then asserts the PR-association lookup was called exactly
4 times (1 initial attempt plus 3 retries). It passes, and the reader
concludes the "three retries, ten seconds apart" contract documented for
`../../src/steps/detect-phase.ts` is under test.

The spacing half of that contract is not. A 60-second budget is long
enough to let all 4 attempts fire regardless of whether
`Schedule.spaced` is configured for 10 seconds or 1 second — the call
count comes out the same either way, because the budget was never tight
enough to distinguish them. This surfaced as a real surviving mutant:
changing the schedule from 10 seconds to 1 second left the whole retry
suite green, because every other case in
`../../__test__/unit/steps/detect-phase.test.ts` advances the clock by
an ample margin and only checks the final call count.

The one case that pins the interval is "spaces retries 10 seconds apart"
in `../../__test__/unit/steps/detect-phase.test.ts:353`. It advances the
clock in small, deliberate increments — 1 second, then two further
10-second steps — and asserts the call count at each intermediate point
(1, then 2, then 3), so a retry due earlier or later than 10 seconds
shows up immediately rather than being absorbed by slack in the budget.
Any change to the retry schedule must keep this case, not just the
generous-budget count assertions, green.
