import { ActionOutputsTest } from "@savvy-web/github-action-effects/testing";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { PhaseDetectionResult } from "../schemas/domain.js";
import type { ParseChangesetsResult } from "./changesets.js";
import { writeJobSummary } from "./summary.js";

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

const run = async (input: {
	readonly phase: PhaseDetectionResult;
	readonly changesets: ParseChangesetsResult;
	readonly inputs: { readonly releaseBranch: string; readonly targetBranch: string };
}) => {
	const state = ActionOutputsTest.empty();
	await Effect.runPromise(
		writeJobSummary(input).pipe(Effect.provide(ActionOutputsTest.layer(state))) as Effect.Effect<void, never, never>,
	);
	return state.summaries.join("\n\n");
};

describe("writeJobSummary", () => {
	it("emits Workflow Control / Phase / Context / Changesets sections", async () => {
		const out = await run({
			phase: phase(),
			changesets: changesets(),
			inputs: { releaseBranch: "changeset-release/main", targetBranch: "main" },
		});
		expect(out).toMatch(/Workflow Control/);
		expect(out).toMatch(/Phase/);
		expect(out).toMatch(/branch-management/);
		expect(out).toMatch(/changeset-release\/main/);
		expect(out).toMatch(/Changesets/);
	});

	it("renders affected packages and release type when present", async () => {
		const out = await run({
			phase: phase(),
			changesets: changesets({
				hasChangesets: true,
				changesetCount: 2,
				releaseType: "minor",
				affectedPackages: ["pkg-a", "pkg-b"],
			}),
			inputs: { releaseBranch: "changeset-release/main", targetBranch: "main" },
		});
		expect(out).toMatch(/pkg-a/);
		expect(out).toMatch(/pkg-b/);
		expect(out).toMatch(/minor/);
	});

	it("renders merged PR number when phase is publishing", async () => {
		const out = await run({
			phase: phase({
				phase: "publishing",
				isReleaseCommit: true,
				mergedReleasePRNumber: 42,
				reason: "Merged release PR #42",
			}),
			changesets: changesets(),
			inputs: { releaseBranch: "changeset-release/main", targetBranch: "main" },
		});
		expect(out).toMatch(/#42/);
	});
});
