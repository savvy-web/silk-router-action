import { ActionEnvironment, ActionOutputs } from "@effected/github-actions";
import type { Layer } from "effect";
import { Effect } from "effect";

/**
 * Test doubles for this action's suites.
 *
 * @remarks
 * Helper code, never tests. Placed in `__test__/utils/` so the collection
 * contract cannot pick it up as a suite.
 */

/**
 * An {@link ActionEnvironment} serving a webhook payload.
 *
 * @remarks
 * A thin alias over `ActionEnvironment.layerTest`, kept so the ~40 call sites
 * read as one concept and so the payload argument stays named at the seam.
 *
 * This was a hand-built double until `@effected/github-actions@0.5.0`. `layerTest`
 * hard-provided `FileSystem.layerNoop({})` and `make(env)` captures the filesystem
 * at layer-construction time, so a seeded `GITHUB_EVENT_PATH` could never resolve —
 * the injection point was closed, not merely unseeded. The kit now serves the
 * payload directly through a second positional argument, so the filesystem stub
 * and its die guard are gone.
 *
 * **`payload` is deliberately not defaulted.** Omitting it means *not served*:
 * the shape falls back to reading `GITHUB_EVENT_PATH` through the stubbed
 * filesystem and fails typed, naming the variable. Defaulting it to `{}` here
 * would make that state unreachable and quietly delete the guard the hand-built
 * double existed to provide. A case that wants an empty payload passes `{}`.
 *
 * `layerTest` merges `overrides` over a complete set of runner defaults, so a
 * caller supplies only the variables its case actually turns on.
 */
export const actionEnvironmentTest = (
	env: Readonly<Record<string, string>>,
	payload?: unknown,
): Layer.Layer<ActionEnvironment> => ActionEnvironment.layerTest(env, payload);

/** One recorded output write. */
export interface RecordedOutput {
	readonly name: string;
	readonly value: string;
}

/** What {@link actionOutputsRecording} collected. */
export interface OutputRecorder {
	readonly writes: Array<RecordedOutput>;
	readonly summaries: Array<string>;
}

/**
 * An {@link ActionOutputs} that records every write.
 *
 * @remarks
 * Records the **sequence**, not a final map. A map collapses a duplicate write
 * into one entry and would prove presence rather than correctness — and "every
 * output name is written exactly once" is precisely the claim the outputs suite
 * makes.
 *
 * Only `set` and `summary` are stubbed; every other member dies naming itself,
 * which is what makes a passing test evidence that nothing else was touched.
 */
export const actionOutputsRecording = (): {
	readonly recorder: OutputRecorder;
	readonly layer: Layer.Layer<ActionOutputs>;
} => {
	const recorder: OutputRecorder = { writes: [], summaries: [] };
	const layer = ActionOutputs.layerTest({
		set: (name: string, value: string) =>
			Effect.sync(() => {
				recorder.writes.push({ name, value });
			}),
		summary: (content: string) =>
			Effect.sync(() => {
				recorder.summaries.push(content);
			}),
	});
	return { recorder, layer };
};
