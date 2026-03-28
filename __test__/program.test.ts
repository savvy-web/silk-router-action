import { Effect, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";
import { program } from "../src/program.js";
import type { RegistryTargetType } from "../src/schemas/registry.js";
import type { TriggerType } from "../src/schemas/trigger.js";
import { ChangesetReaderTest, SimpleChangeset, SimpleConfig } from "../src/services/changeset-reader.js";
import { GitHubEventContextTest } from "../src/services/github-event-context.js";
import { PhaseResolver } from "../src/services/phase-resolver.js";
import { PullRequestDetectorTest } from "../src/services/pull-request-detector.js";
import { ReleasePlanAssemblerLive } from "../src/services/release-plan-assembler.js";
import { SummaryWriterTest } from "../src/services/summary-writer.js";
import { TagStrategyResolver } from "../src/services/tag-strategy-resolver.js";
import { TargetResolverTest } from "../src/services/target-resolver.js";
import { silentLoggerLayer } from "./utils/test-logger.js";

const npmTarget = (name: string): RegistryTargetType => ({
	as: name,
	source: ".",
	registry: {
		id: "npm",
		name: "npm",
		protocol: "npm",
		params: { registry: "https://registry.npmjs.org", provenance: true },
		artifacts: [],
	},
});

const makeTestLayer = (opts: {
	trigger: TriggerType;
	isReleaseCommit?: boolean;
	changesets?: SimpleChangeset[];
	targets?: Record<string, ReadonlyArray<RegistryTargetType>>;
}) => {
	const assemblerLayer = ReleasePlanAssemblerLive.pipe(
		Layer.provide(
			Layer.mergeAll(
				ChangesetReaderTest.layer({
					changesets: opts.changesets ?? [],
					config: opts.changesets?.length
						? Option.some(new SimpleConfig({ changelog: false, commit: false, access: "restricted" }))
						: Option.none(),
				}),
				TargetResolverTest.layer(opts.targets ?? {}),
				TagStrategyResolver.Live,
			),
		),
	);

	return Layer.mergeAll(
		GitHubEventContextTest.layer(opts.trigger),
		PullRequestDetectorTest.layer({ isReleaseCommit: opts.isReleaseCommit ?? false }),
		assemblerLayer,
		PhaseResolver.Live,
		SummaryWriterTest.captureLayer(),
		silentLoggerLayer,
	);
};

describe("program", () => {
	it("routes push to main with changesets to silk-branch", async () => {
		const layer = makeTestLayer({
			trigger: { event: "push", branch: "main", pr_number: 0, is_merged: false, sha: "abc123" },
			changesets: [
				new SimpleChangeset({ id: "happy-dogs", summary: "Add feature", releases: [{ name: "pkg", type: "minor" }] }),
			],
			targets: { pkg: [npmTarget("pkg")] },
		});
		const result = await Effect.runPromise(
			program("main", "changeset-release/main", "/fake/path").pipe(Effect.provide(layer)),
		);
		expect(result.phase).toBe("silk-branch");
		expect((result.releasePlan as { changesetCount: number }).changesetCount).toBe(1);
	});

	it("routes release PR merge to close-issues", async () => {
		const layer = makeTestLayer({
			trigger: {
				event: "pull_request",
				branch: "changeset-release/main",
				pr_number: 42,
				is_merged: true,
				sha: "def456",
			},
		});
		const result = await Effect.runPromise(
			program("main", "changeset-release/main", "/fake/path").pipe(Effect.provide(layer)),
		);
		expect(result.phase).toBe("close-issues");
	});

	it("routes push to main with release commit to silk-publish", async () => {
		const layer = makeTestLayer({
			trigger: { event: "push", branch: "main", pr_number: 0, is_merged: false, sha: "abc123" },
			isReleaseCommit: true,
			changesets: [new SimpleChangeset({ id: "cs-1", summary: "Fix", releases: [{ name: "pkg", type: "patch" }] })],
			targets: { pkg: [npmTarget("pkg")] },
		});
		const result = await Effect.runPromise(
			program("main", "changeset-release/main", "/fake/path").pipe(Effect.provide(layer)),
		);
		expect(result.phase).toBe("silk-publish");
	});

	it("routes unrelated push to skip", async () => {
		const layer = makeTestLayer({
			trigger: { event: "push", branch: "feature/foo", pr_number: 0, is_merged: false, sha: "xyz789" },
		});
		const result = await Effect.runPromise(
			program("main", "changeset-release/main", "/fake/path").pipe(Effect.provide(layer)),
		);
		expect(result.phase).toBe("skip");
	});

	it("routes push to release branch to silk-validate", async () => {
		const layer = makeTestLayer({
			trigger: { event: "push", branch: "changeset-release/main", pr_number: 0, is_merged: false, sha: "abc123" },
			changesets: [new SimpleChangeset({ id: "cs-1", summary: "Fix", releases: [{ name: "pkg", type: "patch" }] })],
		});
		const result = await Effect.runPromise(
			program("main", "changeset-release/main", "/fake/path").pipe(Effect.provide(layer)),
		);
		expect(result.phase).toBe("silk-validate");
	});

	it("includes summary in result", async () => {
		const layer = makeTestLayer({
			trigger: { event: "push", branch: "main", pr_number: 0, is_merged: false, sha: "abc123" },
			changesets: [new SimpleChangeset({ id: "cs-1", summary: "Feature", releases: [{ name: "pkg", type: "minor" }] })],
			targets: { pkg: [npmTarget("pkg")] },
		});
		const result = await Effect.runPromise(
			program("main", "changeset-release/main", "/fake/path").pipe(Effect.provide(layer)),
		);
		expect(result.summary).toContain("silk-branch");
		expect(result.summary).toContain("pkg");
	});
});
