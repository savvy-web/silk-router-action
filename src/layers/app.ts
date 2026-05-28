import { NodeFileSystem, NodeHttpClient } from "@effect/platform-node";
import { ActionEnvironmentLive, ActionOutputsLive, GitHubClientLive } from "@savvy-web/github-action-effects";
import { Layer } from "effect";
import { PhaseDetectorLive } from "../services/phase-detector.js";

/* v8 ignore start -- pure Layer wiring */

const githubClient = GitHubClientLive.fromEnv().pipe(Layer.provide(NodeHttpClient.layer));

export const MainLive = Layer.mergeAll(
	githubClient,
	ActionOutputsLive,
	ActionEnvironmentLive,
	NodeFileSystem.layer,
	NodeHttpClient.layer,
	PhaseDetectorLive.pipe(Layer.provide(Layer.mergeAll(ActionEnvironmentLive, githubClient))),
);

/* v8 ignore stop */
