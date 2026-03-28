import { Context, Effect, Layer, Schema } from "effect";
import { Phase } from "../schemas/phase.js";
import { Trigger } from "../schemas/trigger.js";

export class PhaseInput extends Schema.Class<PhaseInput>("PhaseInput")({
	trigger: Trigger,
	targetBranch: Schema.String,
	releaseBranch: Schema.String,
	isReleaseCommit: Schema.Boolean,
	hasChangesets: Schema.Boolean,
	hasPublishablePackages: Schema.Boolean,
}) {}

export class PhaseResult extends Schema.Class<PhaseResult>("PhaseResult")({
	phase: Phase,
	reason: Schema.String,
}) {}

export class PhaseResolver extends Context.Tag("silk-router/PhaseResolver")<
	PhaseResolver,
	{
		readonly resolve: (input: PhaseInput) => Effect.Effect<PhaseResult>;
	}
>() {
	static readonly Live: Layer.Layer<PhaseResolver> = Layer.succeed(PhaseResolver, {
		resolve: (input) => Effect.succeed(resolvePhase(input)),
	});
}

const resolvePhase = (input: PhaseInput): PhaseResult => {
	const { trigger, targetBranch, releaseBranch, isReleaseCommit, hasChangesets, hasPublishablePackages } = input;

	// Priority 1: PR event + release PR merged -> close-issues
	if (trigger.event === "pull_request" && trigger.branch === releaseBranch && trigger.is_merged) {
		return new PhaseResult({ phase: "close-issues", reason: "release PR merged -- closing linked issues" });
	}

	// Priority 2: PR event + release PR open -> silk-validate
	if (trigger.event === "pull_request" && trigger.branch === releaseBranch && !trigger.is_merged) {
		return new PhaseResult({ phase: "silk-validate", reason: "release PR open -- running validation" });
	}

	// Priority 3: Push to target + release commit -> silk-publish or silk-release
	if (trigger.event === "push" && trigger.branch === targetBranch && isReleaseCommit) {
		if (hasPublishablePackages) {
			return new PhaseResult({ phase: "silk-publish", reason: "release commit with publishable packages detected" });
		}
		return new PhaseResult({
			phase: "silk-release",
			reason: "release commit -- GitHub Releases only (no publishable packages)",
		});
	}

	// Priority 4: Push to release branch -> silk-validate
	if (trigger.event === "push" && trigger.branch === releaseBranch) {
		return new PhaseResult({ phase: "silk-validate", reason: "push to release branch -- running validation" });
	}

	// Priority 5: Push to target + not release commit + has changesets -> silk-branch
	if (trigger.event === "push" && trigger.branch === targetBranch && !isReleaseCommit) {
		if (hasChangesets) {
			return new PhaseResult({
				phase: "silk-branch",
				reason: "changesets detected on target branch -- creating release branch",
			});
		}
		return new PhaseResult({ phase: "skip", reason: "push to target branch with no changesets -- nothing to do" });
	}

	// Priority 6: Everything else -> skip
	return new PhaseResult({ phase: "skip", reason: "no actionable event detected" });
};
