import { Action } from "@effected/github-actions";
import { AppLayer } from "./layers/app.js";
import { program } from "./program.js";

/**
 * The `main` entry point.
 *
 * @remarks
 * The uniform entry guard: a program import plus one conditional call, gated on
 * the runner's own marker variable. The guard is what keeps this module
 * **importable** — and therefore testable — without executing the action as an
 * import side effect. The previous entry called `Action.run` unconditionally at
 * module scope, which is why it carried a coverage-ignore comment and why no
 * test could import it.
 *
 * The `process.env.INPUT_TOKEN → GITHUB_TOKEN` bridge that used to run above
 * this call is **gone** (ruling R7): `GitHubClient.layerFromConfig({ name:
 * "token" })` in `layers/app.ts` reads the input through the runner's own
 * `INPUT_` derivation, as a `Redacted` value.
 *
 * `vitest.setup.ts` strips `GITHUB_ACTIONS` from the test process, so importing
 * this module in a suite is inert.
 */
/* v8 ignore next 3 */
if (process.env.GITHUB_ACTIONS !== undefined) {
	await Action.run(program, { layer: AppLayer });
}
