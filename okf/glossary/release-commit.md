---
type: Glossary
title: Release commit
description: The repository's precise sense of "release commit" versus a release-prefixed commit
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 0f77972225ab69eabbc805edc756392472fdcffa66708858494488ea6c369d8f
sources:
  - id: detect-phase-ts
    resource: ../../src/steps/detect-phase.ts
  - id: action-yml
    resource: ../../action.yml
---

# Release commit

**Release commit** means a push to the target branch whose head commit is
confirmed, via the GitHub API's PR-association query, to be associated with a
merged pull request from the release branch into the target branch.[^detect-phase-ts]
It is what sets the `is_release_commit` output to `true` and routes phase
detection to `publishing`.

## The trap

A **release-prefixed commit** — one whose message starts with the
`release-prefix` input, `"release:"` by default[^action-yml] — is **not** the
same thing, and does not by itself set `is_release_commit`. The prefix exists
only to gate whether the release-detection retry loop runs for that push,
absorbing GitHub's PR-association propagation lag. A commit can be
release-prefixed and still resolve to `is_release_commit: false` if the API
query (after any retries) finds no matching merged PR; conversely, in the
degraded fallback path, a commit can be classified a release commit from
message patterns alone, without ever being release-prefixed in this sense.
The GitHub API's PR-association query remains the sole authority for
`is_release_commit` on the primary path; the prefix never substitutes for
it.[^detect-phase-ts]

## Where the wider ecosystem differs

The changesets ecosystem calls its version-bump commit `"chore: version
packages"`. In this repository that exact string is only one of several
commit-message fallback patterns consulted when the PR-association API call
fails — never the primary or authoritative signal, and never sufficient on
its own to declare a release commit while the API is reachable.

See also: [API-authoritative release detection](../decisions/api-authoritative-release-detection.md),
[Bounded retry on release-prefixed pushes](../decisions/bounded-retry-on-release-prefixed-pushes.md).

[^detect-phase-ts]: ../../src/steps/detect-phase.ts
[^action-yml]: ../../action.yml
</content>
