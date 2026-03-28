import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { TriggerType } from "../../src/schemas/trigger.js";
import type { PhaseResult } from "../../src/services/phase-resolver.js";
import { PhaseInput, PhaseResolver } from "../../src/services/phase-resolver.js";

const resolve = (input: PhaseInput): Promise<PhaseResult> =>
	Effect.runPromise(
		Effect.gen(function* () {
			const resolver = yield* PhaseResolver;
			return yield* resolver.resolve(input);
		}).pipe(Effect.provide(PhaseResolver.Live)),
	);

const pushTrigger = (branch: string, sha = "abc123"): TriggerType => ({
	event: "push",
	branch,
	pr_number: 0,
	is_merged: false,
	sha,
});

const prTrigger = (branch: string, merged: boolean, prNumber = 42): TriggerType => ({
	event: "pull_request",
	branch,
	pr_number: prNumber,
	is_merged: merged,
	sha: "abc123",
});

const makeInput = (overrides: Partial<ConstructorParameters<typeof PhaseInput>[0]> = {}) =>
	new PhaseInput({
		trigger: pushTrigger("main"),
		targetBranch: "main",
		releaseBranch: "changeset-release/main",
		isReleaseCommit: false,
		hasChangesets: false,
		hasPublishablePackages: false,
		...overrides,
	});

describe("PhaseResolver", () => {
	it("returns close-issues when release PR is merged", async () => {
		const result = await resolve(
			makeInput({ trigger: prTrigger("changeset-release/main", true), hasChangesets: true }),
		);
		expect(result.phase).toBe("close-issues");
		expect(result.reason).toContain("release PR merged");
	});

	it("returns silk-validate when release PR is open", async () => {
		const result = await resolve(
			makeInput({ trigger: prTrigger("changeset-release/main", false), hasChangesets: true }),
		);
		expect(result.phase).toBe("silk-validate");
		expect(result.reason).toContain("release PR open");
	});

	it("returns silk-publish when release commit with publishable packages", async () => {
		const result = await resolve(
			makeInput({ isReleaseCommit: true, hasChangesets: true, hasPublishablePackages: true }),
		);
		expect(result.phase).toBe("silk-publish");
	});

	it("returns silk-release when release commit without publishable packages", async () => {
		const result = await resolve(makeInput({ isReleaseCommit: true, hasChangesets: true }));
		expect(result.phase).toBe("silk-release");
	});

	it("returns silk-validate when push to release branch", async () => {
		const result = await resolve(makeInput({ trigger: pushTrigger("changeset-release/main"), hasChangesets: true }));
		expect(result.phase).toBe("silk-validate");
		expect(result.reason).toContain("push to release branch");
	});

	it("returns silk-branch when push to target with changesets", async () => {
		const result = await resolve(makeInput({ hasChangesets: true, hasPublishablePackages: true }));
		expect(result.phase).toBe("silk-branch");
		expect(result.reason).toContain("changesets detected");
	});

	it("returns skip when push to target with no changesets", async () => {
		const result = await resolve(makeInput());
		expect(result.phase).toBe("skip");
		expect(result.reason).toContain("no changesets");
	});

	it("returns skip when push to unrelated branch", async () => {
		const result = await resolve(makeInput({ trigger: pushTrigger("feature/foo") }));
		expect(result.phase).toBe("skip");
	});

	it("returns skip when PR event on non-release branch", async () => {
		const result = await resolve(makeInput({ trigger: prTrigger("feature/bar", false) }));
		expect(result.phase).toBe("skip");
	});
});
