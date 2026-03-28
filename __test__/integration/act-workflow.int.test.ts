import { describe, expect, it } from "vitest";
import { runAction } from "./utils/setup-execa.js";

const hasCredentials = Boolean(process.env.APP_ID && process.env.APP_PRIVATE_KEY);

describe.skipIf(!hasCredentials)("silk-router integration", () => {
	it("push to feature branch -> skip", async () => {
		const result = await runAction({
			fixture: "pnpm-basic",
			event: "push",
			ref: "refs/heads/feat/some-feature",
			sha: "feature123",
			eventPayload: "push-feature.json",
		});
		expect(result.exitCode).toBe(0);
		expect(result.outputs["next-phase"]).toBe("skip");
		expect(result.outputs.reason).toContain("no actionable event");
	});

	it("push to main with changesets -> silk-branch", async () => {
		const result = await runAction({
			fixture: "pnpm-basic-changesets",
			event: "push",
			ref: "refs/heads/main",
			sha: "abc123test",
			eventPayload: "push-main.json",
		});
		expect(result.exitCode).toBe(0);
		expect(result.outputs["next-phase"]).toBe("silk-branch");
		expect(result.outputs.reason).toContain("changesets detected");
	});

	it("push to main no changesets -> skip", async () => {
		const result = await runAction({
			fixture: "pnpm-basic",
			event: "push",
			ref: "refs/heads/main",
			sha: "nocs123test",
			eventPayload: "push-main.json",
		});
		expect(result.exitCode).toBe(0);
		expect(result.outputs["next-phase"]).toBe("skip");
		expect(result.outputs.reason).toContain("no changesets");
	});

	it("push to release branch -> silk-validate", async () => {
		const result = await runAction({
			fixture: "pnpm-basic-changesets",
			event: "push",
			ref: "refs/heads/changeset-release/main",
			sha: "def456test",
			eventPayload: "push-release-branch.json",
		});
		expect(result.exitCode).toBe(0);
		expect(result.outputs["next-phase"]).toBe("silk-validate");
		expect(result.outputs.reason).toContain("push to release branch");
	});

	it("release PR merged -> close-issues", async () => {
		const result = await runAction({
			fixture: "pnpm-basic",
			event: "pull_request",
			ref: "refs/pull/42/merge",
			sha: "merged123test",
			eventPayload: "pr-merged-release.json",
		});
		expect(result.exitCode).toBe(0);
		expect(result.outputs["next-phase"]).toBe("close-issues");
		expect(result.outputs.reason).toContain("release PR merged");
	});

	it("release PR open -> silk-validate", async () => {
		const result = await runAction({
			fixture: "pnpm-basic",
			event: "pull_request",
			ref: "refs/pull/43/merge",
			sha: "propen123test",
			eventPayload: "pr-open-release.json",
		});
		expect(result.exitCode).toBe(0);
		expect(result.outputs["next-phase"]).toBe("silk-validate");
		expect(result.outputs.reason).toContain("release PR open");
	});
});
