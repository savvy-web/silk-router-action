---
type: Runbook
title: release-cycle
description: The dev-to-main-to-release flow and the post-release housekeeping that resets dev and moves the major alias tag.
status: draft
resource: ../../.github/workflows/branch-sync.yml
tags: [release, ci]
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 65d27c9f023e2826cb55f8b050e19e90d258e29a14f80147b910e81e42050539
sources:
  - id: branch-sync-yml
    resource: ../../.github/workflows/branch-sync.yml
  - id: local-release-yml
    resource: ../../.github/workflows/release.yml
  - id: root-claude-md
    resource: ../../CLAUDE.md
---

# Release cycle

A path named `.github/workflows/release-sync.yml` does not exist in this
repository. The workflow that actually implements the post-release
housekeeping the root `CLAUDE.md` describes under that name is
`.github/workflows/branch-sync.yml`, whose `major-tag` job matches the
described tag behavior and whose `sync-dev` job implements the `dev` reset
with a different, more conservative mechanism than a description of it as
an unconditional hard reset would suggest[^branch-sync-yml]. This concept
is grounded in that file, not the description alone.

## Trigger

Feature work accumulated on `dev` is ready to ship.

## Steps

1. **Merge `dev` into `main`.** Feature work lands on the long-lived `dev`
   branch and is merged into `main` when ready[^root-claude-md].
2. **Phase 1 — branch management.** The push to `main` fires this
   repository's own release pipeline
   (`.github/workflows/release.yml`, which pins
   `savvy-web/.github/.github/workflows/release.yml@main`,
   `../../.github/workflows/release.yml:15`)[^local-release-yml], which
   creates or updates `changeset-release/main` and the release PR.
3. **Phase 2 — validation.** Pushes to the release branch trigger build,
   publish dry-runs, a release-notes preview, and a sticky comment.
4. **Phase 3 — publishing.** Merging the release PR triggers publishing,
   Git tags, and a published GitHub release.
5. **Post-release housekeeping.** The published release fires `release:
   [published]`, which the `major-tag` job in `branch-sync.yml` reacts to
   (`if: github.event_name == 'release' || ...`,
   `../../.github/workflows/branch-sync.yml:171-173`)[^branch-sync-yml].
   That job:
   - Parses the release tag against `^([0-9]+)\.([0-9]+)\.([0-9]+)$` — a
     bare `MAJOR.MINOR.PATCH` with no leading `v`, no `-prerelease`, and no
     `+build` metadata (`:203`)[^branch-sync-yml]. A non-matching tag is a
     no-op (`:204-206`)[^branch-sync-yml].
   - Requires `major >= 1`; a release below `1.0.0` is a no-op
     (`:209-212`)[^branch-sync-yml].
   - Resolves the alias tag `v<major>` and force-moves it to the released
     commit only if it is not already there (`:214,229-241`)[^branch-sync-yml].
6. **Even `dev` out with `main`.** Rather than an unconditional hard reset
   keyed on the release event, the `sync-dev` job keys on *any push to
   `main`* (`on.push.branches: [main]`, `:23-24`)[^branch-sync-yml] — merging
   `changeset-release/main` is itself such a push, so the release path is
   still covered, but a `main`-moving push with no release (for example a
   dependency-promotion merge with no changeset) is evened out too
   (`:8-12`)[^branch-sync-yml]. The job resets `dev` to `main` only when
   merging `dev` into `main` in memory produces the same tree `main`
   already has — proof that `dev` holds nothing `main` lacks
   (`:120-143`)[^branch-sync-yml]. If `dev` genuinely diverges, the job
   rebases `dev` onto `main` instead of resetting it, and if that rebase
   conflicts it aborts and leaves `dev` untouched with a warning rather
   than clobbering it (`:147-154`)[^branch-sync-yml].

Both jobs run using a generated GitHub App token
(`../../.github/workflows/branch-sync.yml:64-70,175-181`)[^branch-sync-yml],
so their pushes can bypass branch protection, and pushing to `dev` or a tag
does not itself trigger any workflow, so this housekeeping does not
recurse.

Each push is guarded: `sync-dev` no-ops when `dev` already equals `main`
(`:113-116`)[^branch-sync-yml], and `major-tag` no-ops when the alias tag
already points at the released commit (`:234-235`)[^branch-sync-yml].
`workflow_dispatch` with a `task` choice, an optional `tag` input, and a
`dry-run` boolean rehearses any of the three jobs without pushing
(`:27-44`)[^branch-sync-yml].

## Observable end state

The `v<major>` alias tag points at the released commit, and `dev` either
equals `main` or has been rebased onto it with no unmerged content lost.

[^branch-sync-yml]: ../../.github/workflows/branch-sync.yml
[^local-release-yml]: ../../.github/workflows/release.yml
[^root-claude-md]: ../../CLAUDE.md
