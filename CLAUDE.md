# silk-router-action

Composable GitHub Action for Silk release pipeline phase detection and release
plan computation. First action in the Silk system -- inspects GitHub event
context and changeset state to route to the correct downstream action.

## Commands

```bash
pnpm build              # Build action via github-action-builder (turbo)
pnpm lint               # Biome check (formatting + linting)
pnpm lint:fix           # Biome auto-fix
pnpm lint:md            # Markdown lint
pnpm vitest run         # All tests (unit + integration)
pnpm vitest run --project silk-router-action:unit  # 57 unit tests
pnpm vitest run --project silk-router-action:int   # 6 integration tests
```

## Architecture

Effect-TS action with composable service layers. Entry points:

- `src/main.ts` -- Action.run with GitHubApp.withToken (acquireUseRelease)
- `src/post.ts` -- No-op (token revoked automatically by bracket pattern)
- `src/program.ts` -- Core routing pipeline, testable via layer substitution

Services in `src/services/`, schemas in `src/schemas/`, layers in
`src/layers/`.

**For detailed architecture:**
-> `@./.claude/design/silk-router-action/architecture.md`

Load when working on service wiring, layer composition, or entry point changes.

## Phase Detection

Routing priority (highest first):

1. PR merged release PR -> `close-issues`
2. PR open release PR -> `silk-validate`
3. Push to target + release commit + publishable -> `silk-publish`
4. Push to target + release commit + not publishable -> `silk-release`
5. Push to release branch -> `silk-validate`
6. Push to target + changesets -> `silk-branch`
7. Push to target + no changesets -> `skip`
8. Everything else -> `skip`

## Action Inputs/Outputs

**Inputs:** `app-id` (required), `private-key` (required), `target-branch`
(default: main), `release-branch` (default: changeset-release/main)

**Outputs:** `next-phase`, `reason`, `release-plan` (JSON), `trigger` (JSON)

## Coding Standards

- `Schema.Class` for domain types (not interface/type)
- `Context.Tag` + `Layer.effect`/`Layer.succeed` for services
- Every service exports `*Test.layer()` for testing
- `Config.redacted()` for secrets (not deprecated `Config.secret`)
- `.js` extensions on all imports
- No `@actions/core` -- use `@savvy-web/github-action-effects`
- No `vi.mock()` -- pure layer substitution

**For Effect patterns and best practices:**
-> `@./.claude/design/silk-router-action/effect-best-practices.md`

Load when writing new services, error handling, or layer composition.

## Testing

Three-layer approach: unit (Vitest layer substitution), local integration
(execa + dist/main.js), CI integration (GitHub Actions matrix).

- Unit tests: `__test__/` mirroring `src/` structure
- Integration tests: `__test__/integration/`
- CI fixtures: `.github/workflows/__fixtures__/`

**For testing patterns and infrastructure:**
-> `@./.claude/design/silk-router-action/testing-strategy.md`

Load when writing tests, debugging failures, or modifying test infrastructure.

## Implementation Status

**For current progress and spec divergences:**
-> `@./.claude/design/silk-router-action/implementation-status.md`

Load when planning next implementation steps or checking what is done.

## Tooling

- **Build:** `github-action-builder` via turbo (outputs to `dist/` and
  `.github/actions/local/`)
- **Lint:** Biome (formatting + linting), markdownlint-cli2
- **Test:** Vitest multi-project (unit + int)
- **CI:** `workflow-runtime-action` sets up Node.js, pnpm, biome from
  devEngines
- **Commits:** commitlint via savvy-commit (avoid `__path__` in commit body --
  triggers markdown detection)

## Child Context Files

- `src/CLAUDE.md` -- Source code architecture and service map
- `.github/workflows/CLAUDE.md` -- CI workflow testing strategy
