import * as fs from "node:fs";
import * as path from "node:path";
import { Effect } from "effect";
import { ChangesetParseError } from "../errors/errors.js";
import type { BumpType, ChangesetRelease, ParsedChangeset } from "../schemas/domain.js";

export type { BumpType, ChangesetRelease, ParsedChangeset } from "../schemas/domain.js";

export interface ParseChangesetsResult {
	readonly hasChangesets: boolean;
	readonly changesetCount: number;
	readonly changesets: ReadonlyArray<ParsedChangeset>;
	readonly releaseType: BumpType | null;
	readonly affectedPackages: ReadonlyArray<string>;
	readonly packageBumps: ReadonlyMap<string, BumpType>;
}

export interface ParseChangesetsOptions {
	readonly changesetPath?: string;
}

const emptyResult = (): ParseChangesetsResult => ({
	hasChangesets: false,
	changesetCount: 0,
	changesets: [],
	releaseType: null,
	affectedPackages: [],
	packageBumps: new Map(),
});

export const parseChangesets = (
	options: ParseChangesetsOptions = {},
): Effect.Effect<ParseChangesetsResult, ChangesetParseError> =>
	Effect.try({
		try: () => {
			const changesetPath = options.changesetPath ?? ".changeset";
			const absolutePath = path.isAbsolute(changesetPath) ? changesetPath : path.join(process.cwd(), changesetPath);
			if (!fs.existsSync(absolutePath)) {
				return emptyResult();
			}
			const files = fs.readdirSync(absolutePath).filter((file) => {
				return file.endsWith(".md") && file.toLowerCase() !== "readme.md";
			});
			if (files.length === 0) {
				return emptyResult();
			}
			const changesets: ParsedChangeset[] = [];
			const packageBumps = new Map<string, BumpType>();
			for (const file of files) {
				const filePath = path.join(absolutePath, file);
				const content = fs.readFileSync(filePath, "utf8");
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
		},
		catch: (cause) =>
			new ChangesetParseError({
				file: options.changesetPath ?? ".changeset",
				reason: cause instanceof Error ? cause.message : String(cause),
				cause,
			}),
	});

export const parseChangesetFile = (content: string, id: string): ParsedChangeset | null => {
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!frontmatterMatch) return null;
	const [, frontmatter, summary] = frontmatterMatch;
	const releases: ChangesetRelease[] = [];
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

export const compareBumpTypes = (a: BumpType, b: BumpType): number => {
	const order: Record<BumpType, number> = { major: 3, minor: 2, patch: 1 };
	return order[a] - order[b];
};

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

export const hasChangesets = (changesetPath = ".changeset"): boolean => {
	const absolutePath = path.isAbsolute(changesetPath) ? changesetPath : path.join(process.cwd(), changesetPath);
	if (!fs.existsSync(absolutePath)) return false;
	return fs.readdirSync(absolutePath).some((file) => file.endsWith(".md") && file.toLowerCase() !== "readme.md");
};

export const countChangesets = (changesetPath = ".changeset"): number => {
	const absolutePath = path.isAbsolute(changesetPath) ? changesetPath : path.join(process.cwd(), changesetPath);
	if (!fs.existsSync(absolutePath)) return 0;
	return fs.readdirSync(absolutePath).filter((file) => file.endsWith(".md") && file.toLowerCase() !== "readme.md")
		.length;
};
