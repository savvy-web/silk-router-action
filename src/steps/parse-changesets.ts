import * as path from "node:path";
import { Effect, FileSystem, Schema } from "effect";
import type { BumpType, ChangesetRelease, ParsedChangeset } from "../schema/domain.js";

/**
 * A `.changeset/` directory could not be read or parsed.
 *
 * @remarks
 * The one error channel this action declares. Its reachability is a standing
 * verification obligation (U-15): Phase B must demonstrate it firing with a
 * test, or delete it from {@link parseChangesets}'s signature.
 *
 * @public
 */
export class ChangesetParseError extends Schema.TaggedErrorClass<ChangesetParseError>()("ChangesetParseError", {
	file: Schema.String.check(Schema.isMinLength(1)),
	reason: Schema.String.check(Schema.isMinLength(1)),
	cause: Schema.optional(Schema.Unknown),
}) {
	get message(): string {
		return `Failed to parse ${this.file}: ${this.reason}`;
	}
}

/**
 * What {@link parseChangesets} produces.
 *
 * @public
 */
export interface ParseChangesetsResult {
	readonly hasChangesets: boolean;
	readonly changesetCount: number;
	readonly changesets: ReadonlyArray<ParsedChangeset>;
	readonly releaseType: BumpType | null;
	readonly affectedPackages: ReadonlyArray<string>;
	readonly packageBumps: ReadonlyMap<string, BumpType>;
}

/**
 * Services {@link parseChangesets} requires.
 *
 * @remarks
 * **Declared wider than the faithful port strictly needs, deliberately.** The
 * legacy oracle reads the changeset directory with synchronous `node:fs` and so
 * requires nothing; ruling R2 moves it onto core `FileSystem`. Both strategies
 * are live candidates across the commit sequence, so the contract declares the
 * union now (`porting.md`: a channel that is too narrow becomes a breaking change
 * the moment real work needs the missing service; one that is too wide costs only
 * what it honestly costs). Declaring it here means the R2 commit does not reopen
 * this contract.
 *
 * @public
 */
export type ParseChangesetsRequirements = FileSystem.FileSystem;

/**
 * Options {@link parseChangesets} takes.
 *
 * @public
 */
export interface ParseChangesetsOptions {
	/** Defaults to `.changeset` relative to the workspace. */
	readonly changesetPath?: string | undefined;
}

/** The "nothing to release" result. @internal */
const emptyResult = (): ParseChangesetsResult => ({
	hasChangesets: false,
	changesetCount: 0,
	changesets: [],
	releaseType: null,
	affectedPackages: [],
	packageBumps: new Map(),
});

/**
 * Parse one changeset file's frontmatter into its package releases.
 *
 * @remarks
 * Returns `null` when the content carries no frontmatter block at all, which the
 * caller treats as "skip this file" rather than as an error — a stray `.md` in
 * `.changeset/` is not a broken release.
 *
 * @public
 */
export const parseChangesetFile = (content: string, id: string): ParsedChangeset | null => {
	// Normalize line endings before matching. The delimiter expression anchors on
	// `\n`, so a CRLF changeset would not match at all — and an unmatched file is
	// returned as `null`, which drops its releases silently rather than failing.
	// A Windows-authored or CRLF-normalized checkout would lose a real release.
	const normalized = content.replace(/\r\n?/g, "\n");
	const frontmatterMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!frontmatterMatch) return null;
	const [, frontmatter, summary] = frontmatterMatch;
	const releases: Array<ChangesetRelease> = [];
	for (const line of frontmatter.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const match = trimmed.match(/^["']?([^"']+)["']?\s*:\s*(major|minor|patch)\s*$/);
		if (match) {
			const [, name, bumpType] = match;
			releases.push({ name: name.trim(), type: bumpType as BumpType });
		}
	}
	return { id, summary: summary.trim(), releases };
};

/**
 * Order two bump types by release precedence.
 *
 * @remarks
 * Positive when `a` outranks `b`. `major` > `minor` > `patch`.
 *
 * @public
 */
export const compareBumpTypes = (a: BumpType, b: BumpType): number => {
	const order: Record<BumpType, number> = { major: 3, minor: 2, patch: 1 };
	return order[a] - order[b];
};

/**
 * The highest bump across every affected package, or `null` when there are none.
 *
 * @public
 */
export const getHighestBumpType = (packageBumps: ReadonlyMap<string, BumpType>): BumpType | null => {
	if (packageBumps.size === 0) return null;
	let highest: BumpType = "patch";
	for (const bumpType of packageBumps.values()) {
		if (compareBumpTypes(bumpType, highest) > 0) {
			highest = bumpType;
		}
	}
	return highest;
};

/**
 * Read and summarize the pending changesets.
 *
 * @remarks
 * **Failure posture: fail-the-job.** An unreadable `.changeset` directory means
 * the release decision would rest on incomplete information, so
 * {@link ChangesetParseError} propagates and the run goes red. A *missing*
 * directory is not a failure — it is the empty result.
 *
 * Reads through core's `FileSystem` rather than `node:fs`, which is what makes
 * {@link ParseChangesetsRequirements} load-bearing rather than decorative: the
 * requirement was forward-declared at contract time precisely so this move would
 * not reopen it, and it did not.
 *
 * @public
 */
export const parseChangesets = (
	options: ParseChangesetsOptions = {},
): Effect.Effect<ParseChangesetsResult, ChangesetParseError, ParseChangesetsRequirements> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const changesetPath = options.changesetPath ?? ".changeset";
		const absolutePath = path.isAbsolute(changesetPath) ? changesetPath : path.join(process.cwd(), changesetPath);

		const present = yield* fs.exists(absolutePath);
		if (!present) {
			return emptyResult();
		}

		const entries = yield* fs.readDirectory(absolutePath);
		const files = entries.filter((file) => file.endsWith(".md") && file.toLowerCase() !== "readme.md");
		if (files.length === 0) {
			return emptyResult();
		}

		const changesets: Array<ParsedChangeset> = [];
		const packageBumps = new Map<string, BumpType>();
		for (const file of files) {
			const content = yield* fs.readFileString(path.join(absolutePath, file));
			const parsed = parseChangesetFile(content, file.replace(/\.md$/, ""));
			if (parsed) {
				changesets.push(parsed);
				for (const release of parsed.releases) {
					const existing = packageBumps.get(release.name);
					if (!existing || compareBumpTypes(release.type, existing) > 0) {
						packageBumps.set(release.name, release.type);
					}
				}
			}
		}

		return {
			hasChangesets: true,
			changesetCount: files.length,
			changesets,
			releaseType: getHighestBumpType(packageBumps),
			affectedPackages: Array.from(packageBumps.keys()).sort(),
			packageBumps,
		};
	}).pipe(
		// Every `PlatformError` from the reads above becomes the step's one typed
		// error. The shape is unchanged from the pre-port `Effect.try`: an
		// unreadable directory fails the job, a missing one is the empty result.
		Effect.mapError(
			(cause) =>
				new ChangesetParseError({
					file: options.changesetPath ?? ".changeset",
					reason: cause instanceof Error ? cause.message : String(cause),
					cause,
				}),
		),
	);
