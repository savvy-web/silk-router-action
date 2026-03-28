import { Schema } from "effect";

const NonEmptyString = Schema.String.pipe(Schema.minLength(1, { message: () => "Value must not be empty" }));

export class PhaseDetectionError extends Schema.TaggedError<PhaseDetectionError>()("PhaseDetectionError", {
	reason: NonEmptyString,
	sha: Schema.String,
}) {
	get message(): string {
		return `Phase detection failed for ${this.sha}: ${this.reason}`;
	}
}

export class ChangesetReadError extends Schema.TaggedError<ChangesetReadError>()("ChangesetReadError", {
	reason: NonEmptyString,
}) {
	get message(): string {
		return `Changeset read error: ${this.reason}`;
	}
}

export class ChangesetConfigError extends Schema.TaggedError<ChangesetConfigError>()("ChangesetConfigError", {
	reason: NonEmptyString,
}) {
	get message(): string {
		return `Changeset config error: ${this.reason}`;
	}
}

export class ReleasePlanError extends Schema.TaggedError<ReleasePlanError>()("ReleasePlanError", {
	reason: NonEmptyString,
}) {
	get message(): string {
		return `Release plan error: ${this.reason}`;
	}
}

export class TargetResolutionError extends Schema.TaggedError<TargetResolutionError>()("TargetResolutionError", {
	packageName: NonEmptyString,
	reason: NonEmptyString,
}) {
	get message(): string {
		return `Target resolution error for ${this.packageName}: ${this.reason}`;
	}
}

export class TriggerContextError extends Schema.TaggedError<TriggerContextError>()("TriggerContextError", {
	reason: NonEmptyString,
}) {
	get message(): string {
		return `Trigger context error: ${this.reason}`;
	}
}

export type SilkRouterError =
	| PhaseDetectionError
	| ChangesetReadError
	| ChangesetConfigError
	| ReleasePlanError
	| TargetResolutionError
	| TriggerContextError;
