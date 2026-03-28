import { Schema } from "effect";
import { RegistryTarget } from "./registry.js";

export const BumpType = Schema.Literal("major", "minor", "patch", "none").annotations({ identifier: "BumpType" });

export type BumpTypeValue = typeof BumpType.Type;

export const TagStrategy = Schema.Literal("single", "scoped").annotations({ identifier: "TagStrategy" });

export type TagStrategyType = typeof TagStrategy.Type;

export const ReleaseEntry = Schema.Struct({
	workspace: Schema.String.pipe(Schema.minLength(1)),
	path: Schema.String,
	type: BumpType,
	oldVersion: Schema.String,
	newVersion: Schema.String,
	registries: Schema.Array(RegistryTarget),
}).annotations({ identifier: "ReleaseEntry" });

export type ReleaseEntryType = typeof ReleaseEntry.Type;

export const ReleasePlan = Schema.Struct({
	releases: Schema.Array(ReleaseEntry),
	tagStrategy: TagStrategy,
	changesetCount: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
	bump: BumpType,
}).annotations({ identifier: "ReleasePlan" });

export type ReleasePlanType = typeof ReleasePlan.Type;
