---
"@savvy-web/silk-router-action": patch
---

## Dependencies

| Dependency                       | Type          | Action  | From            | To              |
| :------------------------------- | :------------ | :------ | :-------------- | :-------------- |
| effect                           | dependency    | updated | 4.0.0-beta.101  | 4.0.0-beta.107  |
| @effect/platform-node            | dependency    | updated | 4.0.0-beta.101  | 4.0.0-beta.107  |
| @effected/github                 | dependency    | updated | 0.2.3           | 0.3.0           |
| @effected/github-actions         | dependency    | updated | 0.5.1           | 0.6.0           |
| @savvy-web/github-action-builder | devDependency | updated | 2.2.2           | 2.2.3           |
| @savvy-web/silk                  | devDependency | updated | 3.4.0           | 3.5.2           |
| @vitest-agent/plugin             | devDependency | updated | 2.0.13          | 2.0.16          |
| @effected/pnpm-plugin-effect     | config        | updated | 0.3.2           | 0.4.0           |

Advances the action onto the Effect `4.0.0-beta.107` wave, adopting the
`@effected` releases rebuilt against it. The bundled `dist/main.js` now carries
a single, coherent Effect copy.

## Refactoring

* Renames the two typed-error declarations from `Schema.TaggedErrorClass` to
  `Schema.TaggedError`, which `beta.107` restored as the canonical name. The
  curried shape is unchanged, so `ChangesetParseError` and the internal
  `ReleasePRNotVisibleYet` keep their existing fields and behavior.

## Documentation

* Corrects the stale dependency versions in the technical-stack section, notes
  that the `catalog:effect` entries come from the `@effected/pnpm-plugin-effect`
  config dependency rather than a local `catalogs:` block, and replaces the
  `tsgo --noEmit` type-check instructions with `tsc --noEmit` — the native
  preview binary graduated into TypeScript 7 and is no longer installed.
