import { ActionOutputs } from "@effected/github-actions";
import { Effect } from "effect";
import { renderJobSummary } from "../format.js";
import type { PhaseDetectionResult } from "../schema/domain.js";
import type { ActionInputs } from "../schema/inputs.js";
import type { ParseChangesetsResult } from "./parse-changesets.js";

/**
 * Services {@link writeSummary} requires.
 *
 * @public
 */
export type WriteSummaryRequirements = ActionOutputs;

/**
 * Options {@link writeSummary} takes.
 *
 * @public
 */
export interface WriteSummaryOptions {
	readonly phase: PhaseDetectionResult;
	readonly changesets: ParseChangesetsResult;
	readonly inputs: ActionInputs;
}

/**
 * Write the job-summary panel.
 *
 * @remarks
 * **Failure posture: fail-the-job (as a defect).** The legacy oracle wrote the
 * summary with `Effect.orDie`, so a write failure surfaces as a defect and the
 * run goes red. Preserved verbatim for parity rather than quietly softened to a
 * warning — if that posture should change, it is a decision with a changeset,
 * not a porting detail.
 *
 * Rendering lives in `format.ts`; this step only performs the write. Keeping the
 * two apart is what lets the panel's content be asserted without a layer.
 *
 * @public
 */
export const writeSummary = (options: WriteSummaryOptions): Effect.Effect<void, never, WriteSummaryRequirements> =>
	Effect.gen(function* () {
		const outputs = yield* ActionOutputs;
		yield* outputs.summary(renderJobSummary(options)).pipe(Effect.orDie);
	});
