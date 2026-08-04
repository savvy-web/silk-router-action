---
"@savvy-web/silk-router-action": minor
---

## Features

### Outputs are published even when the run fails

A failed run now publishes the full output contract with every value disabled, instead of publishing nothing. Because this action exists to gate other workflows, a failure that emitted no outputs left a consumer's condition reading an empty string:

```yaml
if: steps.control.outputs.should_continue == 'true'
```

That now reads an explicit `false` on a failed run rather than `''`.

### An empty `release-prefix` disables release-detection retry

`action.yml` has always documented that an empty `release-prefix` disables the retry that absorbs GitHub's PR-association lag. It never did — an explicitly empty value was indistinguishable from an unsupplied one and fell back to the `release:` default. Passing `release-prefix: ""` now disables the retry as documented.

## Bug Fixes

* Pull requests associated with a commit are now paginated. Previously only the first page was read, so a commit with more than 30 associated pull requests could silently fail release detection.
* Job-summary tables are escaped correctly. The previous renderer joined strings, so a phase reason containing a `|` character — reasons interpolate branch names and pull-request titles — corrupted the rendered table.
* The GitHub token is held as a redacted value from the moment it is read, rather than as a plain string.

## Refactoring

Ported from `@savvy-web/github-action-effects` to `@effected/github-actions` and `@effected/github`. The action's interface is unchanged: the same four inputs, the same ten outputs, the same phase-detection algorithm, and the same `node24` runtime.

Two visible differences come with the move:

* Release detection no longer degrades on every error. Transport, rate-limit, not-found, rejected and unauthorized failures still fall back to commit-message detection, so a flaky or throttled API behaves as before. A malformed API response now fails the run instead of silently guessing from the commit message — previously any failure at all, including a malformed response, was absorbed. A run that used to succeed on a broken response will now go red, which is the intended trade: a wrong release decision is worse than a loud failure.
* Failure output is rendered differently, as a tagged one-line summary with the full cause at debug level.

Per-step summary lines are preserved. The legacy toolkit's `Step.groupStep` logged a one-line summary on a step's success in addition to the collapsible, buffer-on-success block; `program.ts`'s `step` helper now composes `ActionLogger.group` with `ActionLogger.withStep`, restoring that summary line exactly.

The bundle grows by 81,362 bytes, from 303,618 to 384,980. The markdown writer accounts for 101,451 of that; the rest of the port is 20,089 bytes smaller than the implementation it replaces. The action is loaded once per job rather than shipped to a browser, so the trade buys a correctness fix at a cost paid in a place that does not matter much.

## Dependencies

| Dependency | Type | Action | From | To |
| :--- | :--- | :--- | :--- | :--- |
| @savvy-web/github-action-effects | dependency | removed | ^3.1.0 | — |
| @effected/github-actions | dependency | added | — | ^0.5.0 |
| @effected/github | dependency | added | — | ^0.2.2 |
