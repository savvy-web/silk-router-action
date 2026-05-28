import { ActionEnvironment, GitHubClient } from "@savvy-web/github-action-effects";
import { Context, Effect, Layer } from "effect";
import type { PhaseDetectionError } from "../errors/errors.js";
import type { PhaseDetectionResult, WorkflowPhase } from "../schemas/domain.js";

interface PullRequestPayload {
	readonly merged?: boolean;
	readonly head?: { ref: string };
	readonly base?: { ref: string };
	readonly number: number;
}

interface PayloadSubset {
	readonly head_commit?: { message?: string };
	readonly pull_request?: PullRequestPayload;
}

interface AssociatedPR {
	readonly number: number;
	readonly merged_at: string | null;
	readonly head: { ref: string };
	readonly base: { ref: string };
}

const truncate = (s: string, n = 100): string => (s.length > n ? `${s.substring(0, n)}...` : s.substring(0, n));

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

export class PhaseDetector extends Context.Tag("silk-router-action/PhaseDetector")<
	PhaseDetector,
	{
		readonly detect: (options: {
			readonly releaseBranch: string;
			readonly targetBranch: string;
		}) => Effect.Effect<PhaseDetectionResult, PhaseDetectionError>;
	}
>() {}

export const PhaseDetectorLive = Layer.effect(
	PhaseDetector,
	Effect.gen(function* () {
		const env = yield* ActionEnvironment;
		const gh = yield* GitHubClient;
		return {
			detect: ({ releaseBranch, targetBranch }) =>
				Effect.gen(function* () {
					const github = yield* env.github.pipe(Effect.orDie);
					const payload = (yield* env.payload.pipe(Effect.orDie)) as unknown as PayloadSubset;
					const ghRepo = yield* gh.repo.pipe(Effect.orDie);

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
						const associated = yield* gh
							.rest<ReadonlyArray<AssociatedPR>>(
								"listPullRequestsAssociatedWithCommit",
								// biome-ignore lint/suspicious/noExplicitAny: Octokit shape is opaque to the library
								async (octokit: any) =>
									octokit.rest.repos.listPullRequestsAssociatedWithCommit({
										owner: ghRepo.owner,
										repo: ghRepo.repo,
										commit_sha: github.sha,
									}),
							)
							.pipe(
								Effect.catchAllCause(() =>
									Effect.gen(function* () {
										yield* Effect.logWarning("PR-association API failed; falling back to commit-message detection");
										return [] as ReadonlyArray<AssociatedPR>;
									}),
								),
							);
						const mergedPR = associated.find(
							(p) => p.merged_at !== null && p.head.ref === releaseBranch && p.base.ref === targetBranch,
						);
						if (mergedPR) {
							isReleaseCommit = true;
							mergedReleasePRNumber = mergedPR.number;
						} else {
							const fallback = detectReleaseCommitFromMessage(commitMessage, releaseBranch, ghRepo.owner);
							isReleaseCommit = fallback.isReleaseCommit;
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
				}),
		};
	}),
);
