// src/errors/errors.ts
import { Schema } from "effect";

const NonEmptyString = Schema.String.pipe(Schema.minLength(1));

export class PhaseDetectionError extends Schema.TaggedError<PhaseDetectionError>()("PhaseDetectionError", {
	operation: Schema.Literal("query-pr", "parse-commit", "detect-merge"),
	reason: NonEmptyString,
	cause: Schema.optional(Schema.Unknown),
}) {
	get message(): string {
		return `Phase detection failed (${this.operation}): ${this.reason}`;
	}
}

export class ChangesetParseError extends Schema.TaggedError<ChangesetParseError>()("ChangesetParseError", {
	file: NonEmptyString,
	reason: NonEmptyString,
	cause: Schema.optional(Schema.Unknown),
}) {
	get message(): string {
		return `Failed to parse ${this.file}: ${this.reason}`;
	}
}

export class SummaryWriteError extends Schema.TaggedError<SummaryWriteError>()("SummaryWriteError", {
	reason: NonEmptyString,
	cause: Schema.optional(Schema.Unknown),
}) {
	get message(): string {
		return `Failed to write job summary: ${this.reason}`;
	}
}

export type ActionError = PhaseDetectionError | ChangesetParseError | SummaryWriteError;
