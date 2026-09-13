---
type: Project
title: silk-router-action
description: A lightweight GitHub Action that runs pre-flight phase-detection checks so split release workflows only run when needed.
status: draft
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 1fe97e06cc692bc9643530add1a97077950a9418f98bfcedca243c405fddd43b
sources:
  - id: root-claude-md
    resource: ../CLAUDE.md
  - id: action-yml
    resource: ../action.yml
  - id: package-json
    resource: ../package.json
---

# silk-router-action

## Purpose

`silk-router-action` is a lightweight GitHub Action that performs pre-flight
checks so a release pipeline can be split into targeted workflows that only
run when needed, instead of one monolithic workflow running every job on
every push[^root-claude-md]. It was born out of the parent project
`savvy-web/silk-release-action`, whose comprehensive release workflow handled
branch management, validation, and publishing in a single trigger; this
action factors the "which phase am I in" question out of that workflow so
each phase's workflow can gate itself on the answer[^root-claude-md]. The
action itself is a single-purpose detector: it reads the current GitHub
Actions event context, decides which of five release phases the run belongs
to (`branch-management`, `validation`, `publishing`, `close-issues`,
`none`), and reports that decision — plus changeset state — as ten string
outputs and a job-summary panel[^action-yml], described in the package
manifest as "lightweight pre-flight workflow control checks for split
release pipelines"[^package-json].

This repository was renamed from `savvy-web/workflow-control-action` to
`savvy-web/silk-router-action` and ships as `1.0.0` at the rename. GitHub
auto-redirects the old URL, but consumers should update their `uses:` to
`savvy-web/silk-router-action@v1` once the v1 alias tag is in
place[^root-claude-md].

## Boundaries

The action **detects and reports**; the calling workflows **act**. Each of
the three workflows a caller composes (`release-branch.yml`,
`release-validate.yml`, `release-publish.yml`) runs this action first, reads
its outputs, and then conditionally runs its own phase-specific steps behind
`if: steps.control.outputs.should_continue == 'true'`[^root-claude-md]. The
action owns exactly one round of context reading (branch, event, payload,
changeset files) and exactly one round of reporting (outputs plus a job
summary); it never loops back to check its own effect on the repository,
because it has none.

## Non-goals

- It never creates or updates a release branch.
- It never publishes packages, cuts Git tags, or creates a GitHub release.
- It never closes issues.
- It never writes anything to the repository — its only writes are its
  action outputs and the job-summary panel it renders through
  `ActionOutputs.summary`.

Each of those actions is left entirely to the workflow that reads this
action's outputs and decides, from `should_continue` and the phase-specific
signals, whether to proceed[^root-claude-md].

[^root-claude-md]: ../CLAUDE.md
[^action-yml]: ../action.yml
[^package-json]: ../package.json
