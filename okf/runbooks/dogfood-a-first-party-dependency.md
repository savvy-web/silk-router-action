---
type: Runbook
title: dogfood-a-first-party-dependency
description: Fix a bug or missing API in a first-party dependency inside its own repo and prove the fix through this action before publishing.
status: draft
resource: ../../package.json
tags: [deps, dx]
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: e6008ece20f616a3b71ecf42966e3eabe4f236fd888bfc15544d85e4a0cef0e3
sources:
  - id: package-json
    resource: ../../package.json
  - id: root-claude-md
    resource: ../../CLAUDE.md
---

# Dogfood a first-party dependency

## Trigger

A bug or a missing API surfaces in `@savvy-web/github-action-builder`
(declared at `^2.3.6` in `devDependencies`,
`../../package.json:38`)[^package-json], with the checkout for that
repository at `../github-action-builder`, and the fix needs to be proven
through this action's own build and tests before it is published.

## Key fact

This action is a **bundled** artifact: `pnpm build` inlines every
dependency into `dist/main.js`, so once a local library build is linked and
this repository is rebuilt, the change is baked into the committed `dist`.
The integration this action ships runs the committed `dist`, **not**
`node_modules` — a link that never reaches a rebuild changes nothing an
integration test can see.

## Steps

1. **Build the library.** In `../github-action-builder`, run `pnpm
   ci:build`. This produces the `dist/dev` link target the next step needs.
2. **Link it.** In this repository, run `pnpm link ../github-action-builder`,
   then `pnpm install`.
3. **Keep the declared range correct.** `package.json`'s `devDependencies`
   entry for `@savvy-web/github-action-builder` stays at the range this
   repository intends to depend on once unlinked — the link overrides
   resolution locally without changing what is committed there.
4. **Iterate.** Edit the library's source, `pnpm ci:build` there, then in
   this repository run `pnpm typecheck` and `pnpm test`, then `pnpm build`
   here. Commit `src`, `dist`, and a changeset together, and push to `dev`.
5. **Ship the library edit separately.** The library's own source edit
   lands on its own branch and releases with its next published version —
   this repository's `dev` commits carry only the rebuilt `dist`, not the
   library's source change.
6. **Unlink only after the dogfooded version publishes.** Once
   `@savvy-web/github-action-builder` publishes the version that carries
   the fix, remove the link, pin the published range in `package.json`, and
   run `pnpm install`.

## Constraint

Every commit made during this procedure must be GPG-signed with the
GitHub-verified key for the committing maintainer, or the signature
ruleset rejects the push[^root-claude-md].

## Observable end state

`package.json` pins a published range for `@savvy-web/github-action-builder`
(no `pnpm link` in effect), and `dist/main.js` is rebuilt from that
published, unlinked install — not from the local library checkout.

[^package-json]: ../../package.json
[^root-claude-md]: ../../CLAUDE.md
