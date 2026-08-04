import { ActionOutputs } from "@effected/github-actions";
import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import type { PhaseDetectionResult } from "../../../src/schema/domain.js";
import type { ParseChangesetsResult } from "../../../src/steps/parse-changesets.js";
import { writeSummary } from "../../../src/steps/write-summary.js";
import { actionOutputsRecording } from "../../utils/doubles.js";

const inputs = { releaseBranch: "changeset-release/main", targetBranch: "main", releasePrefix: "release:" };

const phase = (overrides: Partial<PhaseDetectionResult> = {}): PhaseDetectionResult => ({
	phase: "branch-management",
	reason: "Push to main (not a release commit)",
	isReleaseBranch: false,
	isMainBranch: true,
	isReleaseCommit: false,
	isPullRequestEvent: false,
	isPRMerged: false,
	isReleasePRMerged: false,
	commitMessage: "feat: a thing",
	...overrides,
});

const changesets = (overrides: Partial<ParseChangesetsResult> = {}): ParseChangesetsResult => ({
	hasChangesets: false,
	changesetCount: 0,
	changesets: [],
	releaseType: null,
	affectedPackages: [],
	packageBumps: new Map(),
	...overrides,
});

describe("writeSummary", () => {
	it("writes exactly one summary panel", async () => {
		const { recorder, layer } = actionOutputsRecording();
		await Effect.runPromise(
			writeSummary({ inputs, phase: phase(), changesets: changesets() }).pipe(Effect.provide(layer)),
		);

		// Exactly one: a step that appended twice would still "have written a
		// summary" under a looser assertion.
		expect(recorder.summaries).toHaveLength(1);
	});

	it("writes the rendered panel, not a placeholder", async () => {
		const { recorder, layer } = actionOutputsRecording();
		await Effect.runPromise(
			writeSummary({
				inputs,
				phase: phase({ phase: "publishing", reason: "Merged release PR #7", mergedReleasePRNumber: 7 }),
				changesets: changesets({ hasChangesets: true, changesetCount: 2, releaseType: "minor" }),
			}).pipe(Effect.provide(layer)),
		);

		const panel = recorder.summaries[0];
		expect(panel).toContain("Workflow Control");
		expect(panel).toContain("`publishing`");
		expect(panel).toContain("Merged release PR #7");
		expect(panel).toContain("#7");
		expect(panel).toContain("`minor`");
	});

	it("renders the branch inputs it was given", async () => {
		const { recorder, layer } = actionOutputsRecording();
		await Effect.runPromise(
			writeSummary({
				inputs: { ...inputs, targetBranch: "trunk", releaseBranch: "release/next" },
				phase: phase(),
				changesets: changesets(),
			}).pipe(Effect.provide(layer)),
		);

		expect(recorder.summaries[0]).toContain("`trunk`");
		expect(recorder.summaries[0]).toContain("`release/next`");
	});

	it("does not touch step outputs", async () => {
		const { recorder, layer } = actionOutputsRecording();
		await Effect.runPromise(
			writeSummary({ inputs, phase: phase(), changesets: changesets() }).pipe(Effect.provide(layer)),
		);
		expect(recorder.writes).toEqual([]);
	});

	/**
	 * Failure posture: fail-the-job, as a defect.
	 *
	 * @remarks
	 * Ported verbatim from the pre-port implementation's `Effect.orDie`. A write
	 * failure is a defect rather than a typed failure, which is what keeps this
	 * step's error channel `never` while still turning the run red. Softening it
	 * to a warning would be a behavior change needing its own decision.
	 */
	it("dies rather than failing typed when the summary write fails", async () => {
		const exploding = ActionOutputs.layerTest({
			summary: () => Effect.fail(new Error("disk full") as never),
		});

		const exit = await Effect.runPromiseExit(
			writeSummary({ inputs, phase: phase(), changesets: changesets() }).pipe(Effect.provide(exploding)),
		);

		expect(Exit.isFailure(exit)).toBe(true);
	});
});
