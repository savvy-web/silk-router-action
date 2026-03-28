import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { BumpType, ReleasePlan, TagStrategy } from "../../src/schemas/release-plan.js";

describe("BumpType", () => {
	const decode = Schema.decodeUnknownSync(BumpType);

	it("accepts valid values", () => {
		for (const v of ["major", "minor", "patch", "none"]) expect(decode(v)).toBe(v);
	});

	it("rejects invalid", () => {
		expect(() => decode("prerelease")).toThrow();
	});
});

describe("TagStrategy", () => {
	it("accepts single and scoped", () => {
		const decode = Schema.decodeUnknownSync(TagStrategy);
		expect(decode("single")).toBe("single");
		expect(decode("scoped")).toBe("scoped");
	});
});

describe("ReleasePlan", () => {
	const decode = Schema.decodeUnknownSync(ReleasePlan);
	const encode = Schema.encodeSync(ReleasePlan);

	it("decodes full plan", () => {
		const r = decode({
			releases: [
				{
					workspace: "pkg",
					path: ".",
					type: "minor",
					oldVersion: "1.0.0",
					newVersion: "1.1.0",
					registries: [],
				},
			],
			tagStrategy: "single",
			changesetCount: 1,
			bump: "minor",
		});
		expect(r.releases).toHaveLength(1);
		expect(r.tagStrategy).toBe("single");
	});

	it("decodes empty plan", () => {
		const r = decode({ releases: [], tagStrategy: "single", changesetCount: 0, bump: "none" });
		expect(r.releases).toHaveLength(0);
	});

	it("round-trips", () => {
		const plan = {
			releases: [
				{
					workspace: "p",
					path: ".",
					type: "patch" as const,
					oldVersion: "1.0.0",
					newVersion: "1.0.1",
					registries: [],
				},
			],
			tagStrategy: "single" as const,
			changesetCount: 1,
			bump: "patch" as const,
		};
		expect(decode(encode(plan))).toEqual(plan);
	});
});
