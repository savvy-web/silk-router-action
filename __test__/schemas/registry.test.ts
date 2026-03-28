import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Registry, RegistryTarget } from "../../src/schemas/registry.js";

describe("Registry schema", () => {
	const decode = Schema.decodeUnknownSync(Registry);

	it("decodes npm registry", () => {
		const r = decode({
			id: "npm",
			name: "npm",
			protocol: "npm",
			params: { registry: "https://registry.npmjs.org", provenance: true },
			artifacts: [],
		});
		expect(r.protocol).toBe("npm");
		expect((r.params as { registry: string }).registry).toBe("https://registry.npmjs.org");
	});

	it("decodes GitHub Packages registry", () => {
		const r = decode({
			id: "github",
			name: "GitHub Packages",
			protocol: "npm",
			params: { registry: "https://npm.pkg.github.com", provenance: true },
			artifacts: [],
		});
		expect(r.id).toBe("github");
	});

	it("decodes jsr registry", () => {
		const r = decode({ id: "jsr", name: "JSR", protocol: "jsr", params: {}, artifacts: [] });
		expect(r.protocol).toBe("jsr");
	});
});

describe("RegistryTarget schema", () => {
	it("decodes a target", () => {
		const decode = Schema.decodeUnknownSync(RegistryTarget);
		const r = decode({
			as: "foobar",
			source: "dist/npm",
			registry: {
				id: "npm",
				name: "npm",
				protocol: "npm",
				params: { registry: "https://registry.npmjs.org", provenance: true },
				artifacts: [],
			},
		});
		expect(r.as).toBe("foobar");
		expect(r.source).toBe("dist/npm");
	});
});
