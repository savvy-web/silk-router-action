import { NodeFileSystem, NodeHttpClient } from "@effect/platform-node";
import { ActionEnvironmentLive, ActionOutputsLive, GitHubClientLive } from "@savvy-web/github-action-effects";
import { Layer } from "effect";
import { PhaseDetectorLive } from "../services/phase-detector.js";

/* v8 ignore start -- pure Layer wiring */

// GitHubClientLive.fromEnv() surfaces a GitHubClientError in its construction
// error channel (github-action-effects >= 2.1) — a missing/invalid GITHUB_TOKEN
// is a fatal misconfiguration, so promote it to a defect at the layer boundary.
const githubClient = GitHubClientLive.fromEnv().pipe(Layer.provide(NodeHttpClient.layer), Layer.orDie);

export const MainLive = Layer.mergeAll(
	githubClient,
	// ActionOutputsLive writes $GITHUB_OUTPUT via the platform FileSystem service
	// (github-action-effects >= 2.1); satisfy it with the Node implementation here.
	ActionOutputsLive.pipe(Layer.provide(NodeFileSystem.layer)),
	ActionEnvironmentLive,
	NodeFileSystem.layer,
	NodeHttpClient.layer,
	PhaseDetectorLive.pipe(Layer.provide(Layer.mergeAll(ActionEnvironmentLive, githubClient, NodeFileSystem.layer))),
);

/* v8 ignore stop */
