import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { INPUT_DEFAULTS, INPUT_NAMES } from "../../src/schema/inputs.js";
import { OUTPUT_NAMES } from "../../src/schema/outputs.js";

/**
 * The parity contract, enforced.
 *
 * @remarks
 * `action.yml` is the single source of truth for input and output names *and*
 * defaults; the names tuples in `src/schema/` mirror it and never re-declare it.
 * This is the third leg of that check — without it, the manifest and the tuples
 * can drift apart silently and the action ships an output nothing writes.
 *
 * The frozen contract is **4 inputs / 10 outputs**. See
 * `.claude/plans/effected-github-actions-port/00-spec.md`.
 */

const manifest = fs.readFileSync(path.join(process.cwd(), "action.yml"), "utf8");

const namesInSection = (section: "inputs" | "outputs"): ReadonlyArray<string> => {
	const lines = manifest.split("\n");
	const start = lines.indexOf(`${section}:`);
	if (start === -1) throw new Error(`no ${section}: section in action.yml`);
	const names: Array<string> = [];
	for (const line of lines.slice(start + 1)) {
		if (/^\S/.test(line)) break; // next top-level key ends the section
		const match = line.match(/^ {2}([a-z][a-z0-9_-]*):/);
		if (match) names.push(match[1]);
	}
	return names;
};

describe("action.yml parity", () => {
	it("declares exactly 4 inputs", () => {
		expect(namesInSection("inputs")).toHaveLength(4);
	});

	it("declares exactly 10 outputs", () => {
		expect(namesInSection("outputs")).toHaveLength(10);
	});

	it("input names match INPUT_NAMES exactly", () => {
		expect([...namesInSection("inputs")].sort()).toEqual([...INPUT_NAMES].sort());
	});

	it("output names match OUTPUT_NAMES exactly", () => {
		expect([...namesInSection("outputs")].sort()).toEqual([...OUTPUT_NAMES].sort());
	});

	it("mirrors each literal input default from the manifest", () => {
		// `token`'s manifest default is `${{ github.token }}`, an expression the
		// runner resolves — it has no literal counterpart in INPUT_DEFAULTS.
		for (const [name, expected] of Object.entries(INPUT_DEFAULTS)) {
			const pattern = new RegExp(`^ {2}${name}:[\\s\\S]*?^ {4}default: (.+)$`, "m");
			const match = manifest.match(pattern);
			expect(match, `no default found for input "${name}"`).not.toBeNull();
			expect(match?.[1].trim().replace(/^"|"$/g, ""), `default for "${name}"`).toBe(expected);
		}
	});

	/**
	 * A named dependency, not covered by the general mirror check above.
	 *
	 * @remarks
	 * `readInputs` reads `release-prefix` through `Config.option`, not
	 * `Config.withDefault`, so the **runner** supplies the fallback by publishing
	 * this manifest default. Empty it and every unsupplied run silently flips to
	 * retry-disabled — while the iterating check above stays green, because it
	 * only compares the manifest to `INPUT_DEFAULTS` and would see both change
	 * together.
	 */
	it("declares a non-empty release-prefix default, which Config.option depends on", () => {
		const match = manifest.match(/^ {2}release-prefix:[\s\S]*?^ {4}default: (.+)$/m);
		expect(match, "release-prefix must declare a default").not.toBeNull();
		const value = match?.[1].trim().replace(/^"|"$/g, "");
		expect(value).toBe("release:");
		expect(value).not.toBe("");
	});

	it("still targets the node24 runtime with the committed bundle", () => {
		expect(manifest).toMatch(/^ {2}using: node24$/m);
		expect(manifest).toMatch(/^ {2}main: dist\/main\.js$/m);
	});
});
