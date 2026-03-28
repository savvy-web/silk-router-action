import { ActionEnvironment } from "@savvy-web/github-action-effects";
import { Context, Effect, Layer } from "effect";
import { TriggerContextError } from "../errors/errors.js";
import type { TriggerType } from "../schemas/trigger.js";

export class GitHubEventContext extends Context.Tag("silk-router/GitHubEventContext")<
	GitHubEventContext,
	{
		readonly trigger: Effect.Effect<TriggerType, TriggerContextError>;
	}
>() {}

export const GitHubEventContextLive = Layer.effect(
	GitHubEventContext,
	Effect.gen(function* () {
		const env = yield* ActionEnvironment;
		return {
			trigger: Effect.gen(function* () {
				const github = yield* env.github.pipe(
					Effect.mapError((e) => new TriggerContextError({ reason: `Environment error: ${e.reason}` })),
				);
				const eventName = github.eventName;

				if (eventName === "push") {
					const branch = github.ref.replace("refs/heads/", "");
					return {
						event: "push" as const,
						branch,
						pr_number: 0,
						is_merged: false,
						sha: github.sha,
					};
				}

				if (eventName === "pull_request") {
					const eventPath = github.eventPath;
					const payload = yield* Effect.tryPromise({
						try: async () => {
							const fs = await import("node:fs/promises");
							const raw = await fs.readFile(eventPath, "utf-8");
							return JSON.parse(raw) as {
								pull_request?: {
									number?: number;
									merged?: boolean;
									head?: { ref?: string };
								};
							};
						},
						catch: (error) => new TriggerContextError({ reason: `Failed to read event payload: ${String(error)}` }),
					});

					const pr = payload.pull_request;
					return {
						event: "pull_request" as const,
						branch: pr?.head?.ref ?? "",
						pr_number: pr?.number ?? 0,
						is_merged: pr?.merged ?? false,
						sha: github.sha,
					};
				}

				return yield* Effect.fail(new TriggerContextError({ reason: `Unsupported event type: ${eventName}` }));
			}),
		};
	}),
);

export const GitHubEventContextTest = {
	layer: (trigger: TriggerType) =>
		Layer.succeed(GitHubEventContext, {
			trigger: Effect.succeed(trigger),
		}),
};
