---
"@savvy-web/silk-router-action": minor
---

## Refactoring

Migrates the entire action runtime to Effect v4. Domain schemas, services, layers, and their co-located tests were rewritten against the v4 API surface — `Schema.Literals` for enumerated unions, class-based `Context.Service` (with an exported `PhaseDetectorShape`), the flattened `Cause`, and `TestClock.layer()` in tests. Phase-detection behavior and the action's `action.yml` inputs and outputs are unchanged.

## Dependencies

| Dependency | Type | Action | From | To |
| :--------- | :--------------- | :------ | :------- | :------------- |
| effect | dependency | updated | ^3.21.4 | 4.0.0-beta.98 |
| @effect/platform-node | dependency | updated | ^0.107.0 | 4.0.0-beta.98 |
| @effect/platform | dependency | removed | ^0.96.2 | — |
| @savvy-web/github-action-effects | dependency | updated | ^2.4.0 | ^3.0.0 |
| @savvy-web/github-action-builder | devDependency | updated | ^1.1.2 | ^2.0.0 |
| @savvy-web/silk | devDependency | updated | ^2.4.2 | ^3.0.0 |

`effect` and `@effect/platform-node` now resolve through `catalog:effect`; `@effect/platform` is dropped because its modules moved into `effect` core.

## Build System

`vitest.config.ts` temporarily runs a basic Vitest config with the `@vitest-agent/plugin` integration commented out. The plugin's latest release is still on the Effect v3 line and cannot load alongside Effect v4; the integration is restored once a v4-compatible plugin ships.
