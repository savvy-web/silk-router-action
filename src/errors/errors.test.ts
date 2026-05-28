// src/errors/errors.test.ts
import { describe, expect, it } from "vitest";
import { ChangesetParseError, PhaseDetectionError, SummaryWriteError } from "./errors.js";

describe("errors", () => {
	describe("PhaseDetectionError", () => {
		it("formats message with operation and reason", () => {
			const err = new PhaseDetectionError({ operation: "query-pr", reason: "API 500" });
			expect(err._tag).toBe("PhaseDetectionError");
			expect(err.message).toBe("Phase detection failed (query-pr): API 500");
		});

		it("accepts every operation literal", () => {
			for (const op of ["query-pr", "parse-commit", "detect-merge"] as const) {
				const err = new PhaseDetectionError({ operation: op, reason: "x" });
				expect(err.operation).toBe(op);
			}
		});

		it("preserves the cause when supplied", () => {
			const cause = new Error("boom");
			const err = new PhaseDetectionError({ operation: "query-pr", reason: "x", cause });
			expect(err.cause).toBe(cause);
		});
	});

	describe("ChangesetParseError", () => {
		it("formats message with file and reason", () => {
			const err = new ChangesetParseError({ file: ".changeset/foo.md", reason: "no frontmatter" });
			expect(err._tag).toBe("ChangesetParseError");
			expect(err.message).toBe("Failed to parse .changeset/foo.md: no frontmatter");
		});
	});

	describe("SummaryWriteError", () => {
		it("formats message with reason", () => {
			const err = new SummaryWriteError({ reason: "EACCES" });
			expect(err._tag).toBe("SummaryWriteError");
			expect(err.message).toBe("Failed to write job summary: EACCES");
		});
	});
});
