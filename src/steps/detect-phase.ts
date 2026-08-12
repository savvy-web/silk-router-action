import type { PullRequestInfo, Repo } from "@effected/github";
import { GitHubError, PullRequest } from "@effected/github";
import { ActionEnvironment } from "@effected/github-actions";
import { Effect, Schedule, Schema } from "effect";
import type { PhaseDetectionResult, WorkflowPhase } from "../schema/domain.js";
import type { ActionInputs } from "../schema/inputs.js";

/**
 * Services {@link detectPhase} requires.
 *
 * @remarks
 * Derived from what the legacy oracle's code path actually touches (see ruling
 * R11; consult it with `git show dev:src/services/phase-detector.ts`), not from
 * intuition:
 *
 * - {@link ActionEnvironment} — `github` for `ref`/`sha`/`eventName`, and
 *   `payload` for the webhook body.
 * - `PullRequest` — `listAssociatedWithCommit`, the PR-association query.
 * - `Repo` — carried in `listAssociatedWithCommit`'s own requirement channel and
 *   therefore in this step's. **Resolved per call**, never captured at layer
 *   construction (ruling R4).
 *
 * @public
 */
export type DetectPhaseRequirements = ActionEnvironment | PullRequest | Repo;

/**
 * Options {@link detectPhase} takes.
 *
 * @public
 */
export interface DetectPhaseOptions {
	readonly inputs: ActionInputs;
}

/** How many times release detection retries before giving up. */
const RELEASE_DETECT_ATTEMPTS = 3;
/** How long between those retries. */
const RELEASE_DETECT_DELAY = "10 seconds";

/**
 * The PR association has not propagated yet.
 *
 * @remarks
 * Internal to this module and **never** part of {@link detectPhase}'s error
 * channel — it exists solely to give `Effect.retry` something on the error
 * channel to act on, because retry cannot see an empty success. It is caught at
 * the boundary of the retry pipeline and converted back to `undefined`.
 *
 * Not a `GitHubError`: the API answered correctly, and treating "not yet
 * visible" as an API failure would put it in the degrade predicate, where it
 * would short-circuit the retry it is supposed to drive.
 *
 * @internal
 */
class ReleasePRNotVisibleYet extends Schema.TaggedError<ReleasePRNotVisibleYet>()("ReleasePRNotVisibleYet", {}) {}

/** Truncate a commit message for the detection record. @internal */
const truncate = (s: string, n = 100): string => (s.length > n ? `${s.substring(0, n)}...` : s.substring(0, n));

/**
 * The commit-message fallback, used when the PR-association API cannot answer.
 *
 * @internal
 */
const detectReleaseCommitFromMessage = (
	commitMessage: string,
	releaseBranch: string,
	owner: string,
): { isReleaseCommit: boolean } => {
	const isMergeFromReleaseBranch =
		commitMessage.includes(`from ${owner}/${releaseBranch}`) ||
		commitMessage.includes(`Merge branch '${releaseBranch}'`) ||
		(commitMessage.includes("Merge pull request") && commitMessage.includes(releaseBranch));
	const isVersionCommit =
		commitMessage.includes("chore: version packages") ||
		commitMessage.toLowerCase().includes("version packages") ||
		commitMessage.startsWith("chore: release");
	return { isReleaseCommit: isMergeFromReleaseBranch || isVersionCommit };
};

/** The webhook fields this step reads. @internal */
interface PayloadSubset {
	readonly head_commit?: { message?: string };
	readonly pull_request?: {
		readonly merged?: boolean;
		readonly head?: { ref: string };
		readonly base?: { ref: string };
		readonly number: number;
	};
}

/**
 * Determine which release-pipeline phase this workflow run belongs to.
 *
 * @remarks
 * **Failure posture: degrade-to-warning.** This step cannot fail the job. A
 * GitHub API failure falls back to commit-message detection and the run
 * continues, which is why the error channel is `never` rather than a tagged
 * error — the degradation is the contract, not an accident.
 *
 * The catch is deliberately **narrow**: only the `GitHubError` kinds that mean
 * "the API could not answer" degrade. A decode failure is a bug in this action
 * or in the kit, and it surfaces as a defect rather than silently becoming a
 * commit-message guess.
 *
 * @public
 */
export const detectPhase = (
	options: DetectPhaseOptions,
): Effect.Effect<PhaseDetectionResult, never, DetectPhaseRequirements> =>
	Effect.gen(function* () {
		const { releaseBranch, targetBranch, releasePrefix } = options.inputs;
		const env = yield* ActionEnvironment;
		const pullRequests = yield* PullRequest;

		const github = yield* env.github.pipe(Effect.orDie);
		const payload = (yield* env.payload.pipe(Effect.orDie)) as PayloadSubset;

		const commitMessage = payload.head_commit?.message ?? "";
		const isReleaseBranch = github.ref === `refs/heads/${releaseBranch}`;
		const isMainBranch = github.ref === `refs/heads/${targetBranch}`;
		const isPullRequestEvent = github.eventName === "pull_request";
		const pr = payload.pull_request;
		const isPRMerged = isPullRequestEvent && pr?.merged === true;
		const isReleasePRMerged = isPRMerged && pr?.head?.ref === releaseBranch && pr?.base?.ref === targetBranch;
		const isReleasePROpen =
			isPullRequestEvent && !isPRMerged && pr?.head?.ref === releaseBranch && pr?.base?.ref === targetBranch;

		const base = {
			reason: "",
			isReleaseBranch,
			isMainBranch,
			isPullRequestEvent,
			isPRMerged: Boolean(isPRMerged),
			isReleasePRMerged: Boolean(isReleasePRMerged),
			commitMessage: truncate(commitMessage),
		};

		if (isReleasePRMerged && pr) {
			return {
				...base,
				phase: "close-issues" as WorkflowPhase,
				reason: `Release PR #${pr.number} merged via pull_request event`,
				mergedReleasePRNumber: pr.number,
				isReleaseCommit: true,
			};
		}

		if (isReleasePROpen && pr) {
			return {
				...base,
				phase: "validation" as WorkflowPhase,
				reason: `Open PR #${pr.number} from ${releaseBranch} to ${targetBranch}`,
				isReleaseCommit: false,
			};
		}

		let isReleaseCommit = false;
		let mergedReleasePRNumber: number | undefined;

		if (isMainBranch && github.eventName === "push") {
			// `Effect.suspend` so every retry re-issues the call rather than
			// replaying a cached result.
			const findMergedReleasePR = Effect.suspend(() =>
				pullRequests.listAssociatedWithCommit(github.sha).pipe(
					Effect.map((associated) =>
						associated.find((p) => p.merged && p.head === releaseBranch && p.base === targetBranch),
					),
					// Degrade only on the kinds that mean "the API could not answer".
					// `alreadyExists` cannot arise from a GET, and `decode` means the
					// response did not match the kit's schema — a bug here or in the
					// kit, not a condition to paper over. Both fall through to `orDie`
					// below and surface as defects rather than becoming a silent
					// commit-message guess.
					Effect.catchIf(GitHubError.hasKind("transport", "rateLimited", "notFound", "rejected", "unauthorized"), () =>
						Effect.gen(function* () {
							yield* Effect.logWarning("PR-association API failed; falling back to commit-message detection");
							return undefined;
						}),
					),
					Effect.orDie,
				),
			);

			// Absence is not a failure of the API — it is the propagation lag this
			// retry exists to absorb. Modelling it as a *tagged failure* is what
			// lets `Effect.retry` drive it, since retry acts on the error channel
			// and an empty success is not one. The sentinel is caught at the
			// boundary below and never escapes this block: `detectPhase` keeps
			// `E = never`, and this tag is deliberately absent from the
			// `GitHubError` predicate above, which is about API failures only.
			const findOrFail = findMergedReleasePR.pipe(
				Effect.flatMap((found) =>
					found === undefined ? Effect.fail(new ReleasePRNotVisibleYet()) : Effect.succeed(found),
				),
			);

			const findWithRetry: Effect.Effect<PullRequestInfo | undefined, never, PullRequest | Repo> = findOrFail.pipe(
				Effect.tapError(() =>
					Effect.logInfo(
						`Release-prefixed commit but PR association not yet visible; retrying in ${RELEASE_DETECT_DELAY}`,
					),
				),
				// `times` counts retries *after* the initial attempt, so this is
				// 1 + 3 = 4 calls, spaced 10 seconds — the frozen contract.
				Effect.retry({ schedule: Schedule.spaced(RELEASE_DETECT_DELAY), times: RELEASE_DETECT_ATTEMPTS }),
				Effect.catchTag("ReleasePRNotVisibleYet", () => Effect.succeed(undefined)),
			);

			// An empty `release-prefix` disables the retry entirely.
			const expectsRelease = releasePrefix !== "" && commitMessage.startsWith(releasePrefix);
			const mergedPR = expectsRelease ? yield* findWithRetry : yield* findMergedReleasePR;

			if (mergedPR) {
				isReleaseCommit = true;
				mergedReleasePRNumber = mergedPR.number;
			} else {
				isReleaseCommit = detectReleaseCommitFromMessage(
					commitMessage,
					releaseBranch,
					github.repositoryOwner,
				).isReleaseCommit;
			}
		}

		if (isMainBranch && isReleaseCommit) {
			return {
				...base,
				phase: "publishing" as WorkflowPhase,
				reason:
					mergedReleasePRNumber !== undefined
						? `Merged release PR #${mergedReleasePRNumber} from ${releaseBranch}`
						: `Release commit detected on ${targetBranch}`,
				isReleaseCommit: true,
				...(mergedReleasePRNumber !== undefined ? { mergedReleasePRNumber } : {}),
			};
		}
		if (isReleaseBranch) {
			return {
				...base,
				phase: "validation" as WorkflowPhase,
				reason: `Push to release branch ${releaseBranch}`,
				isReleaseCommit: false,
			};
		}
		if (isMainBranch) {
			return {
				...base,
				phase: "branch-management" as WorkflowPhase,
				reason: `Push to ${targetBranch} (not a release commit)`,
				isReleaseCommit: false,
			};
		}
		return {
			...base,
			phase: "none" as WorkflowPhase,
			reason: `Not on ${targetBranch} or ${releaseBranch} branch`,
			isReleaseCommit: false,
		};
	});
