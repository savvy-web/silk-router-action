---
type: Convention
title: Shape every step module the same way
description: Export a result type, a tagged error only when the step can fail, an annotated requirement channel, and the step; document its failure posture; wrap it with ActionLogger.step.
status: draft
stale_after: 2026-12-12T00:00:00Z
tags: [architecture, dx, observability]
generated:
  by: okfit/claude-code
  at: 2026-11-21T22:15:16Z
integrity:
  generated:
    body: 86a087f265b0630f
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
`logger.step(name, effect)`. A step holds its detail and, on success,
folds it into one collapsible block titled by its result line
(`✓ <name> · <duration>`); on failure it writes the result line and the
detail unfolded. Warnings and errors are never held — a long step still
reports trouble while it runs, and one that runs past its 30-second
window streams live. Do not wrap the step in `logger.group`: a step
opened inside a group cannot fold. Run the steps inside one `logger.phase("Workflow
Control", …)`: a bold heading, never folded, that marks this
action's block in a long job log without changing how the steps fold. `step` replaced `group` + `withStep`
in `@effected/github-actions@0.36.0`, which removed `withStep`,
`withBuffer` and `heading` — see
`../gotchas/withstep-invisible-through-double.md` for why a test suite
will not catch a dropped or misplaced step on its own.
