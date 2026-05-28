import { Action } from "@savvy-web/github-action-effects";
import { MainLive } from "./layers/app.js";
import { program } from "./program.js";

// Bridge the action's `token` input (exposed as INPUT_TOKEN by Action.run) to
// GITHUB_TOKEN so GitHubClientLive.fromEnv() can authenticate. The runner does
// not populate GITHUB_TOKEN automatically — workflows pass `with: token: …`.
/* v8 ignore next 3 */
if (process.env.INPUT_TOKEN && !process.env.GITHUB_TOKEN) {
	process.env.GITHUB_TOKEN = process.env.INPUT_TOKEN;
}

/* v8 ignore next */
Action.run(program, { layer: MainLive });
