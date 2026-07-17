// src/schemas/domain.ts
import { Schema } from "effect";

export const WorkflowPhase = Schema.Literals(["branch-management", "validation", "publishing", "close-issues", "none"]);
export type WorkflowPhase = typeof WorkflowPhase.Type;

export const BumpType = Schema.Literals(["major", "minor", "patch"]);
export type BumpType = typeof BumpType.Type;

export const ChangesetRelease = Schema.Struct({
	name: Schema.String,
	type: BumpType,
});
export type ChangesetRelease = typeof ChangesetRelease.Type;

export const ParsedChangeset = Schema.Struct({
	id: Schema.String,
	summary: Schema.String,
	releases: Schema.Array(ChangesetRelease),
});
export type ParsedChangeset = typeof ParsedChangeset.Type;

export const PhaseDetectionResult = Schema.Struct({
	phase: WorkflowPhase,
	reason: Schema.String,
	isReleaseBranch: Schema.Boolean,
	isMainBranch: Schema.Boolean,
	isReleaseCommit: Schema.Boolean,
	mergedReleasePRNumber: Schema.optional(Schema.Number),
	isPullRequestEvent: Schema.Boolean,
	isPRMerged: Schema.Boolean,
	isReleasePRMerged: Schema.Boolean,
	commitMessage: Schema.String,
});
export type PhaseDetectionResult = typeof PhaseDetectionResult.Type;
