import { Schema } from "effect";

export const Trigger = Schema.Struct({
	event: Schema.Literal("push", "pull_request"),
	branch: Schema.String,
	pr_number: Schema.Number.pipe(Schema.int()),
	is_merged: Schema.Boolean,
	sha: Schema.String.pipe(Schema.minLength(1)),
}).annotations({ identifier: "Trigger", title: "Trigger Context" });

export type TriggerType = typeof Trigger.Type;
