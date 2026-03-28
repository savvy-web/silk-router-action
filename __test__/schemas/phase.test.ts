import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import type { PhaseType } from "../../src/schemas/phase.js";
import { Phase } from "../../src/schemas/phase.js";

describe("Phase schema", () => {
	const decode = Schema.decodeUnknownSync(Phase);

	it("accepts all valid phase values", () => {
		const valid: PhaseType[] = ["silk-branch", "silk-validate", "silk-publish", "silk-release", "close-issues", "skip"];
		for (const phase of valid) expect(decode(phase)).toBe(phase);
	});

	it("rejects invalid values", () => {
		expect(() => decode("invalid")).toThrow();
		expect(() => decode(42)).toThrow();
	});
});
