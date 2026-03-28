import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { PhaseType } from "../../src/schemas/phase.js";
import type { ReleasePlanType } from "../../src/schemas/release-plan.js";
import { SummaryWriter, SummaryWriterTest } from "../../src/services/summary-writer.js";

describe("SummaryWriter", () => {
	it("generates markdown summary with phase and plan", async () => {
		const layer = SummaryWriterTest.captureLayer();
		const plan: ReleasePlanType = {
			releases: [
				{
					workspace: "@savvy-web/foo",
					path: "packages/foo",
					type: "minor",
					oldVersion: "1.2.0",
					newVersion: "1.3.0",
					registries: [
						{
							as: "foo",
							source: "packages/foo/dist/npm",
							registry: {
								id: "npm",
								name: "npm",
								protocol: "npm",
								params: { registry: "https://registry.npmjs.org", provenance: true },
								artifacts: [],
							},
						},
					],
				},
			],
			tagStrategy: "single",
			changesetCount: 2,
			bump: "minor",
		};

		const captured = await Effect.runPromise(
			Effect.gen(function* () {
				const writer = yield* SummaryWriter;
				return yield* writer.generate("silk-branch" as PhaseType, "changesets detected", plan);
			}).pipe(Effect.provide(layer)),
		);
		expect(captured).toContain("silk-branch");
		expect(captured).toContain("@savvy-web/foo");
		expect(captured).toContain("minor");
		expect(captured).toContain("2");
	});

	it("generates summary for skip phase with empty plan", async () => {
		const layer = SummaryWriterTest.captureLayer();
		const plan: ReleasePlanType = { releases: [], tagStrategy: "single", changesetCount: 0, bump: "none" };

		const captured = await Effect.runPromise(
			Effect.gen(function* () {
				const writer = yield* SummaryWriter;
				return yield* writer.generate("skip" as PhaseType, "no action needed", plan);
			}).pipe(Effect.provide(layer)),
		);
		expect(captured).toContain("skip");
		expect(captured).toContain("no action needed");
	});
});
