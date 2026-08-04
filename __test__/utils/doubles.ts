import { ActionEnvironment, ActionOutputs } from "@effected/github-actions";
import { Effect, FileSystem, Layer } from "effect";

/**
 * Test doubles for this action's suites.
 *
 * @remarks
 * Helper code, never tests. Placed in `__test__/utils/` so the collection
 * contract cannot pick it up as a suite.
 */

/**
 * An {@link ActionEnvironment} that can actually serve a webhook payload.
 *
 * @remarks
 * **Why this exists rather than `ActionEnvironment.layerTest`.** `layerTest`
 * hard-provides `FileSystem.layerNoop({})`, and `make(env)` captures the
 * filesystem at layer-construction time — which is exactly why `payload` carries
 * no `FileSystem` in its requirement channel. Through `layerTest` the captured
 * filesystem is therefore the noop, and a seeded `GITHUB_EVENT_PATH` can never
 * resolve: the injection point is closed, not merely unseeded.
 *
 * `makeTest` returns `Effect<ActionEnvironmentShape, never, FileSystem>` and
 * leaves the filesystem injectable, so we compose it ourselves with a stub that
 * serves the event file. See dossier entry `D-06`.
 *
 * `makeTest` merges `overrides` over a complete set of runner defaults, so a
 * caller supplies only the variables its case actually turns on.
 */
export const actionEnvironmentTest = (
	env: Readonly<Record<string, string>>,
	payload: unknown = {},
): Layer.Layer<ActionEnvironment> => {
	const eventPath = "/github/workflow/event.json";
	const fs = FileSystem.layerNoop({
		readFileString: (path: string) =>
			path === eventPath
				? Effect.succeed(JSON.stringify(payload))
				: // Anything else is a read the test did not arrange. Failing here is
					// what stops `layerNoop`'s permissiveness from turning an unstubbed
					// read into a silent empty success.
					Effect.die(`unstubbed readFileString: ${path}`),
	});
	return Layer.effect(ActionEnvironment, ActionEnvironment.makeTest({ GITHUB_EVENT_PATH: eventPath, ...env })).pipe(
		Layer.provide(fs),
	);
};

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
