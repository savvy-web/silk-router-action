---
type: Convention
title: Inject test inputs by provider, never by mutating process.env
description: Seed action inputs per test case through ActionInput.provider(env) and ConfigProvider.layer, and never mutate process.env between reads.
status: draft
stale_after: 2026-12-12T00:00:00Z
tags: [testing, dx]
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: d21db9cabc8fd9c95bf76b3341061abe1baa795458510c09cb18898f119edbed
---

# Inject test inputs by provider, never by mutating process.env

Inject inputs by **provider**, per case, through
`ConfigProvider.layer(ActionInput.provider(env))`, as
`../../__test__/unit/schema/inputs.test.ts` and
`../../__test__/integration/program.int.test.ts` both do. Never mutate
`process.env` between reads within a test — the environment is seeded once
at construction, and mutating it mid-suite produces a quiet false green
rather than a loud failure.

Key `env` by `with:`-block-shaped input names (for example
`"target-branch"`), the same spelling a workflow author writes in YAML.
`ActionInput.provider` derives the runner's mangled variable itself, so
the mangling — described in
`../gotchas/input-mangling-preserves-hyphens.md` — cannot be got wrong
from a test. When a test genuinely needs a verbatim `INPUT_…` key, call
`ActionInput.variable(name)` rather than writing the literal string.

Never reach for `ConfigProvider.fromEnv({ env })` as a substitute — see
`../gotchas/config-provider-from-env-silently-misses.md` for why it
silently misses every hyphenated input name.

Treat `providerOver` as useful only for asserting that the production
read path composes correctly, not for asserting that a module reads the
mangled key itself: `providerOver` retries a bare single-segment path
through the `INPUT_` derivation, so a module that reads through a plain
`Config.string("x")` resolves under it just as one reading through
`ActionInput.string` does. A suite relying on `providerOver` alone would
stay green even if `ActionInput.string` in `../../src/schema/inputs.ts`
were swapped for `Config.string` — that mutation is confirmed to leave it
passing.
