---
type: Convention
title: Shape every step module the same way
description: Export a result type, a tagged error only when the step can fail, an annotated requirement channel, and the step; document its failure posture; wrap it with group and withStep.
status: draft
stale_after: 2026-12-12T00:00:00Z
tags: [architecture, dx, observability]
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 58c5398f4f9e451ac95bae37f0d6bc6c97070a1f3b4ea26cc9127602d2c01b97
---

# Shape every step module the same way

Give every module under `../../src/steps/` the same four exports: a
result type describing what the step produces, a tagged error **only**
when the step can actually fail (never one that exists "just in case"),
an explicitly annotated requirement channel naming what services the step
needs, and the step function itself. `../../src/steps/parse-changesets.ts`
exports `ParseChangesetsResult` and `ChangesetParseError` because it reads
`.changeset/` through `FileSystem` and that read can fail; write down its
reachability as a standing obligation rather than leaving it decorative.
`../../src/steps/detect-phase.ts` exports `DetectPhaseRequirements` with no
matching error type, because its failure posture is degrade-to-warning,
not propagate — see `../decisions/failure-postures-per-step.md`.
`../../src/steps/write-summary.ts` exports `WriteSummaryRequirements` with
no error type either, because its posture is fail-the-job as a defect.

Document each step's failure posture in its own TSDoc, not in a shared
comment elsewhere — a reader opening one step module should not have to
go find the posture stated somewhere else.

Treat a step used by exactly one caller as a step, not a service. Promote
a capability out of `steps/` into a `services/` module only when a second
step needs the same capability — `../../src/CLAUDE.md`'s layout section
records `services/` and `shims/` as conventions this repository has not
yet needed, not tracked directories that must exist.

Wrap every step invocation in `../../src/program.ts`'s local `step` helper:
`logger.group(name, logger.withStep(name, effect))`. This gives a
collapsible log block plus a discard-on-success buffer with one info line
reporting the step happened, while warnings and errors are never buffered
— a long step still reports trouble while it runs. `withStep` landed in
`@effected/github-actions@0.5.0`; do not substitute `withBuffer`, which
reproduces the block and the buffering but drops the per-step success
line — see `../gotchas/withstep-invisible-through-double.md` for why a
test suite will not catch that substitution on its own.
