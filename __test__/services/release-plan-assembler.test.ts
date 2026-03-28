import { Effect, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";
import type { RegistryTargetType } from "../../src/schemas/registry.js";
import { ChangesetReaderTest, SimpleChangeset, SimpleConfig } from "../../src/services/changeset-reader.js";
import {
	ReleasePlanAssembler,
	ReleasePlanAssemblerLive,
	WorkspacePackageInfo,
} from "../../src/services/release-plan-assembler.js";
import { TagStrategyResolver } from "../../src/services/tag-strategy-resolver.js";
import { TargetResolverTest } from "../../src/services/target-resolver.js";

const npmTarget = (name: string): RegistryTargetType => ({
	as: name,
	source: ".",
	registry: {
		id: "npm",
		name: "npm",
		protocol: "npm",
		params: { registry: "https://registry.npmjs.org", provenance: true },
		artifacts: [],
	},
});

const makeLayer = (opts: {
	changesets: Parameters<typeof ChangesetReaderTest.layer>[0];
	targets: Record<string, ReadonlyArray<RegistryTargetType>>;
}) =>
	ReleasePlanAssemblerLive.pipe(
		Layer.provide(
			Layer.mergeAll(
				ChangesetReaderTest.layer(opts.changesets),
				TargetResolverTest.layer(opts.targets),
				TagStrategyResolver.Live,
			),
		),
	);

describe("ReleasePlanAssembler", () => {
	it("assembles a plan with changesets and targets", async () => {
		const layer = makeLayer({
			changesets: {
				changesets: [
					new SimpleChangeset({
						id: "happy-dogs",
						summary: "Add feature",
						releases: [{ name: "@savvy-web/foo", type: "minor" }],
					}),
				],
				config: Option.some(new SimpleConfig({ changelog: false, commit: false, access: "restricted" })),
			},
			targets: { "@savvy-web/foo": [npmTarget("foo")] },
		});
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const assembler = yield* ReleasePlanAssembler;
				return yield* assembler.assemble("/fake/path", [
					new WorkspacePackageInfo({ name: "@savvy-web/foo", version: "1.2.0", path: "packages/foo" }),
				]);
			}).pipe(Effect.provide(layer)),
		);
		expect(result.releases).toHaveLength(1);
		expect(result.releases[0].workspace).toBe("@savvy-web/foo");
		expect(result.releases[0].type).toBe("minor");
		expect(result.releases[0].registries).toHaveLength(1);
		expect(result.changesetCount).toBe(1);
		expect(result.bump).toBe("minor");
		expect(result.tagStrategy).toBe("single");
	});

	it("returns empty plan when no changesets", async () => {
		const layer = makeLayer({ changesets: { changesets: [], config: Option.none() }, targets: {} });
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const assembler = yield* ReleasePlanAssembler;
				return yield* assembler.assemble("/fake/path", []);
			}).pipe(Effect.provide(layer)),
		);
		expect(result.releases).toHaveLength(0);
		expect(result.changesetCount).toBe(0);
		expect(result.bump).toBe("none");
	});

	it("computes scoped tag strategy for multiple releases", async () => {
		const layer = makeLayer({
			changesets: {
				changesets: [
					new SimpleChangeset({
						id: "cs-1",
						summary: "Fix",
						releases: [
							{ name: "pkg-a", type: "patch" },
							{ name: "pkg-b", type: "minor" },
						],
					}),
				],
				config: Option.some(new SimpleConfig({ changelog: false, commit: false, access: "restricted" })),
			},
			targets: { "pkg-a": [npmTarget("pkg-a")], "pkg-b": [npmTarget("pkg-b")] },
		});
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const assembler = yield* ReleasePlanAssembler;
				return yield* assembler.assemble("/fake/path", [
					new WorkspacePackageInfo({ name: "pkg-a", version: "1.0.0", path: "packages/a" }),
					new WorkspacePackageInfo({ name: "pkg-b", version: "2.0.0", path: "packages/b" }),
				]);
			}).pipe(Effect.provide(layer)),
		);
		expect(result.releases).toHaveLength(2);
		expect(result.tagStrategy).toBe("scoped");
		expect(result.bump).toBe("minor");
	});
});
