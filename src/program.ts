import { ActionLogger } from "@effected/github-actions";
import { Effect } from "effect";
import { readInputs } from "./schema/inputs.js";
import { DISABLED_OUTPUTS, emitOutputs, foldOutputs } from "./schema/outputs.js";
import { detectPhase } from "./steps/detect-phase.js";
import { parseChangesets } from "./steps/parse-changesets.js";
import { writeSummary } from "./steps/write-summary.js";

/**
 * Run one step in the log shape the legacy toolkit's `groupStep` produced.
 *
 * @remarks
 * Ruling R8: a collapsible block **and** discard-on-success buffering. The
 * legacy `groupStep` was `ActionLogger.group` + `withStep`; the kit supplies the
 * group and the buffering but has no summary-line emitter (ruling R5, issue
 * I-6), so the per-step success line is **not** reproduced. That loss is
 * deliberate and belongs in the changeset.
 *
 * `withBuffer` does not buffer warnings or errors, so a long step still reports
 * trouble while it is running.
 *
 * @internal
 */
const step = <A, E, R>(name: string, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R | ActionLogger> =>
	Effect.gen(function* () {
		const logger = yield* ActionLogger;
		return yield* logger.group(name, logger.withBuffer(name, effect, { onSuccess: "discard" }));
	});

/**
 * The action.
 *
 * @remarks
 * Pure composition: read inputs, run the steps in order, fold their results into
 * the output contract, report. No I/O of its own, no formatting, no step bodies —
 * a step's logic lives in `steps/`, a rendered string lives in `format.ts`.
 *
 * @public
 */
export const program = Effect.gen(function* () {
	const inputs = yield* readInputs;

	const phase = yield* step("Detect workflow phase", detectPhase({ inputs }));
	const changesets = yield* step("Parse changesets", parseChangesets());

	yield* step("Emit outputs", emitOutputs(foldOutputs({ phase, changesets })));
	yield* step("Write job summary", writeSummary({ phase, changesets, inputs }));
}).pipe(
	// Publish the all-disabled contract on any failure path.
	//
	// A deliberate departure from the pre-port program, which emitted nothing
	// when it failed — and therefore belongs in the changeset. This action exists
	// solely to gate other workflows, so a failed run that publishes nothing
	// leaves a consumer's `if: … should_continue == 'true'` reading an empty
	// string instead of an explicit `"false"`. Emitting the disabled contract
	// makes a failed run say "do not proceed" rather than say nothing.
	//
	// `Effect.ignore` because this is a last-ditch write on a path that is
	// already failing: the original cause must reach `Action.run`, not be
	// replaced by an output-write error.
	Effect.onError(() => emitOutputs(DISABLED_OUTPUTS).pipe(Effect.ignore)),
);
