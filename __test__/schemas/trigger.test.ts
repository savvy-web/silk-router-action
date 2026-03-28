import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Trigger } from "../../src/schemas/trigger.js";

describe("Trigger schema", () => {
	const decode = Schema.decodeUnknownSync(Trigger);
	const encode = Schema.encodeSync(Trigger);

	it("decodes a push trigger", () => {
		const result = decode({ event: "push", branch: "main", pr_number: 0, is_merged: false, sha: "abc123" });
		expect(result.event).toBe("push");
		expect(result.branch).toBe("main");
	});

	it("decodes a pull_request trigger", () => {
		const result = decode({
			event: "pull_request",
			branch: "changeset-release/main",
			pr_number: 42,
			is_merged: true,
			sha: "def789",
		});
		expect(result.pr_number).toBe(42);
		expect(result.is_merged).toBe(true);
	});

	it("round-trips", () => {
		const input = { event: "push" as const, branch: "main", pr_number: 0, is_merged: false, sha: "abc123" };
		expect(decode(encode(input))).toEqual(input);
	});

	it("rejects missing fields", () => {
		expect(() => decode({ event: "push" })).toThrow();
	});
});
