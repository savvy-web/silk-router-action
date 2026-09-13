---
type: Consumer
title: savvy-web-shared-release-workflow
description: The shared reusable release workflow at savvy-web/.github, which this repository's own CI pins and which is the intended caller of this action's phase-detection outputs.
status: draft
repository: savvy-web/.github
tags: [release, ci]
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: d24baa5175183262cf3c1140ad434e40d1e13bd1f1363c378cb7a9645ef49e1c
sources:
  - id: local-release-yml
    resource: ../../.github/workflows/release.yml
  - id: action-yml
    resource: ../../action.yml
  - id: root-claude-md
    resource: ../../CLAUDE.md
---

# savvy-web-shared-release-workflow

This repository's own `.github/workflows/release.yml` calls a reusable
workflow hosted in `savvy-web/.github`, pinned at
`uses: savvy-web/.github/.github/workflows/release.yml@main`
(`../../.github/workflows/release.yml:15`)[^local-release-yml]. It passes
`dry-run`, `auto-merge: "squash"`, and `skip-claude-review: false`, and
grants `contents: write`, `pull-requests: write`, `id-token: write`,
`packages: write`, `attestations: write`, `checks: write`, and
`artifact-metadata: write`
(`../../.github/workflows/release.yml:9-23`)[^local-release-yml]. This
observed pin is `@main`, not the `@dev` pin the root `CLAUDE.md`'s
Development & Release Cycle section describes for exercising in-progress
workflow changes[^root-claude-md] — the shared repository's own `dev`
branch may still exist, but this repository's checked-in trigger currently
targets `main`.

## Where the edge sits

This action only reports: it detects a workflow phase and ten string
outputs (`phase`, `has_changesets`, `changeset_count`, `release_type`,
`is_release_commit`, `is_release_branch`, `is_main_branch`,
`merged_pr_number`, `should_continue`, `reason`) from `action.yml`'s output
block[^action-yml]. The shared release workflow is the caller that acts on
those outputs — creating or updating the release branch, running
validation, publishing, or closing issues — for whichever repository
invokes it, including this one when the reusable workflow's own internal
steps run this action to gate its jobs. This repository's own
`release.yml` does not itself reference `steps.control.outputs.*`; the
gating usage shown in `../interfaces/action-contract.md`'s workflow-split
example is the pattern the shared workflow is presumed to apply internally,
not a step visible in this repository's own workflow file.

## Surfaces exercised (inferred from the interface, not observed)

The shared workflow's own source is not checked out locally, so the
following is inferred from `action.yml`'s output contract rather than read
directly:

- `should_continue` — the single boolean most workflow steps are documented
  to gate on (`if: steps.control.outputs.should_continue == 'true'`)[^action-yml].
- `phase` — distinguishes which of the five phases (`branch-management`,
  `validation`, `publishing`, `close-issues`, `none`) a given job block
  belongs to.
- `has_changesets` and `is_release_commit` — named directly in the
  workflow-split example (`has_changesets && !is_release_commit` gates
  branch-management)[^root-claude-md].

## Open questions

- Whether the shared workflow also consumes `reason` (for logging or PR
  comments) or `changeset_count` / `release_type` (for release-notes
  content) is unconfirmed without reading `savvy-web/.github`'s own
  workflow source.
- Whether the shared workflow's internal use of this action is itself
  pinned to a released tag, `@dev`, or a local path is unconfirmed from
  this repository's side of the edge.

[^local-release-yml]: ../../.github/workflows/release.yml
[^action-yml]: ../../action.yml
[^root-claude-md]: ../../CLAUDE.md
