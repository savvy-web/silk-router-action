# Convention

* [Break the guarded thing before calling a suite done](mutate-the-edges.md) - Before calling a test suite done, mutate the code it guards and confirm the suite goes red; keep a recorded mutant-to-test table for this repo's discriminating mutants.
* [Collect tests only from unit and integration, never restore stripped env vars](test-layout.md) - Place every test under \_\_test\_\_/unit or \_\_test\_\_/integration, keep \_\_test\_\_/utils free of tests, and never restore the environment variables vitest.setup.ts strips.
* [Inject test inputs by provider, never by mutating process.env](inject-inputs-by-provider.md) - Seed action inputs per test case through ActionInput.provider(env) and ConfigProvider.layer, and never mutate process.env between reads.
* [Read inputs through ActionInput, resolve Repo per call, emit through one emitter](kit-seams.md) - Use the kit's own seams instead of bare Config, a captured Repo, or a scattered set of output writes.
* [Shape every step module the same way](step-module-shape.md) - Export a result type, a tagged error only when the step can fail, an annotated requirement channel, and the step; document its failure posture; wrap it with group and withStep.
* [action.yml is the single source of input and output names](action-yml-single-source.md) - Declare every input and output name, and every default, in action.yml only; the schema/ tuples mirror it and never re-declare it.
