---
type: Runbook
title: dogfood-a-first-party-dependency
description: Fix a bug or missing API in a first-party dependency inside its own repo and prove the fix through this action before publishing.
status: draft
resource: ../../package.json
tags: [deps, dx]
generated:
  by: okfit/claude-code
  at: 2026-11-10T18:01:33Z
sources:
  - id: package-json
    resource: ../../package.json
  - id: pnpm-workspace
    resource: ../../pnpm-workspace.yaml
  - id: root-claude-md
    resource: ../../CLAUDE.md
integrity:
  generated:
    body: 48e78d82bf3114a0
---

# Dogfood a first-party dependency

## Trigger

A bug or a missing API surfaces in a first-party dependency this
organisation authors — one declared in `package.json`[^package-json], such
as `@savvy-web/silk` or one of the `@effected/*` packages — with a checkout
of that library's repository beside this one (below, `../<library>`), and the
fix needs to be proven through this action's own build and tests before it
is published.

## Key fact

This action is a **bundled** artifact: `pnpm build` inlines every runtime
dependency into `dist/main.js`, so once a local library build is linked and
this repository is rebuilt, the change is baked into the committed `dist`.
The integration this action ships runs the committed `dist`, **not**
`node_modules` — a link that never reaches a rebuild changes nothing an
integration test can see. A build-only dependency (the `effected` build
CLI from `@effected/plugin`) changes how `dist` is produced rather than what
is inlined into it, so a rebuild is what proves it too.

## Steps

1. **Build the library.** In `../<library>`, run its own build so it
   produces the artifact the link resolves to.
2. **Link it.** In this repository, run `pnpm link ../<library>` (for a
   monorepo, the package's directory inside it), then `pnpm install`.
3. **Keep the declared range correct.** The committed range stays at what
   this repository intends to depend on once unlinked — the link overrides
   resolution locally without changing what is committed. For a
   `catalog:effected` dependency that range is not in this repository at
   all: the `@effected/pnpm-plugin-effected` config dependency in
   `pnpm-workspace.yaml` supplies it[^pnpm-workspace], and it is never
   hand-edited.
4. **Iterate.** Edit the library's source and rebuild it there, then in
   this repository run `pnpm typecheck` and `pnpm test`, then `pnpm build`
   here. Commit `src`, `dist`, and a changeset together, and push to `dev`.
5. **Ship the library edit separately.** The library's own source edit
   lands on its own branch and releases with its next published version —
   this repository's `dev` commits carry only the rebuilt `dist`, not the
   library's source change.
6. **Unlink only after the dogfooded version publishes.** Once the library
   publishes the version that carries the fix, remove the link and move to
   the published version — bump the range in `package.json`, or for a
   `catalog:effected` dependency bump the config-dependency plugin to the
   release whose catalog carries it — and run `pnpm install`.

## Constraint

Every commit made during this procedure must be GPG-signed with the
GitHub-verified key for the committing maintainer, or the signature
ruleset rejects the push[^root-claude-md].

## Observable end state

The dependency resolves to a published version (no `pnpm link` in effect),
and `dist/main.js` is rebuilt from that published, unlinked install — not
from the local library checkout.

[^package-json]: ../../package.json
[^pnpm-workspace]: ../../pnpm-workspace.yaml
[^root-claude-md]: ../../CLAUDE.md
