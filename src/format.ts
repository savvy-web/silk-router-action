import { GitHubMarkdown } from "@effected/github-actions";
import type { PhaseDetectionResult, WorkflowPhase } from "./schema/domain.js";
import type { ActionInputs } from "./schema/inputs.js";
import type { ParseChangesetsResult } from "./steps/parse-changesets.js";

/**
 * The action's one rendering surface.
 *
 * @remarks
 * Every human-readable string this action emits is built here — pure, service
 * free, and importable by a test without a layer. Keeping it in one module is
 * what stops the same fact from being worded two different ways in a log line
 * and a summary panel.
 */

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

const yesNo = (value: boolean): string => (value ? "Yes" : "No");

/**
 * Render the job-summary panel.
 *
 * @remarks
 * Pure: takes the pipeline's results and returns GitHub-flavored markdown.
 * Writing it is `steps/write-summary.ts`'s job, not this module's.
 *
 * @public
 */
export const renderJobSummary = (input: {
	readonly phase: PhaseDetectionResult;
	readonly changesets: ParseChangesetsResult;
	readonly inputs: ActionInputs;
}): string => {
	const emoji = phaseEmoji(input.phase.phase);

	const phaseRows: ReadonlyArray<ReadonlyArray<string>> = [
		["Phase", `${emoji} \`${input.phase.phase}\``],
		["Description", phaseDescription(input.phase.phase)],
		["Reason", input.phase.reason],
		["Should Continue", yesNo(input.phase.phase !== "none")],
	];

	const contextRows: Array<ReadonlyArray<string>> = [
		["Target Branch", `\`${input.inputs.targetBranch}\``],
		["Release Branch", `\`${input.inputs.releaseBranch}\``],
		["On Main Branch", yesNo(input.phase.isMainBranch)],
		["On Release Branch", yesNo(input.phase.isReleaseBranch)],
		["Is Release Commit", yesNo(input.phase.isReleaseCommit)],
	];
	if (input.phase.mergedReleasePRNumber !== undefined) {
		contextRows.push(["Merged PR", `#${input.phase.mergedReleasePRNumber}`]);
	}

	const changesetRows: Array<ReadonlyArray<string>> = [
		["Has Changesets", yesNo(input.changesets.hasChangesets)],
		["Changeset Count", String(input.changesets.changesetCount)],
	];
	if (input.changesets.releaseType) {
		changesetRows.push(["Release Type", `\`${input.changesets.releaseType}\``]);
	}
	if (input.changesets.affectedPackages.length > 0) {
		changesetRows.push(["Affected Packages", input.changesets.affectedPackages.map((p) => `\`${p}\``).join(", ")]);
	}

	return [
		GitHubMarkdown.heading(`${emoji} Workflow Control`, 2),
		GitHubMarkdown.table(["Property", "Value"], phaseRows),
		GitHubMarkdown.heading("Git Context", 3),
		GitHubMarkdown.table(["Property", "Value"], contextRows),
		GitHubMarkdown.heading("Changesets", 3),
		GitHubMarkdown.table(["Property", "Value"], changesetRows),
	].join("\n\n");
};
