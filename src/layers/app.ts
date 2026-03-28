import { GitHubAppLive, GitHubClientLive, OctokitAuthAppLive } from "@savvy-web/github-action-effects";
import { Layer } from "effect";
import { ChangesetReaderLive } from "../services/changeset-reader.js";
import { GitHubEventContextLive } from "../services/github-event-context.js";
import { PhaseResolver } from "../services/phase-resolver.js";
import { PullRequestDetectorLive } from "../services/pull-request-detector.js";
import { ReleasePlanAssemblerLive } from "../services/release-plan-assembler.js";
import { SummaryWriterLive } from "../services/summary-writer.js";
import { TagStrategyResolver } from "../services/tag-strategy-resolver.js";
import { TargetResolverLive } from "../services/target-resolver.js";

/* v8 ignore start */

const prDetector = PullRequestDetectorLive.pipe(Layer.provide(GitHubClientLive));

const planAssembler = ReleasePlanAssemblerLive.pipe(
	Layer.provide(Layer.mergeAll(ChangesetReaderLive, TargetResolverLive, TagStrategyResolver.Live)),
);

const libraryLayers = Layer.mergeAll(GitHubClientLive, GitHubAppLive.pipe(Layer.provide(OctokitAuthAppLive)));

const domainLayers = Layer.mergeAll(
	GitHubEventContextLive,
	prDetector,
	planAssembler,
	PhaseResolver.Live,
	SummaryWriterLive,
);

export const AppLayer = Layer.provideMerge(domainLayers, libraryLayers);

export const PostLayer = GitHubAppLive.pipe(Layer.provide(OctokitAuthAppLive));

/* v8 ignore stop */
