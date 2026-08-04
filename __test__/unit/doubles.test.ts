import { ActionEnvironment, ActionOutputs } from "@effected/github-actions";
import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { actionEnvironmentTest, actionOutputsRecording } from "../utils/doubles.js";

/**
 * The doubles' own guards, demonstrated.
 *
 * @remarks
 * Discharges ruling **R10**, which requires *proving* the `FileSystem.layerNoop`
 * stub fails on a read it did not arrange rather than assuming it. `layerNoop`
 * has a recorded false-green mode: a permissive stub answers reads it was never
 * given, and the unstubbed read then surfaces as a silent empty success inside
 * the code under test.
 *
 * A guard asserted only by construction is not a guard.
 */

describe("actionEnvironmentTest", () => {
	it("serves the payload it was given", async () => {
		const payload = { head_commit: { message: "feat: a thing" } };
		const result = await Effect.runPromise(
			ActionEnvironment.pipe(
				Effect.flatMap((env) => env.payload),
				Effect.provide(actionEnvironmentTest({}, payload)),
			),
		);
		expect(result).toEqual(payload);
	});

	it("serves the env overrides it was given", async () => {
		const result = await Effect.runPromise(
			ActionEnvironment.pipe(
				Effect.flatMap((env) => env.github),
				Effect.provide(actionEnvironmentTest({ GITHUB_REF: "refs/heads/trunk" }, {})),
			),
		);
		expect(result.ref).toBe("refs/heads/trunk");
	});

	/**
	 * The R10 discriminating test.
	 *
	 * @remarks
	 * Overriding `GITHUB_EVENT_PATH` points `payload` at a file the double never
	 * arranged. A permissive stub would answer with an empty string, `JSON.parse`
	 * would fail as a *typed* environment error, and the test would look like an
	 * ordinary handled failure. The double must **die** instead, so the gap is
	 * unmissable and names the path it was asked for.
	 */
	it("dies on a filesystem read it did not arrange", async () => {
		const exit = await Effect.runPromiseExit(
			ActionEnvironment.pipe(
				Effect.flatMap((env) => env.payload),
				Effect.provide(actionEnvironmentTest({ GITHUB_EVENT_PATH: "/not/arranged.json" }, {})),
			),
		);

		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			// A defect, not a typed failure: the test arranged the wrong thing, and
			// that is a bug in the test rather than a condition the action handles.
			expect(Cause.hasDies(exit.cause)).toBe(true);
			expect(Cause.pretty(exit.cause)).toContain("/not/arranged.json");
		}
	});
});

describe("actionOutputsRecording", () => {
	it("records writes in order, preserving duplicates", async () => {
		const { recorder, layer } = actionOutputsRecording();
		await Effect.runPromise(
			ActionOutputs.pipe(
				Effect.flatMap((outputs) =>
					Effect.gen(function* () {
						yield* outputs.set("phase", "none");
						yield* outputs.set("reason", "first");
						yield* outputs.set("reason", "second");
					}),
				),
				Effect.provide(layer),
			),
		);

		// The sequence, not a map: a map would collapse the two `reason` writes
		// into one entry, which is exactly the duplicate the outputs suite exists
		// to catch.
		expect(recorder.writes).toEqual([
			{ name: "phase", value: "none" },
			{ name: "reason", value: "first" },
			{ name: "reason", value: "second" },
		]);
	});

	it("records summaries separately from outputs", async () => {
		const { recorder, layer } = actionOutputsRecording();
		await Effect.runPromise(
			ActionOutputs.pipe(
				Effect.flatMap((outputs) => outputs.summary("## panel")),
				Effect.provide(layer),
			),
		);
		expect(recorder.summaries).toEqual(["## panel"]);
		expect(recorder.writes).toEqual([]);
	});

	/**
	 * The other half of the doubles contract: unstubbed members die naming
	 * themselves, so a passing test is evidence nothing beyond `set` and
	 * `summary` was touched.
	 */
	it("dies on an ActionOutputs member it did not stub", async () => {
		const { layer } = actionOutputsRecording();
		const exit = await Effect.runPromiseExit(
			ActionOutputs.pipe(
				Effect.flatMap((outputs) => outputs.exportVariable("FOO", "bar")),
				Effect.provide(layer),
			),
		);
		expect(Exit.isFailure(exit)).toBe(true);
	});
});
