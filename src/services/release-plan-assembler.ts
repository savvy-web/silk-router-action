import { Context, Effect, Layer, Schema } from "effect";
import type { ChangesetReadError, TargetResolutionError } from "../errors/errors.js";
import type { BumpTypeValue, ReleasePlanType } from "../schemas/release-plan.js";
import { ChangesetReader } from "./changeset-reader.js";
import { TagStrategyInput, TagStrategyResolver } from "./tag-strategy-resolver.js";
import { TargetResolver } from "./target-resolver.js";

export class WorkspacePackageInfo extends Schema.Class<WorkspacePackageInfo>("WorkspacePackageInfo")({
	name: Schema.String,
	version: Schema.String,
	path: Schema.String,
}) {}

export class ReleasePlanAssembler extends Context.Tag("silk-router/ReleasePlanAssembler")<
	ReleasePlanAssembler,
	{
		readonly assemble: (
			cwd: string,
			packages: ReadonlyArray<WorkspacePackageInfo>,
		) => Effect.Effect<ReleasePlanType, ChangesetReadError | TargetResolutionError>;
	}
>() {}

const BUMP_PRIORITY: Record<string, number> = { major: 3, minor: 2, patch: 1, none: 0 };

const highestBump = (types: ReadonlyArray<string>): BumpTypeValue => {
	let max = 0;
	let result: BumpTypeValue = "none";
	for (const t of types) {
		const p = BUMP_PRIORITY[t] ?? 0;
		if (p > max) {
			max = p;
			result = t as BumpTypeValue;
		}
	}
	return result;
};

export const ReleasePlanAssemblerLive = Layer.effect(
	ReleasePlanAssembler,
	Effect.gen(function* () {
		const changesetReader = yield* ChangesetReader;
		const targetResolver = yield* TargetResolver;
		const tagStrategyResolver = yield* TagStrategyResolver;

		return {
			assemble: (cwd, packages) =>
				Effect.gen(function* () {
					const changesets = yield* changesetReader.read(cwd);

					if (changesets.length === 0) {
						return { releases: [], tagStrategy: "single" as const, changesetCount: 0, bump: "none" as const };
					}

					const releaseMap = new Map<string, string>();
					for (const cs of changesets) {
						for (const release of cs.releases) {
							const existing = releaseMap.get(release.name);
							const existingPriority = BUMP_PRIORITY[existing ?? "none"] ?? 0;
							const newPriority = BUMP_PRIORITY[release.type] ?? 0;
							if (newPriority > existingPriority) {
								releaseMap.set(release.name, release.type);
							}
						}
					}

					const releases = yield* Effect.all(
						[...releaseMap.entries()].map(([name, bumpType]) =>
							Effect.gen(function* () {
								const pkg = packages.find((p) => p.name === name);
								const pkgPath = pkg?.path ?? ".";
								const registries = yield* targetResolver.resolve(name, pkgPath);
								return {
									workspace: name,
									path: pkgPath,
									type: bumpType as BumpTypeValue,
									oldVersion: pkg?.version ?? "0.0.0",
									newVersion: "",
									registries: [...registries],
								};
							}),
						),
					);

					const tagStrategy = yield* tagStrategyResolver.resolve(
						new TagStrategyInput({
							packageCount: packages.length,
							releaseCount: releases.length,
							workspacePackageNames: [...packages.map((p) => p.name)],
						}),
					);

					return {
						releases,
						tagStrategy,
						changesetCount: changesets.length,
						bump: highestBump([...releaseMap.values()]),
					};
				}),
		};
	}),
);
