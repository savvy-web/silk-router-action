// src/errors/errors.ts
import { Schema } from "effect";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));

export class ChangesetParseError extends Schema.TaggedErrorClass<ChangesetParseError>()("ChangesetParseError", {
	file: NonEmptyString,
	reason: NonEmptyString,
	cause: Schema.optional(Schema.Unknown),
}) {
	get message(): string {
		return `Failed to parse ${this.file}: ${this.reason}`;
	}
}
