// src/schemas/domain.test.ts
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { BumpType, ChangesetRelease, ParsedChangeset, PhaseDetectionResult, WorkflowPhase } from "./domain.js";

describe("schemas/domain", () => {
	describe("WorkflowPhase", () => {
		it("accepts every documented phase literal", () => {
			for (const p of ["branch-management", "validation", "publishing", "close-issues", "none"] as const) {
				expect(Schema.decodeUnknownSync(WorkflowPhase)(p)).toBe(p);
			}
		});

		it("rejects an unknown phase", () => {
			expect(() => Schema.decodeUnknownSync(WorkflowPhase)("nope")).toThrow();
		});
	});

	describe("BumpType", () => {
		it("accepts major/minor/patch", () => {
			for (const t of ["major", "minor", "patch"] as const) {
				expect(Schema.decodeUnknownSync(BumpType)(t)).toBe(t);
			}
		});
	});

	describe("ChangesetRelease", () => {
		it("decodes a well-formed release", () => {
			expect(Schema.decodeUnknownSync(ChangesetRelease)({ name: "pkg", type: "minor" })).toEqual({
				name: "pkg",
				type: "minor",
			});
		});
	});

	describe("ParsedChangeset", () => {
		it("decodes id/summary/releases", () => {
			const value = { id: "abc", summary: "did a thing", releases: [{ name: "pkg", type: "patch" }] };
			expect(Schema.decodeUnknownSync(ParsedChangeset)(value)).toEqual(value);
		});
	});

	describe("PhaseDetectionResult", () => {
		it("decodes a full result with mergedReleasePRNumber omitted", () => {
			const value = {
				phase: "none" as const,
				reason: "",
				isReleaseBranch: false,
				isMainBranch: false,
				isReleaseCommit: false,
				isPullRequestEvent: false,
				isPRMerged: false,
				isReleasePRMerged: false,
				commitMessage: "",
			};
			expect(Schema.decodeUnknownSync(PhaseDetectionResult)(value)).toEqual(value);
		});

		it("decodes a result with mergedReleasePRNumber present", () => {
			const value = {
				phase: "publishing" as const,
				reason: "release",
				isReleaseBranch: false,
				isMainBranch: true,
				isReleaseCommit: true,
				mergedReleasePRNumber: 42,
				isPullRequestEvent: false,
				isPRMerged: false,
				isReleasePRMerged: false,
				commitMessage: "chore: version packages",
			};
			expect(Schema.decodeUnknownSync(PhaseDetectionResult)(value)).toEqual(value);
		});
	});
});
