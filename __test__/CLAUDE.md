# `__test__/CLAUDE.md`

Test conventions for silk-router-action.

**Start at [`../okf/index.md`](../okf/index.md).** For the collection contract
and environment-strip rule, [`test-layout`](../okf/conventions/test-layout.md);
for injecting inputs, [`inject-inputs-by-provider`](../okf/conventions/inject-inputs-by-provider.md);
for the discriminating-mutant discipline, [`mutate-the-edges`](../okf/conventions/mutate-the-edges.md);
for known traps, the [gotchas index](../okf/gotchas/index.md) — in particular
[`zero-of-zero-passed`](../okf/gotchas/zero-of-zero-passed.md),
[`unserved-payload-fails-typed`](../okf/gotchas/unserved-payload-fails-typed.md),
[`config-provider-from-env-silently-misses`](../okf/gotchas/config-provider-from-env-silently-misses.md),
and [`withstep-invisible-through-double`](../okf/gotchas/withstep-invisible-through-double.md).

## Doubles

Live in `__test__/utils/doubles.ts`: `actionEnvironmentTest(env, payload?)` and
`actionOutputsRecording()`. See [`test-layout`](../okf/conventions/test-layout.md)
and [`unserved-payload-fails-typed`](../okf/gotchas/unserved-payload-fails-typed.md)
for `actionEnvironmentTest`'s non-obvious behavior around the unserved `payload`
argument.

No concept in the bundle covers `actionOutputsRecording()` itself, so the fact
stays here: it records the **sequence** of writes, not a final map — a map
would collapse a duplicate write into one entry and prove presence rather than
correctness, and "every output name is written exactly once" is the claim the
outputs suite makes. Only `set` and `summary` are stubbed; every other member
dies naming itself, so a passing test is evidence nothing else was touched.

## Running

Prefer the `run_tests` MCP tool. Shelling out directly skips persistence:

```bash
npx vitest run __test__/unit/schema/outputs.test.ts --coverage.enabled=false
```
