---
type: Interface
title: action-contract
description: The action's inputs, outputs, and phase values, from the consumer's side.
status: draft
kind: runtime
resource: ../../action.yml
generated:
  by: okfit/claude-code
  at: 2026-09-13T20:08:30Z
  body_sha256: 4e1e97d7bfded0319a9dd13a785c17503a191b107e7811707bbe3a7aa13286e1
sources:
  - id: action-yml
    resource: ../../action.yml
  - id: root-claude-md
    resource: ../../CLAUDE.md
  - id: program-ts
    resource: ../../src/program.ts
  - id: outputs-ts
    resource: ../../src/schema/outputs.ts
---

# Action contract

`action.yml` is the single source of truth for this action's inputs and
outputs; the tuples in `src/schema/` mirror it and are checked against it by
a parity test rather than re-declaring it independently[^action-yml].

## Inputs

Four inputs, all optional[^action-yml]:

| Input | Default | Description |
| --- | --- | --- |
| `token` | `${{ github.token }}` | GitHub token for API calls (detects merged release PRs) |
| `release-branch` | `changeset-release/main` | Release branch name |
| `target-branch` | `main` | Target branch name (usually main) |
| `release-prefix` | `release:` | Commit-message prefix that gates release-detection retry on the target branch; an explicit empty string disables the retry |

## Outputs

Ten outputs, all strings[^action-yml]:

| Output | Description |
| --- | --- |
| `phase` | Detected workflow phase |
| `has_changesets` | Whether changeset files exist in `.changeset/` |
| `changeset_count` | Number of changeset files |
| `release_type` | Highest release type across changesets (`major`, `minor`, `patch`, or empty) |
| `is_release_commit` | Whether this commit is from a merged release PR |
| `is_release_branch` | Whether currently on the release branch |
| `is_main_branch` | Whether currently on the target (main) branch |
| `merged_pr_number` | PR number of the merged release PR, if detected (empty string otherwise) |
| `should_continue` | Whether the workflow should proceed (`phase` is not `none`) |
| `reason` | Human-readable explanation of the phase detection |

Booleans are serialized as the literal strings `"true"`/`"false"`; an absent
number (`merged_pr_number`) is the empty string, never `undefined` or
omitted[^outputs-ts].

## Phase values

Five phase values, each with a distinct trigger[^action-yml]:

| Phase | Trigger |
| --- | --- |
| `branch-management` | Push to the target branch, not a release commit — create or update the release branch |
| `validation` | Push to the release branch, or an open PR from the release branch to the target branch — run build, test, lint |
| `publishing` | A push to the target branch that is a merged release commit — publish packages |
| `close-issues` | A `pull_request` event where the release PR was merged — close linked issues |
| `none` | Any other scenario — no action needed |

## `should_continue` semantics

`should_continue` is `"true"` exactly when `phase` is not `none`; it is the
single boolean a consuming workflow step gates on, independent of which
specific phase fired.

## Workflow-split usage

Three workflows replace one monolithic workflow, each running this action
first and then conditionally proceeding[^root-claude-md]:

```yaml
# release-branch.yml - Phase 1: Create/update release branch
on:
  push:
    branches: [main]
# Uses: has_changesets && !is_release_commit

# release-validate.yml - Phase 2: Validate release branch
on:
  push:
    branches: [changeset-release/main]
# Always runs on release branch

# release-publish.yml - Phase 3: Publish on PR merge
on:
  pull_request:
    types: [closed]
    branches: [main]
# Uses: is_release_pr_merged
```

Each workflow invokes the action and then gates its phase-specific work on
`should_continue`[^root-claude-md]:

```yaml
- uses: savvy-web/silk-router-action@v1
  id: control
  with:
    token: ${{ secrets.GITHUB_TOKEN }}

- name: Run release step
  if: steps.control.outputs.should_continue == 'true'
  run: ...
```

`savvy-web/silk-router-action@v1` is the alias tag consumers should pin to
once it exists; the repository was renamed from
`savvy-web/workflow-control-action`, and GitHub auto-redirects the old
`uses:` path, but a consumer should still update it[^root-claude-md].

## Behavior on a failed run

A failed run still publishes the full ten-output contract with every value
set to its disabled default (`should_continue: "false"`), rather than
leaving outputs empty or absent. `program.ts` wraps the pipeline in
`Effect.onError(() => emitOutputs(DISABLED_OUTPUTS).pipe(Effect.ignore))`
(`src/program.ts:72`)[^program-ts], where `DISABLED_OUTPUTS` is the
all-disabled default record declared in `src/schema/outputs.ts`[^outputs-ts].
This means a consumer's `if: steps.control.outputs.should_continue ==
'true'` check reads an explicit `"false"` on failure rather than an empty
string that could be misread as "not yet set" by a differently written
conditional.

[^action-yml]: ../../action.yml
[^root-claude-md]: ../../CLAUDE.md
[^program-ts]: ../../src/program.ts
[^outputs-ts]: ../../src/schema/outputs.ts
</content>
