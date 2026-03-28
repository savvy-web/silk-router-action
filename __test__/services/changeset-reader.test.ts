import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
	ChangesetReader,
	ChangesetReaderTest,
	SimpleChangeset,
	SimpleConfig,
} from "../../src/services/changeset-reader.js";

describe("ChangesetReader", () => {
	it("returns changesets when present", async () => {
		const layer = ChangesetReaderTest.layer({
			changesets: [
				new SimpleChangeset({
					id: "happy-dogs-fly",
					summary: "Add feature",
					releases: [{ name: "pkg", type: "minor" }],
				}),
			],
			config: Option.some(new SimpleConfig({ changelog: false, commit: false, access: "restricted" })),
		});
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const reader = yield* ChangesetReader;
				return yield* reader.read("/fake/path");
			}).pipe(Effect.provide(layer)),
		);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("happy-dogs-fly");
	});

	it("returns empty array when no changesets", async () => {
		const layer = ChangesetReaderTest.layer({ changesets: [], config: Option.none() });
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const reader = yield* ChangesetReader;
				return yield* reader.read("/fake/path");
			}).pipe(Effect.provide(layer)),
		);
		expect(result).toHaveLength(0);
	});

	it("returns Option.none for config when no .changeset dir", async () => {
		const layer = ChangesetReaderTest.layer({ changesets: [], config: Option.none() });
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const reader = yield* ChangesetReader;
				return yield* reader.config("/fake/path");
			}).pipe(Effect.provide(layer)),
		);
		expect(Option.isNone(result)).toBe(true);
	});

	it("returns Option.some for config when .changeset dir exists", async () => {
		const layer = ChangesetReaderTest.layer({
			changesets: [],
			config: Option.some(new SimpleConfig({ changelog: false, commit: false, access: "restricted" })),
		});
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const reader = yield* ChangesetReader;
				return yield* reader.config("/fake/path");
			}).pipe(Effect.provide(layer)),
		);
		expect(Option.isSome(result)).toBe(true);
	});
});
