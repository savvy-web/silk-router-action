---
type: Gotcha
title: ConfigProvider.fromEnv silently misses every hyphenated input name
description: ConfigProvider.fromEnv({ env }) uppercases and joins the config path, so an input-name key like target-branch is looked up as TARGET-BRANCH and never matches — the read falls through to its default and the test passes against the wrong value.
status: draft
stale_after: 2026-12-12T00:00:00Z
resource: ../../__test__/integration/program.int.test.ts
tags: [testing, dx]
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: e01e06d49cfb2cb6899b3da6967e17b6b1c3be582fdc27434a22b52b31c3d1d9
---

# ConfigProvider.fromEnv silently misses every hyphenated input name

A test supplies `{ "target-branch": "trunk" }` to
`ConfigProvider.fromEnv({ env })` (or reaches for it as a plausible
substitute for `ActionInput.provider`), runs the program, and the suite
is green. The reader concludes the supplied `target-branch` took effect.

It did not. `fromEnv` uppercases and joins the config path, so the
input-name key `"target-branch"` is looked up as `TARGET-BRANCH` — a
spelling nothing in the environment record ever provides, since the test
wrote the key as `target-branch`, not `TARGET-BRANCH`. The lookup misses,
`ActionInput.string("target-branch")` falls through to
`Config.withDefault("main")`, and the run proceeds on the default
`target-branch` regardless of what the test supplied. A test asserting
only that the run completed, or asserting only an output write count,
cannot tell the two cases apart.

This bit `../../__test__/integration/program.int.test.ts` directly: a
supplied `target-branch` did nothing, and only an assertion on the
*resulting phase* — not merely that outputs were written — caught it.
The surviving test, "routes a supplied target-branch all the way into
the detected phase," supplies `target-branch: trunk` while running on
`refs/heads/main` and asserts `phase` comes back `"none"` rather than
`"branch-management"`, which is only possible if the supplied value, not
the default, reached `detectPhase`.

The fix is not a different `ConfigProvider` incantation: it is
`ActionInput.provider(env)`, which derives the runner's mangled variable
name itself rather than joining an uppercased path — see
`../conventions/inject-inputs-by-provider.md`.
