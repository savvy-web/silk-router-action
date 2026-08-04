import type { PullRequestInfo } from "@effected/github";
import { PullRequest, Repo, RepoRef } from "@effected/github";
import { ActionInput, ActionLogger } from "@effected/github-actions";
import { Cause, ConfigProvider, DateTime, Effect, Exit, FileSystem, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";
import { program } from "../../src/program.js";
import { OUTPUT_NAMES } from "../../src/schema/outputs.js";
import { actionEnvironmentTest, actionOutputsRecording } from "../utils/doubles.js";

/**
 * The pipeline, end to end.
 *
 * @remarks
 * Real input reading, real composition, real detection, real output emission and
 * a real summary write. Began life as the walking skeleton's proof-of-wiring over
 * inert stubs; now that every step is filled it is the only place the whole chain
 * is exercised together, which is what the unit suites individually cannot claim.
 */

const runProgram = async (
	env: Readonly<Record<string, string>> = {},
	options: { readonly commitMessage?: string; readonly associated?: ReadonlyArray<PullRequestInfo> } = {},
) => {
	const { recorder, layer: outputs } = actionOutputsRecording();
	// Every service the program's requirement channel declares, and nothing more.
	// Under-provide and this stops compiling — which is the point: layer
	// minimalism is proven by the type checker, not by a runtime assertion that
	// happens to pass because a stub never reached for the missing service.
	const layer = Layer.mergeAll(
		outputs,
		ActionLogger.layerSilent,
		actionEnvironmentTest(
			{ GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "push", GITHUB_SHA: "abc" },
			{ head_commit: { message: options.commitMessage ?? "feat: a thing" } },
		),
		PullRequest.layerTest({ listAssociatedWithCommit: () => Effect.succeed(options.associated ?? []) }),
		Repo.layer(RepoRef.make({ owner: "acme", repo: "example" })),
		FileSystem.layerNoop({}),
	);
	await Effect.runPromise(
		program.pipe(
			Effect.provide(layer),
			// `ActionInput.provider` — keyed by input name, and it derives the runner
			// variable itself. `providerOver(fromEnv)` would not do: `fromEnv`
			// uppercases the path, so an input-name key never matches.
			Effect.provide(ConfigProvider.layer(ActionInput.provider(env))),
		),
	);
	return recorder;
};

describe("program", () => {
	it("runs green end to end", async () => {
		await expect(runProgram()).resolves.toBeDefined();
	});

	it("emits all 10 outputs exactly once", async () => {
		const recorder = await runProgram();

		const counts = new Map<string, number>();
		for (const write of recorder.writes) {
			counts.set(write.name, (counts.get(write.name) ?? 0) + 1);
		}

		expect(recorder.writes).toHaveLength(10);
		for (const name of OUTPUT_NAMES) {
			expect(counts.get(name), `output "${name}"`).toBe(1);
		}
	});

	it("reports branch-management for an ordinary push to the target branch", async () => {
		const recorder = await runProgram();
		const byName = Object.fromEntries(recorder.writes.map((w) => [w.name, w.value]));

		expect(byName.phase).toBe("branch-management");
		expect(byName.should_continue).toBe("true");
		expect(byName.is_release_commit).toBe("false");
		expect(byName.merged_pr_number).toBe("");
	});

	it("carries a detected release all the way through to the outputs", async () => {
		// The end-to-end claim the unit suites cannot make: a real detection
		// reaching the real output fold and the real summary write.
		const recorder = await runProgram(
			{},
			{
				commitMessage: "release: v1.2.3",
				associated: [
					{
						number: 77,
						nodeId: "PR_1",
						url: "u",
						title: "Version Packages",
						state: "closed",
						head: "changeset-release/main",
						headSha: "a",
						base: "main",
						baseSha: "b",
						draft: false,
						merged: true,
						mergedAt: Option.some(DateTime.makeUnsafe(0)),
					} as PullRequestInfo,
				],
			},
		);
		const byName = Object.fromEntries(recorder.writes.map((w) => [w.name, w.value]));

		expect(byName.phase).toBe("publishing");
		expect(byName.should_continue).toBe("true");
		expect(byName.is_release_commit).toBe("true");
		expect(byName.merged_pr_number).toBe("77");
		expect(recorder.summaries[0]).toContain("`publishing`");
	});

	/**
	 * The `ConfigProvider` composes through the whole program — asserted by value.
	 *
	 * @remarks
	 * This test previously asserted only a write count, because every consumer of
	 * `target-branch` was a stub and no supplied input was observable. That
	 * restriction is gone now `detect-phase` is filled, and the restoration point
	 * named at the time is taken up here: a non-default `target-branch` changes
	 * the detected phase, which is a real value assertion rather than a wiring
	 * claim dressed up as one.
	 */
	it("routes a supplied target-branch all the way into the detected phase", async () => {
		// The run is on `refs/heads/main`, so naming a *different* target branch
		// must stop it being the target — proving the input reached detection.
		const recorder = await runProgram({ "target-branch": "trunk" });
		const byName = Object.fromEntries(recorder.writes.map((w) => [w.name, w.value]));

		expect(byName.is_main_branch).toBe("false");
		expect(byName.phase).toBe("none");
		expect(byName.should_continue).toBe("false");
	});
});

describe("program (failure path)", () => {
	/**
	 * A failed run must still publish the contract.
	 *
	 * @remarks
	 * A deliberate departure from the pre-port program, which emitted nothing on
	 * failure. This action exists only to gate other workflows, so a failed run
	 * that publishes nothing leaves a consumer's
	 * `if: … should_continue == 'true'` reading an empty string rather than an
	 * explicit `"false"`.
	 *
	 * Fault-injected through `ActionLogger.group`, which every step passes
	 * through — the steps' own failure modes are covered in their unit suites.
	 */
	const runFailing = async () => {
		const { recorder, layer: outputs } = actionOutputsRecording();
		const exploding = ActionLogger.layerTest({
			group: () => Effect.die("injected step failure"),
			withBuffer: (_label, effect) => effect,
		});
		const layer = Layer.mergeAll(
			outputs,
			exploding,
			actionEnvironmentTest({ GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "push" }, { head_commit: {} }),
			PullRequest.layerTest(),
			Repo.layer(RepoRef.make({ owner: "acme", repo: "example" })),
			FileSystem.layerNoop({}),
		);
		const exit = await Effect.runPromiseExit(
			program.pipe(Effect.provide(layer), Effect.provide(ConfigProvider.layer(ActionInput.provider({})))),
		);
		return { recorder, exit };
	};

	it("fails rather than reporting success", async () => {
		const { exit } = await runFailing();
		expect(Exit.isFailure(exit)).toBe(true);
	});

	it("emits the all-disabled contract on the failure path", async () => {
		const { recorder } = await runFailing();
		const byName = Object.fromEntries(recorder.writes.map((w) => [w.name, w.value]));

		expect(recorder.writes).toHaveLength(10);
		expect(byName.should_continue).toBe("false");
		expect(byName.phase).toBe("none");
	});

	it("does not replace the original cause with an output-write error", async () => {
		const { exit } = await runFailing();
		if (Exit.isFailure(exit)) {
			expect(Cause.pretty(exit.cause)).toContain("injected step failure");
		}
	});
});
