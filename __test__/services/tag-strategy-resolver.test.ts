import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { TagStrategyInput, TagStrategyResolver } from "../../src/services/tag-strategy-resolver.js";

const resolve = (input: TagStrategyInput) =>
	Effect.runPromise(
		Effect.gen(function* () {
			const resolver = yield* TagStrategyResolver;
			return yield* resolver.resolve(input);
		}).pipe(Effect.provide(TagStrategyResolver.Live)),
	);

describe("TagStrategyResolver", () => {
	it("returns single for single-package repo", async () => {
		expect(
			await resolve(new TagStrategyInput({ packageCount: 1, releaseCount: 1, workspacePackageNames: ["pkg"] })),
		).toBe("single");
	});

	it("returns single for monorepo with one release", async () => {
		expect(
			await resolve(new TagStrategyInput({ packageCount: 3, releaseCount: 1, workspacePackageNames: ["a", "b", "c"] })),
		).toBe("single");
	});

	it("returns scoped for monorepo with multiple releases", async () => {
		expect(
			await resolve(new TagStrategyInput({ packageCount: 3, releaseCount: 2, workspacePackageNames: ["a", "b", "c"] })),
		).toBe("scoped");
	});

	it("returns single when no releases", async () => {
		expect(
			await resolve(new TagStrategyInput({ packageCount: 1, releaseCount: 0, workspacePackageNames: ["pkg"] })),
		).toBe("single");
	});
});
