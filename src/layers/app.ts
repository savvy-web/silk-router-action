import { GitHubClient, PullRequest, Repo } from "@effected/github";
import { Layer } from "effect";

/* v8 ignore start -- pure Layer wiring */

/**
 * The GitHub client, authenticated from the `token` action input.
 *
 * @remarks
 * Ruling R7. `layerFromConfig` reads through the ambient `ConfigProvider`, and
 * `ActionRuntime.layer` installs `ActionInput.layerDefault` — so the flat name
 * `token` resolves via the runner's `INPUT_TOKEN` derivation. That is what
 * retired the `process.env.INPUT_TOKEN → GITHUB_TOKEN` mutation the previous
 * `main.ts` performed before the runtime even started.
 *
 * It reads as `Config.redacted`, so the token is `Redacted` end to end — it was
 * a bare string in the previous implementation.
 *
 * `Layer.orDie` because construction fails with core's `ConfigError`: no token
 * configured is a misconfiguration, not a wire failure, and there is nothing a
 * running action can do about it.
 */
const client = GitHubClient.layerFromConfig({ name: "token" }).pipe(Layer.orDie);

/**
 * Everything the program needs beyond `ActionServices`.
 *
 * @remarks
 * Deliberately small. `ActionRuntime.layer` already provides the platform, an
 * HTTP client, `ActionEnvironment`, `ActionLogger`, `ActionOutputs` and
 * `ActionState`, so none of them appear here — a `NodeFileSystem.layer` in this
 * file would be over-provision, not wiring.
 *
 * `Repo` is a **value** service resolved per call by the resource methods that
 * need it (ruling R4); it is never folded into a client at construction time.
 *
 * @public
 */
export const AppLayer: Layer.Layer<GitHubClient | PullRequest | Repo> = Layer.mergeAll(
	client,
	Repo.layerFromConfig().pipe(Layer.orDie),
	PullRequest.layer.pipe(Layer.provide(client)),
);

/* v8 ignore stop */
