# `__test__/CLAUDE.md`

Test conventions for silk-router-action.

## The collection contract

Two collected locations, and only two:

- **`__test__/unit/`** — mirrors `src/` module for module. `*.test.ts`.
- **`__test__/integration/`** — whole-pipeline tests. `*.int.test.ts`, plus
  `fixtures/` when a case needs one.

**`__test__/utils/` is helper code and contains no tests.** A file placed
outside the two collected locations can be silently skipped by project-scoped
discovery — indistinguishable from a green suite. If you add a third location,
assert its placement executably.

## The environment rule

`vitest.setup.ts` deletes `GITHUB_ACTIONS`, `GITHUB_OUTPUT` and `GITHUB_STATE`
from the process before vitest forks its workers. `src/main.ts` guards its
`Action.run` call on `GITHUB_ACTIONS`, so without that strip, importing the entry
point in a suite would **execute the action mid-run**.

Never restore those variables inside a test.

## Doubles

Live in `__test__/utils/doubles.ts`.

### `actionEnvironmentTest(env, payload)`

Use this instead of `ActionEnvironment.layerTest` whenever a test needs the
webhook payload.

`layerTest` hard-provides `FileSystem.layerNoop({})`, and the environment
captures its filesystem at layer-construction time — which is why `payload`
carries no `FileSystem` in its requirement channel. Through `layerTest` that
captured filesystem is the noop, so a seeded `GITHUB_EVENT_PATH` **can never
resolve**: the injection point is closed, not merely unseeded. `makeTest` leaves
the filesystem injectable, which is what this double exploits.

Its stub **dies** on any read it did not arrange, which is what stops
`layerNoop`'s permissiveness from turning an unstubbed read into a silent empty
success.

### `actionOutputsRecording()`

Records the **sequence** of writes, not a final map. A map collapses a duplicate
write into one entry and proves presence rather than correctness — and "every
output name is written exactly once" is the claim the outputs suite makes.

Only `set` and `summary` are stubbed; every other member dies naming itself, so a
passing test is evidence nothing else was touched.

## Injecting inputs

By **provider**, per case — never by mutating `process.env` between reads. The
environment is seeded once at construction; mutating it mid-suite is a quiet
false green, not a loud failure.

**Use `ActionInput.provider(env)`, keyed by input name:**

```ts
Effect.provide(readInputs, ConfigProvider.layer(ActionInput.provider({ "target-branch": "trunk" })));
```

It accepts `with:`-block-shaped keys and derives the runner variable itself, so
the mangling cannot be got wrong. It also accepts a verbatim `INPUT_…` key when a
test genuinely needs one — and for that, call `ActionInput.variable(name)` rather
than writing the literal.

⚠️ **Do not reach for `ConfigProvider.fromEnv({ env })`.** It uppercases and
joins the config path, so an input-name key like `"target-branch"` is looked up
as `TARGET-BRANCH` and **silently never matches** — the read falls through to its
default and the test passes against the wrong value. This bit the integration
suite: a supplied `target-branch` did nothing, and only an assertion on the
*resulting phase* caught it.

⚠️ **The mangling preserves hyphens.** `release-branch` becomes
`INPUT_RELEASE-BRANCH` — only *spaces* become underscores. A test seeding
`INPUT_RELEASE_BRANCH` reads as absent on a real runner.

**On `providerOver`:** it mirrors production by retrying a single-segment path
through the `INPUT_` derivation, which means a bare `Config.string("x")` also
resolves under it. Useful for asserting the production path composes — but
useless for asserting a module reads the mangled key *itself*, since that claim
survives the mutation. Verified: swapping `ActionInput.string` for
`Config.string` under `providerOver` left the suite green.

## Mutate the edges

A test that cannot fail is worse than no test. Before calling a suite done,
break the thing it guards and confirm it goes red. Recorded discriminating
mutants for this repo:

| Mutant | Must break |
| --- | --- |
| `ActionInput.string` → `Config.string` in `schema/inputs.ts` | the bare-provider mangled-key test |
| `emitOutputs` writes a name twice | the exactly-once and declared-order tests |
| `emitOutputs` skips a name | the exactly-once test |
| the merge predicate in `detectPhase` inverted | the phase tests *(Phase B)* |
| `release-prefix` retry gate forced off | the propagation-lag tests *(Phase B)* |

Read the reporter's `Tests:` line and its unhandled-errors list — not the exit
code. A project-filtered run from the wrong directory prints `0/0 passed` and
exits 0.

## Running

Prefer the `run_tests` MCP tool. Shelling out directly skips persistence:

```bash
npx vitest run __test__/unit/schema/outputs.test.ts --coverage.enabled=false
```
