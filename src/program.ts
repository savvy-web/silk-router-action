import type { ActionOutputError, ActionOutputs } from "@effected/github-actions";
import { ActionLogger } from "@effected/github-actions";
import type { Config, FileSystem } from "effect";
import { Effect } from "effect";
import { readInputs } from "./schema/inputs.js";
import { DISABLED_OUTPUTS, emitOutputs, foldOutputs } from "./schema/outputs.js";
import type { DetectPhaseRequirements } from "./steps/detect-phase.js";
import { detectPhase } from "./steps/detect-phase.js";
import type { ChangesetParseError } from "./steps/parse-changesets.js";
import { parseChangesets } from "./steps/parse-changesets.js";
import { writeSummary } from "./steps/write-summary.js";

/**
 * Run one unit of work as an `ActionLogger.step`.
 *
 * @remarks
 * A step holds its detail, folds it into one `::group::` titled by its result
 * line on success, and writes it unfolded on failure — the shape the legacy
 * toolkit's `groupStep` produced (a collapsible block plus one success line).
 * It opens its own group, so it must not be wrapped in `ActionLogger.group`:
 * a step opened inside a group cannot fold.
 *
 * Warnings and errors are never held, so a long step still reports trouble
 * while it is running.
 *
 * @internal
 */
const step = <A, E, R>(name: string, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R | ActionLogger> =>
	Effect.gen(function* () {
		const logger = yield* ActionLogger;
		return yield* logger.step(name, effect);
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
export const program: Effect.Effect<
	void,
	ActionOutputError | ChangesetParseError | Config.ConfigError,
	ActionLogger | ActionOutputs | FileSystem.FileSystem | DetectPhaseRequirements
> = Effect.gen(function* () {
	const logger = yield* ActionLogger;
	const inputs = yield* readInputs;

	// One bold heading over the four steps, so a reader scanning a long job log
	// finds this action's block. A phase is never folded and writes nothing when
	// it ends; the steps inside it still fold as top-level steps.
	yield* logger.phase(
		"Workflow Control",
		Effect.gen(function* () {
			const phase = yield* step("Detect workflow phase", detectPhase({ inputs }));
			const changesets = yield* step("Parse changesets", parseChangesets());

			yield* step("Emit outputs", emitOutputs(foldOutputs({ phase, changesets })));
			yield* step("Write job summary", writeSummary({ phase, changesets, inputs }));
		}),
	);
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
