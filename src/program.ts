import { Effect, Schedule, Schema } from "effect";
import type { TriggerContextError } from "./errors/errors.js";
import type { ReleasePlanType } from "./schemas/release-plan.js";
import type { TriggerType } from "./schemas/trigger.js";
import { GitHubEventContext } from "./services/github-event-context.js";
import type { PhaseResult } from "./services/phase-resolver.js";
import { PhaseInput, PhaseResolver } from "./services/phase-resolver.js";
import { PullRequestDetector } from "./services/pull-request-detector.js";
import { ReleasePlanAssembler } from "./services/release-plan-assembler.js";
import { SummaryWriter } from "./services/summary-writer.js";

export class ProgramResult extends Schema.Class<ProgramResult>("ProgramResult")({
	phase: Schema.String,
	reason: Schema.String,
	releasePlan: Schema.Unknown,
	trigger: Schema.Unknown,
	summary: Schema.String,
}) {}

export const program = (
	targetBranch: string,
	releaseBranch: string,
	cwd: string,
): Effect.Effect<
	ProgramResult,
	TriggerContextError,
	GitHubEventContext | PullRequestDetector | ReleasePlanAssembler | PhaseResolver | SummaryWriter
> =>
	Effect.gen(function* () {
		// Step 1: Read trigger context
		const eventContext = yield* GitHubEventContext;
		const trigger: TriggerType = yield* eventContext.trigger;

		yield* Effect.log(`Event: ${trigger.event}, Branch: ${trigger.branch}, SHA: ${trigger.sha}`);

		// Step 2: Detect if this is a release commit (only for push to target)
		let isReleaseCommit = false;
		if (trigger.event === "push" && trigger.branch === targetBranch) {
			const detector = yield* PullRequestDetector;
			isReleaseCommit = yield* detector.isReleaseCommit(trigger.sha, releaseBranch, targetBranch).pipe(
				Effect.retry({
					schedule: Schedule.exponential("2 seconds").pipe(
						Schedule.compose(Schedule.recurs(3)),
						Schedule.union(Schedule.spaced("3 seconds")),
					),
					// Only retry on server errors (5xx), not client errors (4xx)
					while: (error) => "status" in error && typeof error.status === "number" && error.status >= 500,
				}),
				Effect.catchAll((error) =>
					Effect.gen(function* () {
						yield* Effect.logWarning(
							`Could not determine if commit is a release commit, defaulting to false: ${error}`,
						);
						return false;
					}),
				),
			);
			yield* Effect.log(`Release commit: ${isReleaseCommit}`);
		}

		// Step 3: Read changesets and assemble release plan
		const assembler = yield* ReleasePlanAssembler;
		const releasePlan: ReleasePlanType = yield* assembler.assemble(cwd, []).pipe(
			Effect.catchAll(() =>
				Effect.succeed({
					releases: [] as ReleasePlanType["releases"],
					tagStrategy: "single" as const,
					changesetCount: 0,
					bump: "none" as const,
				}),
			),
		);

		yield* Effect.log(`Changesets: ${releasePlan.changesetCount}, Releases: ${releasePlan.releases.length}`);

		// Step 4: Resolve phase
		const resolver = yield* PhaseResolver;
		const { phase, reason }: PhaseResult = yield* resolver.resolve(
			new PhaseInput({
				trigger,
				targetBranch,
				releaseBranch,
				isReleaseCommit,
				hasChangesets: releasePlan.changesetCount > 0,
				hasPublishablePackages: releasePlan.releases.some((r) => r.registries.length > 0),
			}),
		);

		yield* Effect.log(`Phase: ${phase} -- ${reason}`);

		// Step 5: Generate summary
		const writer = yield* SummaryWriter;
		const summary = yield* writer.generate(phase, reason, releasePlan);

		return new ProgramResult({
			phase,
			reason,
			releasePlan: releasePlan as unknown,
			trigger: trigger as unknown,
			summary,
		});
	});
