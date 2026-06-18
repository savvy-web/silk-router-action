import { GitHubClient } from "@savvy-web/github-action-effects";
import { ActionEnvironmentTest } from "@savvy-web/github-action-effects/testing";
import { Effect, Fiber, Layer, TestClock, TestContext } from "effect";
import { describe, expect, it } from "vitest";
import { PhaseDetector, PhaseDetectorLive } from "./phase-detector.js";

const makeGhClient = (associatedPRs: ReadonlyArray<unknown> = []) =>
	Layer.succeed(GitHubClient, {
		rest: <T>(_op: string, fn: (octokit: unknown) => Promise<{ data: T }>) =>
			Effect.tryPromise({
				try: () =>
					fn({
						rest: {
							repos: {
								listPullRequestsAssociatedWithCommit: async () => ({ data: associatedPRs }),
							},
						},
					}),
				catch: (e) => e as never,
			}).pipe(Effect.map((response) => response.data)) as never,
		graphql: () => Effect.die("graphql not used in phase-detector tests"),
		paginate: () => Effect.die("paginate not used in phase-detector tests"),
		paginateStream: () => Effect.die("paginateStream not used in phase-detector tests"),
		repo: Effect.succeed({ owner: "owner", repo: "repo" }),
	});

const runDetect = (
	env: Record<string, string>,
	payload: Record<string, unknown>,
	associatedPRs: ReadonlyArray<unknown> = [],
) =>
	Effect.runPromise(
		Effect.gen(function* () {
			const svc = yield* PhaseDetector;
			return yield* svc.detect({ releaseBranch: "changeset-release/main", targetBranch: "main" });
		}).pipe(
			Effect.provide(
				PhaseDetectorLive.pipe(
					Layer.provide(
						Layer.mergeAll(ActionEnvironmentTest.layer(env, payload as never), makeGhClient(associatedPRs)),
					),
				),
			),
		),
	);

describe("PhaseDetector", () => {
	// --- 6 core test cases ---

	it("detects branch-management for a non-release commit on main", async () => {
		const result = await runDetect(
			{
				GITHUB_REF: "refs/heads/main",
				GITHUB_EVENT_NAME: "push",
				GITHUB_SHA: "abc",
				GITHUB_REPOSITORY: "owner/repo",
			},
			{ head_commit: { message: "feat: thing" } },
			[],
		);
		expect(result.phase).toBe("branch-management");
		expect(result.isMainBranch).toBe(true);
	});

	it("detects validation on the release branch", async () => {
		const result = await runDetect(
			{
				GITHUB_REF: "refs/heads/changeset-release/main",
				GITHUB_EVENT_NAME: "push",
				GITHUB_SHA: "abc",
				GITHUB_REPOSITORY: "owner/repo",
			},
			{ head_commit: { message: "ci: bump" } },
			[],
		);
		expect(result.phase).toBe("validation");
		expect(result.isReleaseBranch).toBe(true);
	});

	it("detects publishing when a merged release PR is associated", async () => {
		const result = await runDetect(
			{
				GITHUB_REF: "refs/heads/main",
				GITHUB_EVENT_NAME: "push",
				GITHUB_SHA: "abc",
				GITHUB_REPOSITORY: "owner/repo",
			},
			{ head_commit: { message: "chore: version packages" } },
			[
				{
					number: 42,
					merged_at: "2024-01-01T00:00:00Z",
					head: { ref: "changeset-release/main" },
					base: { ref: "main" },
				},
			],
		);
		expect(result.phase).toBe("publishing");
		expect(result.isReleaseCommit).toBe(true);
		expect(result.mergedReleasePRNumber).toBe(42);
	});

	it("detects close-issues on a pull_request merge event", async () => {
		const result = await runDetect(
			{
				GITHUB_REF: "refs/heads/changeset-release/main",
				GITHUB_EVENT_NAME: "pull_request",
				GITHUB_SHA: "abc",
				GITHUB_REPOSITORY: "owner/repo",
			},
			{
				pull_request: {
					number: 99,
					merged: true,
					head: { ref: "changeset-release/main" },
					base: { ref: "main" },
				},
			},
		);
		expect(result.phase).toBe("close-issues");
		expect(result.mergedReleasePRNumber).toBe(99);
	});

	it("falls back to commit-message detection when the API throws", async () => {
		const failingGh = Layer.succeed(GitHubClient, {
			rest: () => Effect.die("api down") as never,
			graphql: () => Effect.die("api down"),
			paginate: () => Effect.die("api down"),
			paginateStream: () => Effect.die("api down"),
			repo: Effect.succeed({ owner: "owner", repo: "repo" }),
		});
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const svc = yield* PhaseDetector;
				return yield* svc.detect({ releaseBranch: "changeset-release/main", targetBranch: "main" });
			}).pipe(
				Effect.provide(
					PhaseDetectorLive.pipe(
						Layer.provide(
							Layer.mergeAll(
								ActionEnvironmentTest.layer(
									{
										GITHUB_REF: "refs/heads/main",
										GITHUB_EVENT_NAME: "push",
										GITHUB_SHA: "abc",
										GITHUB_REPOSITORY: "owner/repo",
									},
									{ head_commit: { message: "chore: version packages" } } as never,
								),
								failingGh,
							),
						),
					),
				),
			),
		);
		expect(result.phase).toBe("publishing");
		expect(result.isReleaseCommit).toBe(true);
	});

	it("returns phase=none when neither on main nor release branch", async () => {
		const result = await runDetect(
			{
				GITHUB_REF: "refs/heads/feature/x",
				GITHUB_EVENT_NAME: "push",
				GITHUB_SHA: "abc",
				GITHUB_REPOSITORY: "owner/repo",
			},
			{ head_commit: { message: "feat: x" } },
		);
		expect(result.phase).toBe("none");
	});

	// --- Ported cases from __test__/detect-workflow-phase.test.ts (detectWorkflowPhase async) ---

	it("branch-management: isReleaseCommit=false and reason contains 'not a release commit'", async () => {
		const result = await runDetect(
			{
				GITHUB_REF: "refs/heads/main",
				GITHUB_EVENT_NAME: "push",
				GITHUB_SHA: "abc123",
				GITHUB_REPOSITORY: "test-owner/test-repo",
			},
			{ head_commit: { message: "feat: add new feature" } },
			[],
		);
		expect(result.phase).toBe("branch-management");
		expect(result.isMainBranch).toBe(true);
		expect(result.isReleaseCommit).toBe(false);
		expect(result.reason).toContain("not a release commit");
	});

	it("validation: reason contains 'Push to release branch'", async () => {
		const result = await runDetect(
			{
				GITHUB_REF: "refs/heads/changeset-release/main",
				GITHUB_EVENT_NAME: "push",
				GITHUB_SHA: "abc123",
				GITHUB_REPOSITORY: "test-owner/test-repo",
			},
			{ head_commit: { message: "ci: bump" } },
			[],
		);
		expect(result.phase).toBe("validation");
		expect(result.isReleaseBranch).toBe(true);
		expect(result.reason).toContain("Push to release branch");
	});

	it("publishing: reason contains merged release PR number", async () => {
		const result = await runDetect(
			{
				GITHUB_REF: "refs/heads/main",
				GITHUB_EVENT_NAME: "push",
				GITHUB_SHA: "abc123",
				GITHUB_REPOSITORY: "test-owner/test-repo",
			},
			{ head_commit: { message: "chore: release" } },
			[
				{
					number: 42,
					merged_at: "2024-01-01T00:00:00Z",
					head: { ref: "changeset-release/main" },
					base: { ref: "main" },
				},
			],
		);
		expect(result.phase).toBe("publishing");
		expect(result.isReleaseCommit).toBe(true);
		expect(result.mergedReleasePRNumber).toBe(42);
		expect(result.reason).toContain("Merged release PR #42");
	});

	it("close-issues: isReleasePRMerged=true, mergedReleasePRNumber=99", async () => {
		const result = await runDetect(
			{
				GITHUB_REF: "refs/heads/changeset-release/main",
				GITHUB_EVENT_NAME: "pull_request",
				GITHUB_SHA: "abc123",
				GITHUB_REPOSITORY: "test-owner/test-repo",
			},
			{
				pull_request: {
					number: 99,
					merged: true,
					head: { ref: "changeset-release/main" },
					base: { ref: "main" },
				},
			},
		);
		expect(result.phase).toBe("close-issues");
		expect(result.isReleasePRMerged).toBe(true);
		expect(result.mergedReleasePRNumber).toBe(99);
	});

	it("validation: open PR from release branch to main", async () => {
		const result = await runDetect(
			{
				GITHUB_REF: "refs/pull/42/merge",
				GITHUB_EVENT_NAME: "pull_request",
				GITHUB_SHA: "abc123",
				GITHUB_REPOSITORY: "test-owner/test-repo",
			},
			{
				pull_request: {
					number: 42,
					merged: false,
					head: { ref: "changeset-release/main" },
					base: { ref: "main" },
				},
			},
		);
		expect(result.phase).toBe("validation");
		expect(result.reason).toBe("Open PR #42 from changeset-release/main to main");
		expect(result.isPullRequestEvent).toBe(true);
		expect(result.isPRMerged).toBe(false);
		expect(result.isReleasePRMerged).toBe(false);
	});

	it("none: unrelated branches, reason contains 'Not on main or changeset-release/main'", async () => {
		const result = await runDetect(
			{
				GITHUB_REF: "refs/heads/feature/my-feature",
				GITHUB_EVENT_NAME: "push",
				GITHUB_SHA: "abc123",
				GITHUB_REPOSITORY: "test-owner/test-repo",
			},
			{ head_commit: { message: "feat: something" } },
			[],
		);
		expect(result.phase).toBe("none");
		expect(result.isMainBranch).toBe(false);
		expect(result.isReleaseBranch).toBe(false);
		expect(result.reason).toContain("Not on main or changeset-release/main");
	});

	it("fallback: API fails, commit message 'chore: release v1.0.0' triggers publishing", async () => {
		const failingGh = Layer.succeed(GitHubClient, {
			rest: () => Effect.die("API Error") as never,
			graphql: () => Effect.die("API Error"),
			paginate: () => Effect.die("API Error"),
			paginateStream: () => Effect.die("API Error"),
			repo: Effect.succeed({ owner: "test-owner", repo: "test-repo" }),
		});
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const svc = yield* PhaseDetector;
				return yield* svc.detect({ releaseBranch: "changeset-release/main", targetBranch: "main" });
			}).pipe(
				Effect.provide(
					PhaseDetectorLive.pipe(
						Layer.provide(
							Layer.mergeAll(
								ActionEnvironmentTest.layer(
									{
										GITHUB_REF: "refs/heads/main",
										GITHUB_EVENT_NAME: "push",
										GITHUB_SHA: "abc123",
										GITHUB_REPOSITORY: "test-owner/test-repo",
									},
									{ head_commit: { message: "chore: release v1.0.0\n\nVersion Packages" } } as never,
								),
								failingGh,
							),
						),
					),
				),
			),
		);
		expect(result.phase).toBe("publishing");
		expect(result.isReleaseCommit).toBe(true);
	});

	it("fallback: API fails, merge commit message triggers publishing", async () => {
		const failingGh = Layer.succeed(GitHubClient, {
			rest: () => Effect.die("API Error") as never,
			graphql: () => Effect.die("API Error"),
			paginate: () => Effect.die("API Error"),
			paginateStream: () => Effect.die("API Error"),
			repo: Effect.succeed({ owner: "test-owner", repo: "test-repo" }),
		});
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const svc = yield* PhaseDetector;
				return yield* svc.detect({ releaseBranch: "changeset-release/main", targetBranch: "main" });
			}).pipe(
				Effect.provide(
					PhaseDetectorLive.pipe(
						Layer.provide(
							Layer.mergeAll(
								ActionEnvironmentTest.layer(
									{
										GITHUB_REF: "refs/heads/main",
										GITHUB_EVENT_NAME: "push",
										GITHUB_SHA: "abc123",
										GITHUB_REPOSITORY: "test-owner/test-repo",
									},
									{
										head_commit: { message: "Merge branch 'changeset-release/main' into main" },
									} as never,
								),
								failingGh,
							),
						),
					),
				),
			),
		);
		expect(result.phase).toBe("publishing");
		expect(result.isReleaseCommit).toBe(true);
	});

	it("custom branch names: ref=refs/heads/release/next, releaseBranch=release/next", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const svc = yield* PhaseDetector;
				return yield* svc.detect({ releaseBranch: "release/next", targetBranch: "develop" });
			}).pipe(
				Effect.provide(
					PhaseDetectorLive.pipe(
						Layer.provide(
							Layer.mergeAll(
								ActionEnvironmentTest.layer(
									{
										GITHUB_REF: "refs/heads/release/next",
										GITHUB_EVENT_NAME: "push",
										GITHUB_SHA: "abc123",
										GITHUB_REPOSITORY: "test-owner/test-repo",
									},
									{ head_commit: { message: "ci: bump" } } as never,
								),
								makeGhClient([]),
							),
						),
					),
				),
			),
		);
		expect(result.phase).toBe("validation");
		expect(result.isReleaseBranch).toBe(true);
	});

	it("non-release PR merge does not trigger release commit", async () => {
		const result = await runDetect(
			{
				GITHUB_REF: "refs/heads/main",
				GITHUB_EVENT_NAME: "push",
				GITHUB_SHA: "abc123",
				GITHUB_REPOSITORY: "test-owner/test-repo",
			},
			{ head_commit: { message: "feat: something" } },
			[
				{
					number: 50,
					merged_at: "2024-01-01T00:00:00Z",
					head: { ref: "feature/something" },
					base: { ref: "main" },
				},
			],
		);
		expect(result.phase).toBe("branch-management");
		expect(result.isReleaseCommit).toBe(false);
	});

	it("PR merge event from non-release branch is not isReleasePRMerged", async () => {
		const result = await runDetect(
			{
				GITHUB_REF: "refs/heads/main",
				GITHUB_EVENT_NAME: "pull_request",
				GITHUB_SHA: "abc123",
				GITHUB_REPOSITORY: "test-owner/test-repo",
			},
			{
				pull_request: {
					number: 55,
					merged: true,
					head: { ref: "feature/other" },
					base: { ref: "main" },
				},
			},
		);
		expect(result.isReleasePRMerged).toBe(false);
	});

	it("truncates long commit messages to 100 chars + ellipsis", async () => {
		const result = await runDetect(
			{
				GITHUB_REF: "refs/heads/main",
				GITHUB_EVENT_NAME: "push",
				GITHUB_SHA: "abc123",
				GITHUB_REPOSITORY: "test-owner/test-repo",
			},
			{ head_commit: { message: "a".repeat(200) } },
			[],
		);
		expect(result.commitMessage.length).toBe(103); // 100 chars + "..."
		expect(result.commitMessage.endsWith("...")).toBe(true);
	});

	it("workflow_dispatch on main branch returns branch-management", async () => {
		const result = await runDetect(
			{
				GITHUB_REF: "refs/heads/main",
				GITHUB_EVENT_NAME: "workflow_dispatch",
				GITHUB_SHA: "abc123",
				GITHUB_REPOSITORY: "test-owner/test-repo",
			},
			{ head_commit: { message: "feat: add new feature" } },
			[],
		);
		expect(result.phase).toBe("branch-management");
	});

	// --- prefix-aware retry on the push-to-main path ---

	const mainPushEnv = {
		GITHUB_REF: "refs/heads/main",
		GITHUB_EVENT_NAME: "push",
		GITHUB_SHA: "abc",
		GITHUB_REPOSITORY: "owner/repo",
	};
	const mergedReleasePR = {
		number: 42,
		merged_at: "2024-01-01T00:00:00Z",
		head: { ref: "changeset-release/main" },
		base: { ref: "main" },
	};

	// Build a GitHubClient whose listPullRequestsAssociatedWithCommit returns
	// `emptyUntil - 1` empty results, then the merged release PR. Counts calls.
	const makeCountingGh = (emptyUntil: number, counter: { calls: number }) =>
		Layer.succeed(GitHubClient, {
			rest: (() => {
				counter.calls += 1;
				const data = counter.calls >= emptyUntil ? [mergedReleasePR] : [];
				return Effect.succeed(data);
			}) as never,
			graphql: () => Effect.die("graphql unused"),
			paginate: () => Effect.die("paginate unused"),
			paginateStream: () => Effect.die("paginateStream unused"),
			repo: Effect.succeed({ owner: "owner", repo: "repo" }),
		});

	const detectWithPrefix = (gh: Layer.Layer<GitHubClient>, message: string, releasePrefix: string) =>
		Effect.gen(function* () {
			const svc = yield* PhaseDetector;
			return yield* svc.detect({ releaseBranch: "changeset-release/main", targetBranch: "main", releasePrefix });
		}).pipe(
			Effect.provide(
				PhaseDetectorLive.pipe(
					Layer.provide(
						Layer.mergeAll(ActionEnvironmentTest.layer(mainPushEnv, { head_commit: { message } } as never), gh),
					),
				),
			),
		);

	it("retries a release-prefixed commit until the PR association appears", async () => {
		const counter = { calls: 0 };
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const fiber = yield* Effect.fork(
					detectWithPrefix(makeCountingGh(3, counter), "release: 1.2.3 (#42)", "release:"),
				);
				yield* TestClock.adjust("30 seconds");
				return yield* Fiber.join(fiber);
			}).pipe(Effect.provide(TestContext.TestContext)),
		);
		expect(result.phase).toBe("publishing");
		expect(result.isReleaseCommit).toBe(true);
		expect(result.mergedReleasePRNumber).toBe(42);
		expect(counter.calls).toBe(3);
	});

	it("falls back to branch-management when retries exhaust without a PR association", async () => {
		const counter = { calls: 0 };
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				// emptyUntil=99 → always empty
				const fiber = yield* Effect.fork(
					detectWithPrefix(makeCountingGh(99, counter), "release: 9.9.9 (#7)", "release:"),
				);
				yield* TestClock.adjust("40 seconds");
				return yield* Fiber.join(fiber);
			}).pipe(Effect.provide(TestContext.TestContext)),
		);
		expect(result.phase).toBe("branch-management");
		expect(result.isReleaseCommit).toBe(false);
		expect(counter.calls).toBe(4); // 1 initial + 3 retries
	});

	it("returns immediately when the PR association is present on the first try", async () => {
		const counter = { calls: 0 };
		// No TestClock needed: the PR is found on call 1, so no sleep occurs.
		const result = await Effect.runPromise(
			detectWithPrefix(makeCountingGh(1, counter), "release: 2.0.0 (#9)", "release:"),
		);
		expect(result.phase).toBe("publishing");
		expect(result.mergedReleasePRNumber).toBe(42);
		expect(counter.calls).toBe(1);
	});

	it("does not retry when the commit message lacks the release prefix", async () => {
		const counter = { calls: 0 };
		const result = await Effect.runPromise(
			detectWithPrefix(makeCountingGh(99, counter), "feat: add thing", "release:"),
		);
		expect(result.phase).toBe("branch-management");
		expect(counter.calls).toBe(1);
	});

	it("does not retry when release-prefix is empty (empty-prefix guard)", async () => {
		const counter = { calls: 0 };
		const result = await Effect.runPromise(detectWithPrefix(makeCountingGh(99, counter), "release: 1.0.0 (#1)", ""));
		expect(result.phase).toBe("branch-management");
		expect(counter.calls).toBe(1);
	});
});
