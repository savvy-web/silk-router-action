import type { PullRequestInfo } from "@effected/github";
import { GitHubError, PullRequest, Repo, RepoRef } from "@effected/github";
import { Cause, DateTime, Effect, Exit, Fiber, Layer, Logger, Option } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vitest";
import { detectPhase } from "../../../src/steps/detect-phase.js";
import { actionEnvironmentTest } from "../../utils/doubles.js";

const inputs = {
	releaseBranch: "changeset-release/main",
	targetBranch: "main",
	releasePrefix: "release:",
};

/**
 * A `PullRequestInfo` shaped the way the kit reports one.
 *
 * @remarks
 * Note `head` and `base` are **flat branch names**, and merge state is `merged`
 * plus `mergedAt` — not octokit's nested `{ ref }` or nullable `merged_at`. The
 * detection predicate reads `merged`, so a fixture that only set `mergedAt`
 * would silently fail to match.
 */
const prInfo = (overrides: Partial<PullRequestInfo> = {}): PullRequestInfo =>
	({
		number: 42,
		nodeId: "PR_1",
		url: "https://github.com/acme/example/pull/42",
		title: "Version Packages",
		state: "closed",
		head: "changeset-release/main",
		headSha: "aaa",
		base: "main",
		baseSha: "bbb",
		draft: false,
		merged: true,
		mergedAt: Option.some(DateTime.makeUnsafe(0)),
		...overrides,
	}) as PullRequestInfo;

const layers = (options: {
	env?: Readonly<Record<string, string>>;
	payload?: unknown;
	associated?: ReadonlyArray<PullRequestInfo>;
	fail?: GitHubError;
}) =>
	Layer.mergeAll(
		actionEnvironmentTest(options.env ?? {}, options.payload ?? {}),
		PullRequest.layerTest({
			listAssociatedWithCommit: () =>
				options.fail !== undefined ? Effect.fail(options.fail) : Effect.succeed(options.associated ?? []),
		}),
		Repo.layer(RepoRef.make({ owner: "acme", repo: "example" })),
		// The degradation path logs a warning by design; silence it so an expected
		// log does not surface as a console leak in the reporter.
		Logger.layer([]),
	);

/**
 * Run under a virtual clock with an ample budget.
 *
 * @remarks
 * Applied to **every** case, not only the retry ones. Any test whose commit
 * message starts with the release prefix engages the retry gate, and today those
 * happen not to sleep only because the association is found on the first
 * attempt. That is one regression away from a five-second vitest timeout — a
 * fragile signal. Under the virtual clock a stray sleep surfaces as a wrong call
 * count instead.
 */
const underTestClock = <A, E>(effect: Effect.Effect<A, E>) =>
	Effect.gen(function* () {
		const fiber = yield* Effect.forkChild(effect);
		yield* TestClock.adjust("60 seconds");
		return yield* Fiber.join(fiber);
	}).pipe(Effect.provide(TestClock.layer()));

const detect = (options: Parameters<typeof layers>[0] & { inputs?: typeof inputs } = {}) =>
	Effect.runPromise(
		underTestClock(detectPhase({ inputs: options.inputs ?? inputs }).pipe(Effect.provide(layers(options)))),
	);

const push = (ref: string) => ({ GITHUB_REF: ref, GITHUB_EVENT_NAME: "push", GITHUB_SHA: "abc" });

describe("detectPhase — the six scenarios", () => {
	it("branch-management: push to main, no release commit", async () => {
		const result = await detect({ env: push("refs/heads/main"), payload: { head_commit: { message: "feat: thing" } } });
		expect(result.phase).toBe("branch-management");
		expect(result.isMainBranch).toBe(true);
		expect(result.isReleaseCommit).toBe(false);
		expect(result.reason).toContain("not a release commit");
	});

	it("validation: push to the release branch", async () => {
		const result = await detect({ env: push("refs/heads/changeset-release/main") });
		expect(result.phase).toBe("validation");
		expect(result.isReleaseBranch).toBe(true);
		expect(result.reason).toContain("Push to release branch");
	});

	it("publishing: a merged release PR is associated with the commit", async () => {
		const result = await detect({
			env: push("refs/heads/main"),
			payload: { head_commit: { message: "release: v1.2.3" } },
			associated: [prInfo({ number: 77 })],
		});
		expect(result.phase).toBe("publishing");
		expect(result.isReleaseCommit).toBe(true);
		expect(result.mergedReleasePRNumber).toBe(77);
		expect(result.reason).toContain("#77");
	});

	it("close-issues: release PR merged via a pull_request event", async () => {
		const result = await detect({
			env: { GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "pull_request" },
			payload: {
				pull_request: { merged: true, number: 99, head: { ref: "changeset-release/main" }, base: { ref: "main" } },
			},
		});
		expect(result.phase).toBe("close-issues");
		expect(result.isReleasePRMerged).toBe(true);
		expect(result.mergedReleasePRNumber).toBe(99);
	});

	it("validation: an open release PR", async () => {
		const result = await detect({
			env: { GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "pull_request" },
			payload: {
				pull_request: { merged: false, number: 5, head: { ref: "changeset-release/main" }, base: { ref: "main" } },
			},
		});
		expect(result.phase).toBe("validation");
		expect(result.reason).toContain("Open PR #5");
	});

	it("none: neither the target nor the release branch", async () => {
		const result = await detect({ env: push("refs/heads/feature/x") });
		expect(result.phase).toBe("none");
		expect(result.reason).toContain("Not on main or changeset-release/main");
	});
});

describe("detectPhase — the PR-association predicate", () => {
	it("ignores an unmerged PR", async () => {
		const result = await detect({
			env: push("refs/heads/main"),
			associated: [prInfo({ merged: false, mergedAt: Option.none() })],
		});
		expect(result.phase).toBe("branch-management");
	});

	it("ignores a PR from a different head branch", async () => {
		const result = await detect({ env: push("refs/heads/main"), associated: [prInfo({ head: "feature/x" })] });
		expect(result.phase).toBe("branch-management");
	});

	it("ignores a PR onto a different base branch", async () => {
		const result = await detect({ env: push("refs/heads/main"), associated: [prInfo({ base: "develop" })] });
		expect(result.phase).toBe("branch-management");
	});

	it("selects the matching PR from among several", async () => {
		const result = await detect({
			env: push("refs/heads/main"),
			associated: [prInfo({ number: 1, head: "feature/x" }), prInfo({ number: 2 })],
		});
		expect(result.mergedReleasePRNumber).toBe(2);
	});
});

describe("detectPhase — commit-message fallback", () => {
	const fallback = (message: string, fail = GitHubError.notFound("PullRequest.listAssociatedWithCommit", "commit")) =>
		detect({ env: push("refs/heads/main"), payload: { head_commit: { message } }, fail });

	it("treats 'chore: version packages' as a release commit", async () => {
		expect((await fallback("chore: version packages")).phase).toBe("publishing");
	});

	it("treats 'chore: release v1.0.0' as a release commit", async () => {
		expect((await fallback("chore: release v1.0.0")).phase).toBe("publishing");
	});

	it("treats a merge commit from the release branch as a release commit", async () => {
		expect((await fallback("Merge pull request #7 from acme/changeset-release/main")).phase).toBe("publishing");
	});

	it("leaves an ordinary commit as branch-management", async () => {
		expect((await fallback("feat: add a thing")).phase).toBe("branch-management");
	});

	it("reports a release without a PR number when only the message matched", async () => {
		const result = await fallback("chore: version packages");
		expect(result.mergedReleasePRNumber).toBeUndefined();
		expect(result.reason).toContain("Release commit detected");
	});
});

/**
 * Discharges U-15b.
 *
 * @remarks
 * Every kind in the degrade predicate is demonstrated firing. Of the two
 * excluded kinds, `decode` is demonstrated becoming a defect; `alreadyExists`
 * has **no test**, because the code's claim is that it cannot arise from a GET —
 * a claim about reachability, which a test cannot make by constructing one
 * artificially.
 */
describe("detectPhase — error taxonomy", () => {
	const degrading = ["transport", "rateLimited", "notFound", "rejected", "unauthorized"] as const;

	for (const kind of degrading) {
		it(`degrades to commit-message detection on a ${kind} failure`, async () => {
			const result = await detect({
				env: push("refs/heads/main"),
				payload: { head_commit: { message: "chore: version packages" } },
				fail: new GitHubError({ kind, operation: "PullRequest.listAssociatedWithCommit", reason: "simulated" }),
			});
			// It degraded rather than dying, and the fallback still ran.
			expect(result.phase).toBe("publishing");
		});
	}

	it("dies on a decode failure rather than guessing from the commit message", async () => {
		// A decode failure means the response did not match the kit's schema —
		// a bug, not a condition to paper over. Degrading here would convert a
		// broken integration into a plausible-looking wrong answer.
		const exit = await Effect.runPromiseExit(
			detectPhase({ inputs }).pipe(
				Effect.provide(
					layers({
						env: push("refs/heads/main"),
						fail: GitHubError.decode("PullRequest.listAssociatedWithCommit", "unexpected shape"),
					}),
				),
			),
		);
		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			// A defect specifically, not a typed failure — `detectPhase` declares
			// `E = never`, and asserting die-ness is what pins that down rather
			// than leaving "it failed somehow".
			expect(Cause.hasDies(exit.cause)).toBe(true);
		}
	});
});

describe("detectPhase — release-prefix retry", () => {
	const withRetry = (options: { attemptsBeforeSuccess: number; message: string; releasePrefix?: string }) => {
		let calls = 0;
		const pulls = PullRequest.layerTest({
			listAssociatedWithCommit: () =>
				Effect.sync(() => {
					calls += 1;
					return calls > options.attemptsBeforeSuccess ? [prInfo({ number: 7 })] : [];
				}),
		});
		const layer = Layer.mergeAll(
			actionEnvironmentTest(push("refs/heads/main"), { head_commit: { message: options.message } }),
			pulls,
			Repo.layer(RepoRef.make({ owner: "acme", repo: "example" })),
			Logger.layer([]),
		);
		const effect = detectPhase({
			inputs: { ...inputs, ...(options.releasePrefix !== undefined ? { releasePrefix: options.releasePrefix } : {}) },
		}).pipe(Effect.provide(layer));
		return { effect, calls: () => calls };
	};

	it("returns immediately when the association is present on the first try", async () => {
		const { effect, calls } = withRetry({ attemptsBeforeSuccess: 0, message: "release: v1" });
		// Under the virtual clock even though nothing should sleep: this engages
		// the retry gate, so a regression that made it sleep would otherwise show
		// as a vitest timeout rather than a failed assertion.
		const result = await Effect.runPromise(underTestClock(effect));
		expect(result.phase).toBe("publishing");
		expect(calls()).toBe(1);
	});

	it("retries a release-prefixed commit until the association appears", async () => {
		const { effect, calls } = withRetry({ attemptsBeforeSuccess: 2, message: "release: v1" });

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const fiber = yield* Effect.forkChild(effect);
				// Two retries at 10s each.
				// An ample budget rather than an exact one: the assertion below is
				// `calls()`, so pinning the clock to the precise total buys nothing
				// and makes the test brittle to a spacing change.
				yield* TestClock.adjust("60 seconds");
				return yield* Fiber.join(fiber);
			}).pipe(Effect.provide(TestClock.layer())),
		);

		expect(result.phase).toBe("publishing");
		expect(result.mergedReleasePRNumber).toBe(7);
		expect(calls()).toBe(3);
	});

	it("makes exactly 4 attempts before giving up (1 initial + 3 retries)", async () => {
		const { effect, calls } = withRetry({ attemptsBeforeSuccess: 99, message: "release: v1" });

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const fiber = yield* Effect.forkChild(effect);
				yield* TestClock.adjust("60 seconds");
				return yield* Fiber.join(fiber);
			}).pipe(Effect.provide(TestClock.layer())),
		);

		expect(calls()).toBe(4);
		expect(result.phase).toBe("branch-management");
	});

	/**
	 * The **spacing** half of the frozen contract.
	 *
	 * @remarks
	 * Added after a surviving mutant: changing `Schedule.spaced` from 10 seconds
	 * to 1 second left the whole suite green, because every other retry test
	 * advances the clock by an ample 60 seconds and only asserts the call *count*.
	 * A budget generous enough to be robust is, by construction, blind to timing.
	 *
	 * This one advances deliberately short and asserts how far the retry has got.
	 */
	it("spaces retries 10 seconds apart", async () => {
		const { effect, calls } = withRetry({ attemptsBeforeSuccess: 99, message: "release: v1" });

		await Effect.runPromise(
			Effect.gen(function* () {
				const fiber = yield* Effect.forkChild(effect);

				// t=0: the initial attempt has run.
				yield* TestClock.adjust("1 second");
				expect(calls(), "before the first retry is due").toBe(1);

				// t=11s: exactly one retry is due, not two.
				yield* TestClock.adjust("10 seconds");
				expect(calls(), "after one 10s interval").toBe(2);

				// t=21s: a second.
				yield* TestClock.adjust("10 seconds");
				expect(calls(), "after two 10s intervals").toBe(3);

				// Let it exhaust so the fiber completes.
				yield* TestClock.adjust("60 seconds");
				return yield* Fiber.join(fiber);
			}).pipe(Effect.provide(TestClock.layer())),
		);

		expect(calls()).toBe(4);
	});

	it("does not retry when the message lacks the release prefix", async () => {
		const { effect, calls } = withRetry({ attemptsBeforeSuccess: 99, message: "feat: a thing" });
		// Driven under TestClock and given ample virtual time: if the gate broke,
		// the retries would run and this fails on the count rather than by timing
		// out, which is a far clearer signal.
		await Effect.runPromise(underTestClock(effect));
		expect(calls()).toBe(1);
	});

	/**
	 * The R1 clause. An empty `release-prefix` disables retry entirely.
	 *
	 * @remarks
	 * Reachable only because `readInputs` reads this input through
	 * `Config.option` rather than `Config.withDefault` — see `schema/inputs.ts`.
	 * Its production reachability rests on ledger **U-16**, which only a live
	 * runner can discharge.
	 */
	it("does not retry when release-prefix is empty", async () => {
		const { effect, calls } = withRetry({ attemptsBeforeSuccess: 99, message: "release: v1", releasePrefix: "" });
		await Effect.runPromise(underTestClock(effect));
		expect(calls()).toBe(1);
	});
});

describe("detectPhase — record fields", () => {
	it("truncates a long commit message to 100 characters plus an ellipsis", async () => {
		const message = "x".repeat(150);
		const result = await detect({ env: push("refs/heads/main"), payload: { head_commit: { message } } });
		expect(result.commitMessage).toHaveLength(103);
		expect(result.commitMessage.endsWith("...")).toBe(true);
	});

	it("honours custom branch names", async () => {
		const result = await detect({
			env: push("refs/heads/release/next"),
			inputs: { releaseBranch: "release/next", targetBranch: "trunk", releasePrefix: "release:" },
		});
		expect(result.phase).toBe("validation");
		expect(result.isReleaseBranch).toBe(true);
	});

	it("does not treat a non-release PR merge as a release", async () => {
		const result = await detect({
			env: { GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "pull_request" },
			payload: { pull_request: { merged: true, number: 3, head: { ref: "feature/x" }, base: { ref: "main" } } },
		});
		expect(result.isReleasePRMerged).toBe(false);
		expect(result.phase).not.toBe("close-issues");
	});

	it("returns branch-management for a workflow_dispatch on the target branch", async () => {
		const result = await detect({
			env: { GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "workflow_dispatch" },
		});
		expect(result.phase).toBe("branch-management");
	});

	it("does not query the API for a non-push event on the target branch", async () => {
		// `listAssociatedWithCommit` is unstubbed here, so it dies if called —
		// which is the assertion.
		const result = await Effect.runPromise(
			detectPhase({ inputs }).pipe(
				Effect.provide(
					Layer.mergeAll(
						actionEnvironmentTest({ GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "workflow_dispatch" }, {}),
						PullRequest.layerTest(),
						Repo.layer(RepoRef.make({ owner: "acme", repo: "example" })),
					),
				),
			),
		);
		expect(result.phase).toBe("branch-management");
	});
});
