import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { PullRequestDetector, PullRequestDetectorTest } from "../../src/services/pull-request-detector.js";

describe("PullRequestDetector", () => {
	it("detects a release commit when test layer says true", async () => {
		const layer = PullRequestDetectorTest.layer({ isReleaseCommit: true });
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const detector = yield* PullRequestDetector;
				return yield* detector.isReleaseCommit("abc123", "changeset-release/main", "main");
			}).pipe(Effect.provide(layer)),
		);
		expect(result).toBe(true);
	});

	it("returns false when no release PR is associated", async () => {
		const layer = PullRequestDetectorTest.layer({ isReleaseCommit: false });
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const detector = yield* PullRequestDetector;
				return yield* detector.isReleaseCommit("abc123", "changeset-release/main", "main");
			}).pipe(Effect.provide(layer)),
		);
		expect(result).toBe(false);
	});
});
