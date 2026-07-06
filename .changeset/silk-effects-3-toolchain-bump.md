---
"@savvy-web/silk-router-action": patch
---

## Dependencies

| Dependency                       | Type          | Action  | From    | To             |
| :------------------------------- | :------------ | :------ | :------ | :------------- |
| @savvy-web/silk                  | devDependency | updated | ^1.3.11 | ^2.0.0         |
| @savvy-web/github-action-builder | devDependency | updated | ^1.0.3  | ^1.1.0         |
| @changesets/cli                  | devDependency | added   | —       | ^3.0.0-next.8  |

Release-toolchain upgrade to silk 2.0.0 (silk-effects 3.0.0, changesets v3 engine); `@changesets/cli` satisfies silk's new peer range. Dev-tooling only — the bundled action is unchanged (`@savvy-web/github-action-effects` stays at ^2.3.5 and `dist/main.js` is byte-identical).
