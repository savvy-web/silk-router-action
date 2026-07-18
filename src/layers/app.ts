import { NodeFileSystem } from "@effect/platform-node";
import { ActionEnvironmentLive, ActionOutputsLive, GitHubClientLive } from "@savvy-web/github-action-effects";
import { Layer } from "effect";
import { PhaseDetectorLive } from "../services/phase-detector.js";

/* v8 ignore start -- pure Layer wiring */

// GitHubClientLive.fromEnv() surfaces a GitHubClientError in its construction
// error channel (github-action-effects >= 3) — a missing/invalid GITHUB_TOKEN
// is a fatal misconfiguration, so promote it to a defect at the layer boundary.
// fromEnv builds its own Octokit transport, so it no longer depends on an
// effect HttpClient service.
const githubClient = GitHubClientLive.fromEnv().pipe(Layer.orDie);

export const MainLive = Layer.mergeAll(
	githubClient,
	// ActionOutputsLive writes $GITHUB_OUTPUT via the core FileSystem service;
	// satisfy it with the Node implementation here.
	ActionOutputsLive.pipe(Layer.provide(NodeFileSystem.layer)),
	ActionEnvironmentLive,
	NodeFileSystem.layer,
	PhaseDetectorLive.pipe(Layer.provide(Layer.mergeAll(ActionEnvironmentLive, githubClient, NodeFileSystem.layer))),
);

/* v8 ignore stop */
