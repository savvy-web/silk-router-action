import { Action, ActionLogger, ActionOutputs, GitHubApp } from "@savvy-web/github-action-effects";
import { Config, Effect, Redacted } from "effect";
import { AppLayer, PostLayer } from "./layers/app.js";
import { program } from "./program.js";
import { ReleasePlan } from "./schemas/release-plan.js";
import { Trigger } from "./schemas/trigger.js";

const main = Effect.gen(function* () {
	const appId = yield* Config.string("app-id");
	const appPrivateKey = yield* Config.redacted("private-key");
	const targetBranch = yield* Config.string("target-branch").pipe(Config.withDefault("main"));
	const releaseBranch = yield* Config.string("release-branch").pipe(Config.withDefault("changeset-release/main"));

	const ghApp = yield* GitHubApp;
	const outputs = yield* ActionOutputs;
	const logger = yield* ActionLogger;

	// withToken generates the token, runs the callback, then revokes the token
	// via Effect.acquireUseRelease -- no manual revocation needed in post step
	yield* ghApp.withToken(appId, Redacted.value(appPrivateKey), (token) =>
		Effect.gen(function* () {
			process.env.GITHUB_TOKEN = token;
			yield* Effect.log("GitHub App token generated");

			const cwd = process.env.GITHUB_WORKSPACE ?? process.cwd();

			const result = yield* logger.group(
				"Detect phase and compute release plan",
				program(targetBranch, releaseBranch, cwd).pipe(Effect.provide(AppLayer)),
			);

			yield* logger.group(
				"Set outputs",
				Effect.gen(function* () {
					yield* outputs.set("next-phase", result.phase);
					yield* outputs.set("reason", result.reason);
					yield* outputs.setJson("release-plan", result.releasePlan as typeof ReleasePlan.Type, ReleasePlan);
					yield* outputs.setJson("trigger", result.trigger as typeof Trigger.Type, Trigger);
					yield* Effect.log("Outputs set successfully");
				}),
			);

			yield* outputs.summary(result.summary);
			yield* Effect.log("Job summary written");
		}),
	);
});

/* v8 ignore next */
if (process.env.GITHUB_ACTIONS) Action.run(main, { layer: PostLayer });
