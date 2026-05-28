// src/errors/errors.test.ts
import { describe, expect, it } from "vitest";
import { ChangesetParseError } from "./errors.js";

describe("errors", () => {
	describe("ChangesetParseError", () => {
		it("formats message with file and reason", () => {
			const err = new ChangesetParseError({ file: ".changeset/foo.md", reason: "no frontmatter" });
			expect(err._tag).toBe("ChangesetParseError");
			expect(err.message).toBe("Failed to parse .changeset/foo.md: no frontmatter");
		});

		it("preserves the cause when supplied", () => {
			const cause = new Error("boom");
			const err = new ChangesetParseError({ file: "x.md", reason: "x", cause });
			expect(err.cause).toBe(cause);
		});
	});
});
