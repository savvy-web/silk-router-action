// src/program.ts
import { ActionOutputs, Step } from "@savvy-web/github-action-effects";
import { Config, Effect } from "effect";
import { parseChangesets } from "./services/changesets.js";
import { PhaseDetector } from "./services/phase-detector.js";
import { writeJobSummary } from "./services/summary.js";

/* v8 ignore start -- orchestration; sub-effects are individually tested */

export const program = Effect.gen(function* () {
	const releaseBranch = yield* Config.string("release-branch").pipe(Config.withDefault("changeset-release/main"));
	const targetBranch = yield* Config.string("target-branch").pipe(Config.withDefault("main"));
	const releasePrefix = yield* Config.string("release-prefix").pipe(Config.withDefault("release:"));

	const outputs = yield* ActionOutputs;
	const detector = yield* PhaseDetector;

	const phase = yield* Step.groupStep(
		"Detect workflow phase",
		detector.detect({ releaseBranch, targetBranch, releasePrefix }),
	);
	const changesets = yield* Step.groupStep("Parse changesets", parseChangesets());

	yield* Step.groupStep(
		"Emit outputs",
		Effect.gen(function* () {
			yield* outputs.set("phase", phase.phase);
			yield* outputs.set("has_changesets", changesets.hasChangesets ? "true" : "false");
			yield* outputs.set("changeset_count", String(changesets.changesetCount));
			yield* outputs.set("release_type", changesets.releaseType ?? "");
			yield* outputs.set("is_release_commit", phase.isReleaseCommit ? "true" : "false");
			yield* outputs.set("is_release_branch", phase.isReleaseBranch ? "true" : "false");
			yield* outputs.set("is_main_branch", phase.isMainBranch ? "true" : "false");
			yield* outputs.set(
				"merged_pr_number",
				phase.mergedReleasePRNumber !== undefined ? String(phase.mergedReleasePRNumber) : "",
			);
			yield* outputs.set("should_continue", phase.phase !== "none" ? "true" : "false");
			yield* outputs.set("reason", phase.reason);
		}),
	);

	yield* Step.groupStep(
		"Write job summary",
		writeJobSummary({ phase, changesets, inputs: { releaseBranch, targetBranch } }),
	);
});

/* v8 ignore stop */
