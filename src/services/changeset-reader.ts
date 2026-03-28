import type { NewChangeset as ChangesetNewChangeset } from "@changesets/types";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { ChangesetConfigError, ChangesetReadError } from "../errors/errors.js";

export class SimpleChangeset extends Schema.Class<SimpleChangeset>("SimpleChangeset")({
	id: Schema.String,
	summary: Schema.String,
	releases: Schema.Array(
		Schema.Struct({
			name: Schema.String,
			type: Schema.String,
		}),
	),
}) {}

export class SimpleConfig extends Schema.Class<SimpleConfig>("SimpleConfig")({
	changelog: Schema.Unknown,
	commit: Schema.Unknown,
	access: Schema.String,
}) {}

export class ChangesetReader extends Context.Tag("silk-router/ChangesetReader")<
	ChangesetReader,
	{
		readonly read: (cwd: string) => Effect.Effect<ReadonlyArray<SimpleChangeset>, ChangesetReadError>;
		readonly config: (cwd: string) => Effect.Effect<Option.Option<SimpleConfig>, ChangesetConfigError>;
	}
>() {}

export const ChangesetReaderLive = Layer.succeed(ChangesetReader, {
	read: (cwd) =>
		Effect.tryPromise({
			try: async () => {
				const fs = await import("node:fs");
				const path = await import("node:path");
				const changesetDir = path.join(cwd, ".changeset");

				if (!fs.existsSync(changesetDir)) {
					return [];
				}

				const readChangesets = (await import("@changesets/read")).default;
				const changesets: ChangesetNewChangeset[] = await readChangesets(cwd);
				return changesets.map(
					(cs) =>
						new SimpleChangeset({
							id: cs.id,
							summary: cs.summary,
							releases: cs.releases.map((r) => ({ name: r.name, type: r.type })),
						}),
				);
			},
			catch: (error) => new ChangesetReadError({ reason: `Failed to read changesets: ${String(error)}` }),
		}),

	config: (cwd) =>
		Effect.tryPromise({
			try: async () => {
				const fs = await import("node:fs");
				const path = await import("node:path");
				const configPath = path.join(cwd, ".changeset", "config.json");

				if (!fs.existsSync(configPath)) {
					return Option.none<SimpleConfig>();
				}

				const { read: readConfig } = await import("@changesets/config");
				const config = await readConfig(cwd);
				return Option.some(
					new SimpleConfig({
						changelog: config.changelog,
						commit: config.commit,
						access: config.access,
					}),
				);
			},
			catch: (error) => new ChangesetConfigError({ reason: `Failed to read changeset config: ${String(error)}` }),
		}),
});

export const ChangesetReaderTest = {
	layer: (data: { changesets: ReadonlyArray<SimpleChangeset>; config: Option.Option<SimpleConfig> }) =>
		Layer.succeed(ChangesetReader, {
			read: () => Effect.succeed(data.changesets),
			config: () => Effect.succeed(data.config),
		}),
};
