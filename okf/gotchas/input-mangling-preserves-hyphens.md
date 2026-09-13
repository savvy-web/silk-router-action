---
type: Gotcha
title: A hyphenated input name keeps its hyphen in the runner variable
description: The runner mangles a hyphenated input name to INPUT_RELEASE-BRANCH, not INPUT_RELEASE_BRANCH — only spaces become underscores, so a test seeding the underscore spelling reads as absent on a real runner.
status: draft
stale_after: 2026-12-12T00:00:00Z
resource: ../../src/schema/inputs.ts
tags: [dx, testing]
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 43d3a4e8b19af1605c916eb8246aa079ea6274acb785a48cfe3a42d468f55a15
---

# A hyphenated input name keeps its hyphen in the runner variable

A test seeds an input by writing `INPUT_RELEASE_BRANCH` (underscore) into
its environment record and reading `release-branch` through
`../../src/schema/inputs.ts`. The value comes back, the test is green,
and the reader concludes the input is read correctly.

That conclusion is wrong. GitHub's runner derives a declared input's
variable name by uppercasing it and replacing only **spaces** with
underscores — hyphens survive unchanged. `release-branch` is published as
`INPUT_RELEASE-BRANCH`, never `INPUT_RELEASE_BRANCH`. The derivation is
`@effected/github-actions`'s own `inputVariable`:

> `const inputVariable = (name) => \`INPUT_${name.replaceAll(" ", "_").toUpperCase()}\`;`
> — `node_modules/@effected/github-actions/ActionInput.js:19`

A test that hand-writes the underscore spelling is seeding a variable
name the runner never publishes. It passes only because nothing else in
the test environment happens to collide with it; on a real runner the
same underscore-spelled read finds nothing and silently falls through to
whatever default the code applies — the input reads as absent, not as
supplied.

The discriminating test for this in this repo is "does not resolve the
underscore spelling of a hyphenated input" in
`../../__test__/unit/schema/inputs.test.ts`, which seeds
`INPUT_TARGET_BRANCH` and asserts the code still falls back to the
manifest default rather than reading the seeded value. The safe way to
seed a runner variable in a test at all is `ActionInput.variable(name)`,
which calls the same derivation rather than re-typing it — see
`../conventions/inject-inputs-by-provider.md`.
