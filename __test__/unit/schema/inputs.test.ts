import { ActionInput } from "@effected/github-actions";
import { ConfigProvider, Effect } from "effect";
import { describe, expect, it } from "vitest";
import { INPUT_DEFAULTS, INPUT_NAMES, readInputs } from "../../../src/schema/inputs.js";

/**
 * Inputs are injected by **provider**, per case — never by mutating
 * `process.env` between reads. The environment is seeded once at construction;
 * mutating it mid-suite is a quiet false green.
 *
 * @remarks
 * Keyed by **input name**, never by a hand-spelled runner variable.
 * `ActionInput.provider` accepts `with:`-block-shaped keys and derives the
 * variable itself through the one spelling of the derivation, which makes the
 * hyphen-mangling class of bug (`INPUT_TARGET_BRANCH` vs the runner's real
 * `INPUT_TARGET-BRANCH`) impossible to write. A test that hand-spells the
 * underscore form reads as absent on a real runner, silently takes the default,
 * and goes green against the wrong value.
 *
 * If a test ever genuinely must name a variable, call `ActionInput.variable(name)`
 * rather than writing a literal.
 */
const withInputs = (env: Readonly<Record<string, string>>) =>
	Effect.provide(readInputs, ConfigProvider.layer(ActionInput.provider(env)));

describe("input contract", () => {
	it("declares exactly 4 names", () => {
		expect(INPUT_NAMES).toHaveLength(4);
		expect(new Set(INPUT_NAMES).size).toBe(4);
	});

	it("declares token, which the client layer consumes rather than readInputs", () => {
		expect(INPUT_NAMES).toContain("token");
		expect(Object.keys(INPUT_DEFAULTS)).not.toContain("token");
	});
});

describe("readInputs", () => {
	it("takes the manifest defaults for branch inputs the runner did not supply", async () => {
		// `release-branch` and `target-branch` keep `Config.withDefault`, so the
		// fallback is code-side and an omitted key exercises it directly.
		const inputs = await Effect.runPromise(withInputs({}));
		expect(inputs.releaseBranch).toBe("changeset-release/main");
		expect(inputs.targetBranch).toBe("main");
	});

	it("reads values supplied under their input names", async () => {
		const inputs = await Effect.runPromise(
			withInputs({ "release-branch": "changeset-release/next", "target-branch": "trunk" }),
		);
		expect(inputs.releaseBranch).toBe("changeset-release/next");
		expect(inputs.targetBranch).toBe("trunk");
	});

	/**
	 * The discriminating test for the derivation.
	 *
	 * @remarks
	 * Spells the runner variable **through `ActionInput.variable`**, so the
	 * assertion tracks the real derivation instead of a guess at it. The hyphen is
	 * the point: GitHub uppercases and replaces *spaces* with underscores, leaving
	 * dashes alone, so the published name is `INPUT_TARGET-BRANCH`.
	 */
	it("resolves the runner variable the derivation actually publishes", async () => {
		expect(ActionInput.variable("target-branch")).toBe("INPUT_TARGET-BRANCH");
		const inputs = await Effect.runPromise(withInputs({ [ActionInput.variable("target-branch")]: "trunk" }));
		expect(inputs.targetBranch).toBe("trunk");
	});

	it("does not resolve the underscore spelling of a hyphenated input", async () => {
		// If the derivation ever mangled hyphens to underscores, this would start
		// resolving and the action would read a key the runner never publishes.
		const inputs = await Effect.runPromise(withInputs({ INPUT_TARGET_BRANCH: "trunk" }));
		expect(inputs.targetBranch).toBe("main");
	});
});

/**
 * `release-prefix` has three distinguishable states, and the frozen retry
 * contract (R1) depends on all three.
 *
 * @remarks
 * ⚠️ **"Unsupplied" means opposite things on a runner and in a bare test env**,
 * which is why the cases below are named for the environment rather than for the
 * caller's intent.
 *
 * On a runner, `action.yml`'s `default: "release:"` guarantees the variable is
 * published, so unsupplied arrives as `"release:"` and retry is **enabled**. In a
 * bare test env nothing applies that default, so an omitted key is genuinely
 * absent and maps to `""` — retry **disabled**, the exact inverse.
 *
 * A test that modelled runner-unsupplied as an omitted key would assert
 * *disabled*, pass, and encode the opposite of production behavior.
 */
describe("readInputs > release-prefix", () => {
	it("runner-unsupplied (manifest default published) enables retry", async () => {
		const inputs = await Effect.runPromise(withInputs({ "release-prefix": INPUT_DEFAULTS["release-prefix"] }));
		expect(inputs.releasePrefix).toBe("release:");
	});

	it("explicitly empty disables retry", async () => {
		// The clause R1 freezes. `Config.withDefault` would map this back to
		// "release:" and make the clause unimplementable.
		const inputs = await Effect.runPromise(withInputs({ "release-prefix": "" }));
		expect(inputs.releasePrefix).toBe("");
	});

	it("explicitly set uses the caller's prefix", async () => {
		const inputs = await Effect.runPromise(withInputs({ "release-prefix": "ship:" }));
		expect(inputs.releasePrefix).toBe("ship:");
	});

	it("all three states are distinguishable", async () => {
		const [unsupplied, disabled, custom] = await Promise.all([
			Effect.runPromise(withInputs({ "release-prefix": INPUT_DEFAULTS["release-prefix"] })),
			Effect.runPromise(withInputs({ "release-prefix": "" })),
			Effect.runPromise(withInputs({ "release-prefix": "ship:" })),
		]);
		expect(new Set([unsupplied.releasePrefix, disabled.releasePrefix, custom.releasePrefix]).size).toBe(3);
	});

	it("locally-absent maps to disabled, which is not the runner's unsupplied case", async () => {
		// Documents honest local-execution behavior. It must never stand in for
		// the runner-unsupplied case above.
		const inputs = await Effect.runPromise(withInputs({}));
		expect(inputs.releasePrefix).toBe("");
	});
});
