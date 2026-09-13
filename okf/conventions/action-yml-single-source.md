---
type: Convention
title: action.yml is the single source of input and output names
description: Declare every input and output name, and every default, in action.yml only; the schema/ tuples mirror it and never re-declare it.
status: draft
stale_after: 2026-12-12T00:00:00Z
tags: [dx, testing]
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 3a131702316e6fdb0543f17a03ea28718469778df6c8553b23da899aac11bd39
---

# action.yml is the single source of input and output names

Declare an input or output's name, description, and default in
`../../action.yml` only. Never re-declare a name or a default anywhere
else — mirror it instead.

Mirror `action.yml`'s `inputs:` names into `INPUT_NAMES` and its literal
defaults into `INPUT_DEFAULTS`, both in `../../src/schema/inputs.ts:20` and
`:36`. Mirror `action.yml`'s `outputs:` names into `OUTPUT_NAMES` in
`../../src/schema/outputs.ts:17`. Treat `token`'s manifest default
(`${{ github.token }}`) as the one exception with no literal counterpart in
`INPUT_DEFAULTS`: it is an expression the runner resolves, not a value this
code can restate.

When you add, rename, or remove an input or output, edit `action.yml`
first, then edit the matching tuple in `schema/inputs.ts` or
`schema/outputs.ts` to match. Never edit only one side.

Prove the two sides still agree by running the three-way check in
`../../__test__/unit/parity.test.ts`: it counts exactly 4 inputs and 10
outputs, matches every name from the manifest against `INPUT_NAMES` and
`OUTPUT_NAMES`, and matches every literal default from the manifest
against `INPUT_DEFAULTS`. Let a drift between the manifest and either
tuple fail this test — do not "fix" the test to accept a new count without
first confirming the manifest itself changed.
