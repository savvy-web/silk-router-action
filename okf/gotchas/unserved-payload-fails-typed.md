---
type: Gotcha
title: Omitting a test payload fails typed, not silently
description: An unserved payload argument to the doubles reads as a typed GITHUB_EVENT_PATH failure, not a defect or an empty object
resource: ../../__test__/utils/doubles.ts
stale_after: 2026-12-12T00:00:00Z
tags:
  - testing
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 0c453a3ebef4f735d9033745987e55a323215997ab28543d5482be23b5779d5a
sources:
  - id: doubles-ts
    resource: ../../__test__/utils/doubles.ts
  - id: doubles-test-ts
    resource: ../../__test__/unit/doubles.test.ts
---

# Omitting a test payload fails typed, not silently

`actionEnvironmentTest(env, payload?)` is a thin alias over
`ActionEnvironment.layerTest`, kept so call sites read as one concept and the
payload stays named at the seam.[^doubles-ts]

## What a reader sees

A test constructs `actionEnvironmentTest(env)` without a second argument and
the effect that reads `env.payload` fails.

## What they will wrongly conclude

That the double is broken, or that it should default `payload` to `{}` so an
omitted argument behaves like an empty webhook payload.

## What is actually true

Omitting `payload` means **not served**, on purpose: the shape falls back to
reading `GITHUB_EVENT_PATH` through the stubbed filesystem, which fails
**typed**, naming the variable.[^doubles-ts] Defaulting the argument to `{}`
would make that state unreachable and quietly delete the guard. A case that
wants an empty payload passes `{}` explicitly, distinguishing "no payload
arranged" from "payload arranged and empty."

The failure is typed, not a defect. Before `@effected/github-actions@0.5.0`,
the hand-built double died on an unarranged filesystem read — a bug in the
harness. The kit now models an unserved payload as a handled environment
condition instead. Both are loud, but in different registers, so a test
asserting the old register (a die) will not catch a regression in the new one
(a typed failure naming `GITHUB_EVENT_PATH`).

This is pinned by `__test__/unit/doubles.test.ts`'s "fails typed and names the
variable when no payload is served" case, which asserts
`Cause.hasDies(exit.cause)` is `false` and that the pretty-printed cause
contains `GITHUB_EVENT_PATH`.[^doubles-test-ts]

[^doubles-ts]: `../../__test__/utils/doubles.ts`
[^doubles-test-ts]: `../../__test__/unit/doubles.test.ts`
</content>
