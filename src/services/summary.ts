import { ActionOutputs, GithubMarkdown } from "@savvy-web/github-action-effects";
import { Effect } from "effect";
import type { PhaseDetectionResult, WorkflowPhase } from "../schemas/domain.js";
import type { ParseChangesetsResult } from "./changesets.js";

const phaseEmoji = (phase: WorkflowPhase): string => {
	switch (phase) {
		case "branch-management":
			return "\u{1F33F}";
		case "validation":
			return "\u{2705}";
		case "publishing":
		case "close-issues":
			return "\u{1F4E6}";
		case "none":
			return "\u{23ED}\u{FE0F}";
	}
};

const phaseDescription = (phase: WorkflowPhase): string => {
	switch (phase) {
		case "branch-management":
			return "Create or update the release branch with changesets";
		case "validation":
			return "Validate the release branch (build, test, lint)";
		case "publishing":
			return "Publish packages and create GitHub releases";
		case "close-issues":
			return "Close linked issues after release PR merge";
		case "none":
			return "No release action needed";
	}
};

export const writeJobSummary = (input: {
	readonly phase: PhaseDetectionResult;
	readonly changesets: ParseChangesetsResult;
	readonly inputs: { readonly releaseBranch: string; readonly targetBranch: string };
}): Effect.Effect<void, never, ActionOutputs> =>
	Effect.gen(function* () {
		const outputs = yield* ActionOutputs;
		const emoji = phaseEmoji(input.phase.phase);
		const desc = phaseDescription(input.phase.phase);

		const phaseRows: ReadonlyArray<ReadonlyArray<string>> = [
			["Phase", `${emoji} \`${input.phase.phase}\``],
			["Description", desc],
			["Reason", input.phase.reason],
			["Should Continue", input.phase.phase !== "none" ? "Yes" : "No"],
		];

		const contextRows: Array<ReadonlyArray<string>> = [
			["Target Branch", `\`${input.inputs.targetBranch}\``],
			["Release Branch", `\`${input.inputs.releaseBranch}\``],
			["On Main Branch", input.phase.isMainBranch ? "Yes" : "No"],
			["On Release Branch", input.phase.isReleaseBranch ? "Yes" : "No"],
			["Is Release Commit", input.phase.isReleaseCommit ? "Yes" : "No"],
		];
		if (input.phase.mergedReleasePRNumber !== undefined) {
			contextRows.push(["Merged PR", `#${input.phase.mergedReleasePRNumber}`]);
		}

		const changesetRows: Array<ReadonlyArray<string>> = [
			["Has Changesets", input.changesets.hasChangesets ? "Yes" : "No"],
			["Changeset Count", String(input.changesets.changesetCount)],
		];
		if (input.changesets.releaseType) {
			changesetRows.push(["Release Type", `\`${input.changesets.releaseType}\``]);
		}
		if (input.changesets.affectedPackages.length > 0) {
			changesetRows.push(["Affected Packages", input.changesets.affectedPackages.map((p) => `\`${p}\``).join(", ")]);
		}

		const markdown = [
			GithubMarkdown.heading(`${emoji} Workflow Control`, 2),
			GithubMarkdown.table(["Property", "Value"], phaseRows),
			GithubMarkdown.heading("Git Context", 3),
			GithubMarkdown.table(["Property", "Value"], contextRows),
			GithubMarkdown.heading("Changesets", 3),
			GithubMarkdown.table(["Property", "Value"], changesetRows),
		].join("\n\n");

		yield* outputs.summary(markdown).pipe(Effect.orDie);
	});
