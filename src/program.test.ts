// src/program.test.ts
import * as fs from "node:fs";
import { NodeFileSystem } from "@effect/platform-node";
import { GitHubClient } from "@savvy-web/github-action-effects";
import { ActionEnvironmentTest, ActionLoggerTest, ActionOutputsTest } from "@savvy-web/github-action-effects/testing";
import { ConfigProvider, Effect, Layer, Logger } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { program } from "./program.js";
import { PhaseDetectorLive } from "./services/phase-detector.js";

vi.mock("node:fs");

const makeGh = (associatedPRs: ReadonlyArray<unknown> = []) =>
	Layer.succeed(GitHubClient, {
		rest: <T>(_op: string, fn: (octokit: unknown) => Promise<{ data: T }>) =>
			Effect.tryPromise({
				try: () =>
					fn({
						rest: {
							repos: { listPullRequestsAssociatedWithCommit: async () => ({ data: associatedPRs }) },
						},
					}),
				catch: (e) => e as never,
			}).pipe(Effect.map((r) => (r as { data: T }).data)) as never,
		graphql: () => Effect.die("graphql not used"),
		paginate: () => Effect.die("paginate not used"),
		paginateStream: () => Effect.die("paginateStream not used"),
		repo: Effect.succeed({ owner: "owner", repo: "repo" }),
	});

const runProgram = (input: {
	env: Record<string, string>;
	payload: Record<string, unknown>;
	associated?: ReadonlyArray<unknown>;
	inputs?: Record<string, string>;
}) => {
	const outputsState = ActionOutputsTest.empty();
	const baseLayer = Layer.mergeAll(
		ActionOutputsTest.layer(outputsState),
		ActionLoggerTest.layer(ActionLoggerTest.empty()),
		ActionEnvironmentTest.layer(input.env, input.payload as never),
		makeGh(input.associated ?? []),
		NodeFileSystem.layer,
	);
	const fullLayer = Layer.provideMerge(PhaseDetectorLive, baseLayer);
	const configProvider = ConfigProvider.fromMap(new Map(Object.entries(input.inputs ?? {})));
	return Effect.runPromise(
		(program as Effect.Effect<void, never, never>).pipe(
			Effect.withConfigProvider(configProvider),
			Effect.provide(fullLayer),
			Effect.provide(Logger.replace(Logger.defaultLogger, Logger.none)),
		),
	).then(() => outputsState);
};

const getOutput = (state: ReturnType<typeof ActionOutputsTest.empty>, name: string): string | undefined =>
	[...state.outputs].reverse().find((o) => o.name === name)?.value;

describe("program (full pipeline)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(fs.existsSync).mockReturnValue(false);
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("sets all 10 outputs for a branch-management push on main with no changesets", async () => {
		const state = await runProgram({
			env: {
				GITHUB_REF: "refs/heads/main",
				GITHUB_EVENT_NAME: "push",
				GITHUB_SHA: "abc",
				GITHUB_REPOSITORY: "owner/repo",
			},
			payload: { head_commit: { message: "feat: thing" } },
		});
		expect(getOutput(state, "phase")).toBe("branch-management");
		expect(getOutput(state, "has_changesets")).toBe("false");
		expect(getOutput(state, "changeset_count")).toBe("0");
		expect(getOutput(state, "release_type")).toBe("");
		expect(getOutput(state, "is_release_commit")).toBe("false");
		expect(getOutput(state, "is_release_branch")).toBe("false");
		expect(getOutput(state, "is_main_branch")).toBe("true");
		expect(getOutput(state, "merged_pr_number")).toBe("");
		expect(getOutput(state, "should_continue")).toBe("true");
		expect(getOutput(state, "reason")).toMatch(/not a release commit/);
	});

	it("emits publishing outputs when a merged release PR is detected", async () => {
		const state = await runProgram({
			env: {
				GITHUB_REF: "refs/heads/main",
				GITHUB_EVENT_NAME: "push",
				GITHUB_SHA: "abc",
				GITHUB_REPOSITORY: "owner/repo",
			},
			payload: { head_commit: { message: "chore: version packages" } },
			associated: [
				{
					number: 42,
					merged_at: "2024-01-01T00:00:00Z",
					head: { ref: "changeset-release/main" },
					base: { ref: "main" },
				},
			],
		});
		expect(getOutput(state, "phase")).toBe("publishing");
		expect(getOutput(state, "merged_pr_number")).toBe("42");
		expect(getOutput(state, "should_continue")).toBe("true");
	});

	it("emits should_continue=false when phase is none", async () => {
		const state = await runProgram({
			env: {
				GITHUB_REF: "refs/heads/feature/x",
				GITHUB_EVENT_NAME: "push",
				GITHUB_SHA: "abc",
				GITHUB_REPOSITORY: "owner/repo",
			},
			payload: { head_commit: { message: "feat: x" } },
		});
		expect(getOutput(state, "phase")).toBe("none");
		expect(getOutput(state, "should_continue")).toBe("false");
	});

	it("honors custom release-branch/target-branch inputs via ConfigProvider", async () => {
		const state = await runProgram({
			env: {
				GITHUB_REF: "refs/heads/release/preview",
				GITHUB_EVENT_NAME: "push",
				GITHUB_SHA: "abc",
				GITHUB_REPOSITORY: "owner/repo",
			},
			payload: { head_commit: { message: "ci: bump" } },
			inputs: { "release-branch": "release/preview", "target-branch": "trunk" },
		});
		expect(getOutput(state, "phase")).toBe("validation");
		expect(getOutput(state, "is_release_branch")).toBe("true");
	});
});
