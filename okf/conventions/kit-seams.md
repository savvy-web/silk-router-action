---
type: Convention
title: Read inputs through ActionInput, resolve Repo per call, emit through one emitter
description: Use the kit's own seams instead of bare Config, a captured Repo, or a scattered set of output writes.
status: draft
stale_after: 2026-12-12T00:00:00Z
tags: [architecture, dx]
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: ce8d5549f5f4c511ad61877c46dd6cdf9215bffb17e46199ddbab64a5ea89dd4
---

# Read inputs through ActionInput, resolve Repo per call, emit through one emitter

Read every action input through `ActionInput`, never through a bare
`Config.*` call. The runner publishes input values under mangled
`INPUT_<MANGLED>` names, and only `ActionInput` performs that mangling
correctly — see `../gotchas/input-mangling-preserves-hyphens.md` for what
goes wrong when a read bypasses it. `../../src/schema/inputs.ts` reads
every input this way, including the deliberate exception at
`releasePrefixConfig` (`Config.option` instead of `Config.withDefault`, so
an explicit empty value survives).

Resolve `Repo` per call, at the call site that needs it, never at layer
construction time. `Repo` is a value service, not a client — capturing it
while building a layer makes `Repo.provide` silently do nothing, because
the captured value predates whatever the caller intended to provide.
`../../src/layers/app.ts` documents this on `AppLayer`'s `@remarks` and
`../../src/steps/detect-phase.ts`'s `DetectPhaseRequirements` TSDoc traces
where `Repo` re-enters the requirement channel: carried through
`PullRequest.listAssociatedWithCommit`, not captured by the step.

Write every output through the one emitter. `emitOutputs` in
`../../src/schema/outputs.ts:95` is the only place that calls
`ActionOutputs.set`; it iterates `OUTPUT_NAMES` rather than issuing ten
hand-written calls, so a name added to the tuple is emitted without a
second edit and no name can be written twice by a copy-paste slip. Never
add a second call site that writes an output directly.
