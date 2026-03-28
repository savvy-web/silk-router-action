import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { RegistryTargetType } from "../../src/schemas/registry.js";
import { TargetResolver, TargetResolverTest } from "../../src/services/target-resolver.js";

describe("TargetResolver", () => {
	it("resolves npm-only target", async () => {
		const layer = TargetResolverTest.layer({
			"my-package": [
				{
					as: "my-package",
					source: ".",
					registry: {
						id: "npm",
						name: "npm",
						protocol: "npm",
						params: { registry: "https://registry.npmjs.org", provenance: true },
						artifacts: [],
					},
				},
			],
		});
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const resolver = yield* TargetResolver;
				return yield* resolver.resolve("my-package", ".");
			}).pipe(Effect.provide(layer)),
		);
		expect(result).toHaveLength(1);
		expect(result[0].as).toBe("my-package");
		expect(result[0].registry.protocol).toBe("npm");
	});

	it("resolves multi-target for Silk publishConfig.targets", async () => {
		const targets: RegistryTargetType[] = [
			{
				as: "foobar",
				source: "dist/npm",
				registry: {
					id: "npm",
					name: "npm",
					protocol: "npm",
					params: { registry: "https://registry.npmjs.org", provenance: true },
					artifacts: [],
				},
			},
			{
				as: "@savvy-web/foobar",
				source: "dist/github",
				registry: {
					id: "github",
					name: "GitHub Packages",
					protocol: "npm",
					params: { registry: "https://npm.pkg.github.com", provenance: true },
					artifacts: [],
				},
			},
		];
		const layer = TargetResolverTest.layer({ "@savvy-web/foobar": targets });
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const resolver = yield* TargetResolver;
				return yield* resolver.resolve("@savvy-web/foobar", "packages/foo");
			}).pipe(Effect.provide(layer)),
		);
		expect(result).toHaveLength(2);
		expect(result[0].as).toBe("foobar");
		expect(result[1].as).toBe("@savvy-web/foobar");
	});

	it("returns empty array for non-publishable package", async () => {
		const layer = TargetResolverTest.layer({});
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const resolver = yield* TargetResolver;
				return yield* resolver.resolve("private-pkg", "packages/private");
			}).pipe(Effect.provide(layer)),
		);
		expect(result).toHaveLength(0);
	});
});
