---
type: Limitation
title: An explicit empty release-prefix is unverified on a real runner
description: Whether GitHub publishes an empty INPUT_RELEASE-PREFIX for an explicitly-empty with value, versus substituting the action.yml default, has never been confirmed outside a local test
bounds: ../interfaces/action-contract.md
stale_after: 2026-12-12T00:00:00Z
tags:
  - ci
  - compat
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: e15b27c57d03127995bf99e6e99a8f8488d3c371d97afc2b650db9f23581ec72
sources:
  - id: inputs-ts
    resource: ../../src/schema/inputs.ts
---

# An explicit empty release-prefix is unverified on a real runner

## Condition

A caller writes `release-prefix: ""` in a workflow's `with:` block, intending
to disable the release-detection retry entirely — a documented, supported
setting: `readInputs` reads `release-prefix` through `Config.option` rather
than `Config.withDefault` specifically so an explicit empty value survives
instead of collapsing back to the `"release:"` default.[^inputs-ts]

## Symptom

The contract states that an empty `release-prefix` disables the retry, but
whether GitHub's runner actually publishes an **empty** `INPUT_RELEASE-PREFIX`
variable for an explicitly-empty `with:` value — as opposed to silently
substituting `action.yml`'s declared default, the way it does for an
*omitted* input — has not been confirmed on a real runner. No local test can
settle this, because nothing outside the runner applies manifest defaults;
every test here seeds the "unsupplied" case by hand, so the suite stays green
under either behavior.[^inputs-ts]

If GitHub substitutes the default instead, this read always sees
`Some("release:")`, the disable-by-empty behavior is unreachable, and the
claim that `release-prefix: ""` turns the retry off is wrong.

## What the fix takes

One workflow run on a real runner, with `release-prefix: ""` set explicitly on
a push to the target branch whose head commit message begins `release:`, and a
log of the resolved value together with the step's duration: retry disabled
returns promptly, while retry still enabled takes roughly 30 seconds waiting
across the scheduled retries. The `releasePrefixConfig` TSDoc at the call site
in `src/schema/inputs.ts` carries this exact discharge procedure and what a
failing result would require changing.[^inputs-ts]

## What bounds this

This bounds the `release-prefix` input of the action contract.

See also: [Bounded retry on release-prefixed pushes](../decisions/bounded-retry-on-release-prefixed-pushes.md).

[^inputs-ts]: ../../src/schema/inputs.ts
</content>
