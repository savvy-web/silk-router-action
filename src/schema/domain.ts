import { Schema } from "effect";

/** The release-pipeline phase a workflow run belongs to. @public */
export const WorkflowPhase = Schema.Literals(["branch-management", "validation", "publishing", "close-issues", "none"]);
/** @public */
export type WorkflowPhase = typeof WorkflowPhase.Type;

/** A changeset bump type. @public */
export const BumpType = Schema.Literals(["major", "minor", "patch"]);
/** @public */
export type BumpType = typeof BumpType.Type;

/** One `package: bump` entry inside a changeset's frontmatter. @public */
export const ChangesetRelease = Schema.Struct({
	name: Schema.String,
	type: BumpType,
});
/** @public */
export type ChangesetRelease = typeof ChangesetRelease.Type;

/** A parsed `.changeset/*.md` file. @public */
export const ParsedChangeset = Schema.Struct({
	id: Schema.String,
	summary: Schema.String,
	releases: Schema.Array(ChangesetRelease),
});
/** @public */
export type ParsedChangeset = typeof ParsedChangeset.Type;

/**
 * The verdict of phase detection.
 *
 * @remarks
 * `mergedReleasePRNumber` is optional rather than nullable because it is absent
 * whenever no merged release PR was identified, which is the common case.
 *
 * @public
 */
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
/** @public */
export type PhaseDetectionResult = typeof PhaseDetectionResult.Type;
