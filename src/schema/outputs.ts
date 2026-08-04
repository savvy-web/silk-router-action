import type { ActionOutputError } from "@effected/github-actions";
import { ActionOutputs } from "@effected/github-actions";
import { Effect } from "effect";
import type { ParseChangesetsResult } from "../steps/parse-changesets.js";
import type { PhaseDetectionResult } from "./domain.js";

/**
 * Every output this action declares, as data, in emission order.
 *
 * @remarks
 * The single source of truth for output names in code, and the middle leg of the
 * three-way check against `action.yml`. The frozen contract is **10 outputs** —
 * see `.claude/plans/effected-github-actions-port/00-spec.md`.
 *
 * @public
 */
export const OUTPUT_NAMES = [
	"phase",
	"has_changesets",
	"changeset_count",
	"release_type",
	"is_release_commit",
	"is_release_branch",
	"is_main_branch",
	"merged_pr_number",
	"should_continue",
	"reason",
] as const;

/** @public */
export type OutputName = (typeof OUTPUT_NAMES)[number];

/**
 * The action's output contract.
 *
 * @remarks
 * Every value is a string because that is what the runner's `$GITHUB_OUTPUT`
 * file holds; booleans are `"true"`/`"false"` and an absent number is `""`.
 *
 * @public
 */
export type OutputValues = { readonly [K in OutputName]: string };

/**
 * The all-disabled defaults every fold starts from.
 *
 * @remarks
 * A run that detects nothing still emits all ten names. Folding from a complete
 * default rather than building a partial map is what makes a missing name a
 * compile error instead of a silently absent output.
 *
 * @public
 */
export const DISABLED_OUTPUTS: OutputValues = {
	phase: "none",
	has_changesets: "false",
	changeset_count: "0",
	release_type: "",
	is_release_commit: "false",
	is_release_branch: "false",
	is_main_branch: "false",
	merged_pr_number: "",
	should_continue: "false",
	reason: "",
};

const bool = (value: boolean): string => (value ? "true" : "false");

/**
 * Fold the pipeline's step results into the output contract.
 *
 * @remarks
 * Pure. Every branch produces a complete {@link OutputValues}, so no caller can
 * emit a partial contract.
 *
 * @public
 */
export const foldOutputs = (input: {
	readonly phase: PhaseDetectionResult;
	readonly changesets: ParseChangesetsResult;
}): OutputValues => ({
	phase: input.phase.phase,
	has_changesets: bool(input.changesets.hasChangesets),
	changeset_count: String(input.changesets.changesetCount),
	release_type: input.changesets.releaseType ?? "",
	is_release_commit: bool(input.phase.isReleaseCommit),
	is_release_branch: bool(input.phase.isReleaseBranch),
	is_main_branch: bool(input.phase.isMainBranch),
	merged_pr_number: input.phase.mergedReleasePRNumber !== undefined ? String(input.phase.mergedReleasePRNumber) : "",
	should_continue: bool(input.phase.phase !== "none"),
	reason: input.phase.reason,
});

/**
 * The one emitter. Writes every name in {@link OUTPUT_NAMES} exactly once.
 *
 * @remarks
 * Driven by iterating the names tuple rather than by ten hand-written calls, so
 * a name added to the tuple is emitted without a second edit, and no name can be
 * written twice by a copy-paste slip.
 *
 * @public
 */
export const emitOutputs = (values: OutputValues): Effect.Effect<void, ActionOutputError, ActionOutputs> =>
	Effect.gen(function* () {
		const outputs = yield* ActionOutputs;
		for (const name of OUTPUT_NAMES) {
			yield* outputs.set(name, values[name]);
		}
	});
