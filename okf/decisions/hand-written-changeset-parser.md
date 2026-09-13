---
type: Decision
status: stable
title: Parse changeset frontmatter with a hand-written regex parser
description: >-
  parseChangesetFile reads .changeset/*.md frontmatter with two regexes over
  content read through core FileSystem, rather than depending on
  @changesets/* packages the bundler would inline anyway.
tags:
  - deps
  - bundle
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: b05f1164223751a1b12189133ea7001923d4665307cfa095f6c2ef5b749ce3cb
sources:
  - id: parse-changesets
    resource: ../../src/steps/parse-changesets.ts
verified:
  - by: human:spencer
    at: 2026-09-13T20:11:57Z
---

# Parse changeset frontmatter with a hand-written regex parser

## Context

`parseChangesetFile`[^parse-changesets] (`parse-changesets.ts:86-106`) reads
a changeset file's body and pulls out its frontmatter with two regular
expressions rather than a YAML parser or the `@changesets/*` tooling that
defines the format:

```markdown
---
"@savvy-web/silk-router-action": patch
---

Fix the thing that was broken.
```

The frontmatter block is matched wholesale with
`/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/` after normalizing line endings
(`content.replace(/\r\n?/g, "\n")`, since the delimiter regex anchors on
`\n` and would silently fail to match a CRLF file). Each line inside the
block is then matched against a per-line pattern of an optionally quoted
package name, a colon, and one of `major`, `minor`, or `patch`, to pull a
`{ name, type }` release pair. `compareBumpTypes` and `getHighestBumpType`
(lines 116–135) then reduce the parsed releases to the single highest bump
across every affected package. The reads themselves go through core's
`FileSystem`[^parse-changesets] service (`fs.exists`, `fs.readDirectory`,
`fs.readFileString`), **not** `node:fs` — the requirement was declared wide
enough at contract time (`ParseChangesetsRequirements`, lines 40–54) that
moving off synchronous `node:fs` did not reopen the step's signature.

## Decision

Keep the hand-written frontmatter parser rather than depending on
`@changesets/parse`, `@changesets/read`, or the wider `@changesets/*`
family that defines and consumes this exact file format.

The format this action needs to read is narrow — YAML-flavoured frontmatter
containing only `"package-name": bumpType` lines, delimited by `---` — and a
two-regex parser covers it completely for the shapes `.changeset/*.md` files
actually take in this repository. Depending on `@changesets/*` for this would
add a dependency surface for a format specific enough that the bundler would
inline every one of those packages' internals into `dist/main.js` regardless
(see the rsbuild-action-builder decision) — full YAML parsing, config
resolution, and workspace-graph logic this action never calls.

## Alternatives rejected

- **`@changesets/parse` / `@changesets/read`.** Rejected because the surface
  overhead is real and the coverage overlap is total for this action's use:
  every field these packages parse beyond `{ name, type }` and the summary
  body goes unused here, and the dependency edge would still get bundled
  in whole through rsbuild rather than tree-shaken away, since `@changesets/*`
  packages are written for a Node runtime, not for static analysis.
- **A full YAML parser** (e.g. `js-yaml`) for just the frontmatter block.
  Rejected for the same reason: the frontmatter's grammar is one line format
  (`"key": value`), and a general YAML parser would accept — and need to
  reject — far more grammar than this action will ever see in a changeset
  file, without adding any real safety over the two anchored regexes.

## Consequences

- The parser is exactly as forgiving as its regexes: a frontmatter block that
  does not match `^---\n...\n---\n?` (for example, a CRLF file — mitigated by
  the line-ending normalization — or one with a nonstandard delimiter) is
  treated as `null` and silently skipped rather than surfaced as a parse
  failure. A stray or malformed `.md` file in `.changeset/` never fails the
  job; it just does not count as a changeset.
- Extending the format (a new frontmatter field, a different delimiter
  convention) means extending these two regexes and their tests directly,
  since there is no upstream library to bump for a format change.
- Replacing this parser with the real `@changesets/*` packages remains a
  possible future improvement — not an urgent one — should the format grow
  beyond what a two-regex parser can track reliably.

[^parse-changesets]: `../../src/steps/parse-changesets.ts`
