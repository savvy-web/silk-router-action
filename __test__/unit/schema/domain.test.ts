import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
	BumpType,
	ChangesetRelease,
	ParsedChangeset,
	PhaseDetectionResult,
	WorkflowPhase,
} from "../../../src/schema/domain.js";

/**
 * The domain vocabulary, exercised.
 *
 * @remarks
 * These are live definitions, not deferred business logic — the whole action's
 * output contract is derived from `PhaseDetectionResult`, and `WorkflowPhase`'s
 * literal set is what makes `format.ts`'s exhaustive switches total. They lost
 * their coverage in the restructure and it is restored here.
 */

/**
 * Decode, keeping the real error type.
 *
 * @remarks
 * No cast. Widening the channel to `unknown` would reduce every rejection case
 * below to *"this failed somehow"* — a schema that started failing for an
 * unrelated reason would keep them green. These cases are what keep
 * `format.ts`'s exhaustive switches honest, so they must assert the failure is a
 * **schema** failure.
 */
const decodeExit = <S extends Schema.Top & { readonly DecodingServices: never }>(schema: S, input: unknown) =>
	Effect.runPromiseExit(Schema.decodeUnknownEffect(schema)(input));

/** Assert `input` is rejected *as a schema error*, not merely rejected. */
const expectRejected = async <S extends Schema.Top & { readonly DecodingServices: never }>(
	schema: S,
	input: unknown,
): Promise<void> => {
	const error = await Effect.runPromise(Effect.flip(Schema.decodeUnknownEffect(schema)(input)));
	expect(error._tag).toBe("SchemaError");
};

describe("WorkflowPhase", () => {
	it("admits exactly the five documented phases", () => {
		expect([...WorkflowPhase.literals]).toEqual([
			"branch-management",
			"validation",
			"publishing",
			"close-issues",
			"none",
		]);
	});

	it("accepts each documented phase", async () => {
		for (const phase of WorkflowPhase.literals) {
			const exit = await decodeExit(WorkflowPhase, phase);
			expect(exit._tag, `phase "${phase}" should decode`).toBe("Success");
		}
	});

	it("rejects a phase outside the set", async () => {
		await expectRejected(WorkflowPhase, "deploying");
	});
});

describe("BumpType", () => {
	it("admits exactly major, minor and patch", () => {
		expect([...BumpType.literals]).toEqual(["major", "minor", "patch"]);
	});

	it("rejects an unknown bump", async () => {
		await expectRejected(BumpType, "mega");
	});
});

describe("ChangesetRelease", () => {
	it("decodes a package and its bump", async () => {
		const exit = await decodeExit(ChangesetRelease, { name: "@scope/a", type: "minor" });
		expect(exit._tag).toBe("Success");
	});

	it("rejects an invalid bump type", async () => {
		await expectRejected(ChangesetRelease, { name: "@scope/a", type: "huge" });
	});
});

describe("ParsedChangeset", () => {
	it("decodes an id, summary and releases", async () => {
		const exit = await decodeExit(ParsedChangeset, {
			id: "brave-cats-sing",
			summary: "Adds a thing",
			releases: [{ name: "@scope/a", type: "patch" }],
		});
		expect(exit._tag).toBe("Success");
	});

	it("accepts an empty release list", async () => {
		const exit = await decodeExit(ParsedChangeset, { id: "x", summary: "", releases: [] });
		expect(exit._tag).toBe("Success");
	});
});

describe("PhaseDetectionResult", () => {
	const base = {
		phase: "branch-management",
		reason: "Push to main",
		isReleaseBranch: false,
		isMainBranch: true,
		isReleaseCommit: false,
		isPullRequestEvent: false,
		isPRMerged: false,
		isReleasePRMerged: false,
		commitMessage: "feat: a thing",
	};

	it("decodes without a merged PR number", async () => {
		expect((await decodeExit(PhaseDetectionResult, base))._tag).toBe("Success");
	});

	it("decodes with a merged PR number", async () => {
		expect((await decodeExit(PhaseDetectionResult, { ...base, mergedReleasePRNumber: 42 }))._tag).toBe("Success");
	});

	it("rejects a missing required flag", async () => {
		const { isMainBranch: _omitted, ...withoutFlag } = base;
		await expectRejected(PhaseDetectionResult, withoutFlag);
	});

	it("rejects a phase outside WorkflowPhase", async () => {
		await expectRejected(PhaseDetectionResult, { ...base, phase: "deploying" });
	});
});
