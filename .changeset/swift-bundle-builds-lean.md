---
"@savvy-web/silk-router-action": patch
---

## Build System

* The action bundle is now built with `effected action build` (rolldown, configured by `effected.toml`) instead of the deprecated `@savvy-web/github-action-builder` (rsbuild).
* The rebuilt `dist/main.js` is smaller, 476 KB down to 406 KB. Inputs, outputs and `runs.main` are unchanged, and smoke runs of the old and new bundles produced identical outputs and job summaries for the `none`, `validation` and `branch-management` phases.
