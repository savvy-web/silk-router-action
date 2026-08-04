import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { PhaseDetectionResult } from "../../../src/schema/domain.js";
import type { OutputValues } from "../../../src/schema/outputs.js";
import { DISABLED_OUTPUTS, OUTPUT_NAMES, emitOutputs, foldOutputs } from "../../../src/schema/outputs.js";
import type { ParseChangesetsResult } from "../../../src/steps/parse-changesets.js";
import { actionOutputsRecording } from "../../utils/doubles.js";

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

describe("output contract", () => {
	// The frozen parity contract is 10 outputs. This is the code-side leg of the
	// three-way check; the manifest leg lives in parity.test.ts.
	it("declares exactly 10 names", () => {
		expect(OUTPUT_NAMES).toHaveLength(10);
		expect(new Set(OUTPUT_NAMES).size).toBe(10);
	});

	it("has a disabled default for every declared name", () => {
		expect(Object.keys(DISABLED_OUTPUTS).sort()).toEqual([...OUTPUT_NAMES].sort());
	});
});

describe("emitOutputs", () => {
	const run = async (values: OutputValues) => {
		const { recorder, layer } = actionOutputsRecording();
		await Effect.runPromise(emitOutputs(values).pipe(Effect.provide(layer)));
		return recorder;
	};

	it("writes every declared name exactly once", async () => {
		const recorder = await run(DISABLED_OUTPUTS);

		// Count per name rather than compare a final map: a map collapses a
		// duplicate write into one entry, proving presence but not correctness.
		const counts = new Map<string, number>();
		for (const write of recorder.writes) {
			counts.set(write.name, (counts.get(write.name) ?? 0) + 1);
		}

		expect(recorder.writes).toHaveLength(OUTPUT_NAMES.length);
		for (const name of OUTPUT_NAMES) {
			expect(counts.get(name), `output "${name}" write count`).toBe(1);
		}
	});

	it("writes no name outside the frozen inventory", async () => {
		const recorder = await run(DISABLED_OUTPUTS);
		const declared = new Set<string>(OUTPUT_NAMES);
		expect(recorder.writes.filter((w) => !declared.has(w.name))).toEqual([]);
	});

	it("emits in the declared order", async () => {
		const recorder = await run(DISABLED_OUTPUTS);
		expect(recorder.writes.map((w) => w.name)).toEqual([...OUTPUT_NAMES]);
	});
});

describe("foldOutputs", () => {
	it("stringifies booleans as true/false", () => {
		const values = foldOutputs({
			phase: phase({ isMainBranch: true, isReleaseBranch: false }),
			changesets: changesets(),
		});
		expect(values.is_main_branch).toBe("true");
		expect(values.is_release_branch).toBe("false");
	});

	it("renders an absent merged PR number as empty string, not 'undefined'", () => {
		const values = foldOutputs({ phase: phase(), changesets: changesets() });
		expect(values.merged_pr_number).toBe("");
	});

	it("renders a present merged PR number", () => {
		const values = foldOutputs({ phase: phase({ mergedReleasePRNumber: 42 }), changesets: changesets() });
		expect(values.merged_pr_number).toBe("42");
	});

	it("renders a null release type as empty string", () => {
		const values = foldOutputs({ phase: phase(), changesets: changesets({ releaseType: null }) });
		expect(values.release_type).toBe("");
	});

	it("derives should_continue from the phase, not from a separate flag", () => {
		expect(foldOutputs({ phase: phase({ phase: "none" }), changesets: changesets() }).should_continue).toBe("false");
		expect(foldOutputs({ phase: phase({ phase: "publishing" }), changesets: changesets() }).should_continue).toBe(
			"true",
		);
	});

	it("produces a complete contract for every fold", () => {
		const values = foldOutputs({ phase: phase(), changesets: changesets() });
		expect(Object.keys(values).sort()).toEqual([...OUTPUT_NAMES].sort());
	});
});
