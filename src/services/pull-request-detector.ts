import type { GitHubClientError } from "@savvy-web/github-action-effects";
import { GitHubClient } from "@savvy-web/github-action-effects";
import { Context, Effect, Layer } from "effect";
import type { PhaseDetectionError } from "../errors/errors.js";

interface PullRequestRef {
	readonly merged_at: string | null;
	readonly merge_commit_sha: string | null;
	readonly head?: { readonly ref: string } | null;
	readonly base?: { readonly ref: string } | null;
}

interface OctokitSubset {
	readonly rest: {
		readonly repos: {
			readonly listPullRequestsAssociatedWithCommit: (params: {
				owner: string;
				repo: string;
				commit_sha: string;
			}) => Promise<{ data: PullRequestRef[] }>;
		};
		readonly pulls: {
			readonly list: (params: {
				owner: string;
				repo: string;
				state: string;
				head: string;
				base: string;
				sort: string;
				direction: string;
				per_page: number;
			}) => Promise<{ data: PullRequestRef[] }>;
		};
	};
}

export class PullRequestDetector extends Context.Tag("silk-router/PullRequestDetector")<
	PullRequestDetector,
	{
		readonly isReleaseCommit: (
			sha: string,
			releaseBranch: string,
			targetBranch: string,
		) => Effect.Effect<boolean, PhaseDetectionError | GitHubClientError>;
	}
>() {}

export const PullRequestDetectorLive = Layer.effect(
	PullRequestDetector,
	Effect.gen(function* () {
		const client = yield* GitHubClient;
		return {
			isReleaseCommit: (sha, releaseBranch, targetBranch) =>
				Effect.gen(function* () {
					const { owner, repo } = yield* client.repo;

					// Strategy 1: listPullRequestsAssociatedWithCommit
					const associatedPRs = yield* client.rest<PullRequestRef[]>(
						"listPullRequestsAssociatedWithCommit",
						(octokit) =>
							(octokit as OctokitSubset).rest.repos.listPullRequestsAssociatedWithCommit({
								owner,
								repo,
								commit_sha: sha,
							}),
					);

					const releasePR = associatedPRs.find(
						(pr) => pr.merged_at !== null && pr.head?.ref === releaseBranch && pr.base?.ref === targetBranch,
					);

					if (releasePR) {
						return true;
					}

					// Strategy 2: search closed PRs with merge_commit_sha match
					const closedPRs = yield* client.rest<PullRequestRef[]>("listClosedPullRequests", (octokit) =>
						(octokit as OctokitSubset).rest.pulls.list({
							owner,
							repo,
							state: "closed",
							head: `${owner}:${releaseBranch}`,
							base: targetBranch,
							sort: "updated",
							direction: "desc",
							per_page: 5,
						}),
					);

					return closedPRs.some((pr) => pr.merge_commit_sha === sha && pr.merged_at !== null);
				}),
		};
	}),
);

export const PullRequestDetectorTest = {
	layer: (config: { isReleaseCommit: boolean }) =>
		Layer.succeed(PullRequestDetector, {
			isReleaseCommit: () => Effect.succeed(config.isReleaseCommit),
		}),
};
