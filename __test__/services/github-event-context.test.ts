import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { TriggerType } from "../../src/schemas/trigger.js";
import { GitHubEventContext, GitHubEventContextTest } from "../../src/services/github-event-context.js";

describe("GitHubEventContext", () => {
	const makeTrigger = (overrides: Partial<TriggerType> = {}): TriggerType => ({
		event: "push",
		branch: "main",
		pr_number: 0,
		is_merged: false,
		sha: "abc123",
		...overrides,
	});

	it("returns trigger context for a push event", async () => {
		const layer = GitHubEventContextTest.layer(makeTrigger());
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const ctx = yield* GitHubEventContext;
				return yield* ctx.trigger;
			}).pipe(Effect.provide(layer)),
		);
		expect(result.event).toBe("push");
		expect(result.branch).toBe("main");
		expect(result.sha).toBe("abc123");
	});

	it("returns trigger context for a PR merge event", async () => {
		const layer = GitHubEventContextTest.layer(
			makeTrigger({
				event: "pull_request",
				branch: "changeset-release/main",
				pr_number: 42,
				is_merged: true,
				sha: "def456",
			}),
		);
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const ctx = yield* GitHubEventContext;
				return yield* ctx.trigger;
			}).pipe(Effect.provide(layer)),
		);
		expect(result.event).toBe("pull_request");
		expect(result.pr_number).toBe(42);
		expect(result.is_merged).toBe(true);
	});
});
