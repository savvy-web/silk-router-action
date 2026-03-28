import { describe, expect, it } from "vitest";
import {
	ChangesetConfigError,
	ChangesetReadError,
	PhaseDetectionError,
	ReleasePlanError,
	TargetResolutionError,
	TriggerContextError,
} from "../../src/errors/errors.js";

describe("Error types", () => {
	describe("PhaseDetectionError", () => {
		it("creates with tag and message", () => {
			const error = new PhaseDetectionError({ reason: "Could not determine phase", sha: "abc123" });
			expect(error._tag).toBe("PhaseDetectionError");
			expect(error.reason).toBe("Could not determine phase");
			expect(error.sha).toBe("abc123");
			expect(error.message).toContain("Could not determine phase");
		});
	});

	describe("ChangesetReadError", () => {
		it("creates with tag and message", () => {
			const error = new ChangesetReadError({ reason: "Failed to read .changeset directory" });
			expect(error._tag).toBe("ChangesetReadError");
			expect(error.message).toContain("Failed to read .changeset directory");
		});
	});

	describe("ChangesetConfigError", () => {
		it("creates with tag and message", () => {
			const error = new ChangesetConfigError({ reason: "Invalid config.json" });
			expect(error._tag).toBe("ChangesetConfigError");
			expect(error.message).toContain("Invalid config.json");
		});
	});

	describe("ReleasePlanError", () => {
		it("creates with tag and message", () => {
			const error = new ReleasePlanError({ reason: "Failed to assemble release plan" });
			expect(error._tag).toBe("ReleasePlanError");
			expect(error.message).toContain("Failed to assemble release plan");
		});
	});

	describe("TargetResolutionError", () => {
		it("creates with tag, package name, and reason", () => {
			const error = new TargetResolutionError({ packageName: "@savvy-web/foo", reason: "Unknown protocol" });
			expect(error._tag).toBe("TargetResolutionError");
			expect(error.packageName).toBe("@savvy-web/foo");
			expect(error.message).toContain("@savvy-web/foo");
		});
	});

	describe("TriggerContextError", () => {
		it("creates with tag and message", () => {
			const error = new TriggerContextError({ reason: "Missing GITHUB_EVENT_NAME" });
			expect(error._tag).toBe("TriggerContextError");
			expect(error.message).toContain("Missing GITHUB_EVENT_NAME");
		});
	});
});
