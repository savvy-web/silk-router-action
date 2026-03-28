# .github/workflows/CLAUDE.md

GitHub Actions workflow testing and CI configuration.

**Parent:** [Root CLAUDE.md](../../CLAUDE.md)

**For comprehensive testing strategy:**
-> `@../../.claude/design/silk-router-action/testing-strategy.md`

Load when modifying CI workflows, adding test fixtures, or debugging CI
failures.

## Overview

Matrix-based testing with a unified `test-fixture` composite action that
handles setup, execution, and verification for each scenario.

## Workflows

### test.yml

Main CI workflow (push + PR triggers):

- **unit-tests** -- Checkout, workflow-runtime-action, typecheck + lint + test
- **integration-test** -- Checkout, workflow-runtime-action, build, then 6
  test-fixture matrix entries
- **summary** -- Aggregates results (`if: always()`)

## Reusable Composite Actions

### test-fixture (.github/actions/test-fixture/action.yml)

Combines fixture setup, action execution, and output validation in one action.

**Inputs:** `fixture` (required), `title` (required), plus optional
`expected-*` values for validation.

**Flow:**

1. Clean workspace, copy fixture files (Python script)
2. Run `node dist/main.js` with mocked GITHUB env vars
3. Verify outputs against expected values (Python script)
4. Fail if mismatches

### local (.github/actions/local/)

Local copy of compiled action. Built by `pnpm build` from `action.config.ts`.
Must be rebuilt and committed when source changes.

## Test Fixtures

Single source of truth at `.github/workflows/__fixtures__/`:

```text
events/              Event payload JSON (push-main, pr-merged, etc.)
pnpm/
  pnpm-basic/        Single package, no changesets
  pnpm-basic-changesets/  Single package with .changeset/
  pnpm-basic-monorepo/   Multi-package workspace
```

## Adding Tests

- **New matrix entry:** Add to existing matrix in test.yml
- **New fixture:** Create directory in `__fixtures__/pnpm/` with package.json
  containing devEngines fields, then reference in workflow matrix

## Debugging

| Error | Fix |
| --- | --- |
| `Fixture 'X' not found` | Create in `__fixtures__/` |
| `Expected X but got Y` | Check action logic or update expected values |
| `Command not found` | Verify runtime installation |
