import { Context, Effect, Layer, Schema } from "effect";
import type { TagStrategyType } from "../schemas/release-plan.js";

export class TagStrategyInput extends Schema.Class<TagStrategyInput>("TagStrategyInput")({
	packageCount: Schema.Number.pipe(Schema.int()),
	releaseCount: Schema.Number.pipe(Schema.int()),
	workspacePackageNames: Schema.Array(Schema.String),
}) {}

export class TagStrategyResolver extends Context.Tag("silk-router/TagStrategyResolver")<
	TagStrategyResolver,
	{
		readonly resolve: (input: TagStrategyInput) => Effect.Effect<TagStrategyType>;
	}
>() {
	static readonly Live: Layer.Layer<TagStrategyResolver> = Layer.succeed(TagStrategyResolver, {
		resolve: (input) => Effect.succeed(resolveTagStrategy(input)),
	});
}

const resolveTagStrategy = (input: TagStrategyInput): TagStrategyType => {
	if (input.packageCount <= 1) return "single";
	if (input.releaseCount <= 1) return "single";
	return "scoped";
};
