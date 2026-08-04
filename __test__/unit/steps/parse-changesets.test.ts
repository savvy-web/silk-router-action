import * as path from "node:path";
import { Effect, FileSystem } from "effect";
import { systemError } from "effect/PlatformError";
import { describe, expect, it } from "vitest";
import type { BumpType } from "../../../src/schema/domain.js";
import {
	ChangesetParseError,
	compareBumpTypes,
	getHighestBumpType,
	parseChangesetFile,
	parseChangesets,
} from "../../../src/steps/parse-changesets.js";
import { fsWith } from "../../utils/doubles.js";

/**
 * A stubbed filesystem, not a real one.
 *
 * @remarks
 * Per ruling R10 the three members this step calls are stubbed and **everything
 * else is left to `layerNoop`'s default**, which is the recorded false-green
 * hazard: a permissive stub answers a read it was never given, and the gap shows
 * up as a silent empty success rather than a failure. The last test in this file
 * exists to prove that does not happen here.
 *
 * Keyed by directory, so a case describes the tree it wants rather than creating
 * one on disk.
 */
const DIR = "/repo/.changeset";

const run = (files: Readonly<Record<string, string>>, changesetPath = DIR) =>
	Effect.runPromise(parseChangesets({ changesetPath }).pipe(Effect.provide(fsWith({ [DIR]: files }))));

describe("parseChangesetFile", () => {
	it("parses a single package release", () => {
		const parsed = parseChangesetFile('---\n"@scope/a": minor\n---\n\nAdds a thing\n', "brave-cats-sing");
		expect(parsed).toEqual({
			id: "brave-cats-sing",
			summary: "Adds a thing",
			releases: [{ name: "@scope/a", type: "minor" }],
		});
	});

	/**
	 * The failure this guards is silent, which is what makes it worth a test.
	 *
	 * @remarks
	 * The delimiter expression anchors on `\n`. A CRLF changeset did not match at
	 * all, and an unmatched file is returned as `null` — so the file's releases
	 * were dropped without an error, and `parseChangesets` could report
	 * `releaseType: null` for a branch that genuinely had a release queued.
	 *
	 * Byte-identical to the LF case above apart from the line endings, so a
	 * regression shows up as a difference in line-ending handling and nothing else.
	 */
	it("parses a CRLF changeset identically to an LF one", () => {
		const parsed = parseChangesetFile('---\r\n"@scope/a": minor\r\n---\r\n\r\nAdds a thing\r\n', "brave-cats-sing");
		expect(parsed).toEqual({
			id: "brave-cats-sing",
			summary: "Adds a thing",
			releases: [{ name: "@scope/a", type: "minor" }],
		});
	});

	it("parses a lone-CR changeset", () => {
		const parsed = parseChangesetFile('---\r"@scope/a": patch\r---\r\rClassic Mac endings\r', "id");
		expect(parsed?.releases).toEqual([{ name: "@scope/a", type: "patch" }]);
	});

	it("parses multiple package releases", () => {
		const parsed = parseChangesetFile('---\n"@scope/a": minor\n"@scope/b": patch\n---\n\nTwo packages\n', "id");
		expect(parsed?.releases).toEqual([
			{ name: "@scope/a", type: "minor" },
			{ name: "@scope/b", type: "patch" },
		]);
	});

	it("accepts single quotes, double quotes and bare package names", () => {
		const parsed = parseChangesetFile(
			"---\n'@scope/a': major\n\"@scope/b\": minor\n@scope/c: patch\n---\n\nMixed\n",
			"id",
		);
		expect(parsed?.releases).toEqual([
			{ name: "@scope/a", type: "major" },
			{ name: "@scope/b", type: "minor" },
			{ name: "@scope/c", type: "patch" },
		]);
	});

	it("returns null when there is no frontmatter", () => {
		expect(parseChangesetFile("Just prose, no frontmatter\n", "id")).toBeNull();
	});

	it("returns null for an unterminated frontmatter block", () => {
		expect(parseChangesetFile('---\n"@scope/a": minor\n', "id")).toBeNull();
	});

	it("keeps an empty summary as an empty string", () => {
		expect(parseChangesetFile('---\n"@scope/a": patch\n---\n', "id")?.summary).toBe("");
	});

	it("preserves a multiline summary", () => {
		const parsed = parseChangesetFile('---\n"@scope/a": patch\n---\n\nLine one\n\nLine two\n', "id");
		expect(parsed?.summary).toBe("Line one\n\nLine two");
	});

	it("ignores blank lines in frontmatter", () => {
		const parsed = parseChangesetFile('---\n\n"@scope/a": patch\n\n---\n\nSummary\n', "id");
		expect(parsed?.releases).toEqual([{ name: "@scope/a", type: "patch" }]);
	});

	it("ignores frontmatter lines that are not a package bump", () => {
		const parsed = parseChangesetFile('---\n"@scope/a": patch\nnot-a-bump: banana\n---\n\nS\n', "id");
		expect(parsed?.releases).toEqual([{ name: "@scope/a", type: "patch" }]);
	});
});

describe("compareBumpTypes", () => {
	it("orders major above minor above patch", () => {
		expect(compareBumpTypes("major", "minor")).toBeGreaterThan(0);
		expect(compareBumpTypes("minor", "patch")).toBeGreaterThan(0);
		expect(compareBumpTypes("major", "patch")).toBeGreaterThan(0);
	});

	it("is negative when the first ranks lower", () => {
		expect(compareBumpTypes("patch", "major")).toBeLessThan(0);
	});

	it("is zero for equal ranks", () => {
		expect(compareBumpTypes("minor", "minor")).toBe(0);
	});
});

describe("getHighestBumpType", () => {
	const map = (entries: ReadonlyArray<readonly [string, BumpType]>) => new Map<string, BumpType>(entries);

	it("returns null for an empty map", () => {
		expect(getHighestBumpType(map([]))).toBeNull();
	});

	it("returns the only bump when there is one", () => {
		expect(getHighestBumpType(map([["a", "minor"]]))).toBe("minor");
	});

	it("prefers major over everything", () => {
		expect(
			getHighestBumpType(
				map([
					["a", "patch"],
					["b", "major"],
					["c", "minor"],
				]),
			),
		).toBe("major");
	});

	it("prefers minor when no major is present", () => {
		expect(
			getHighestBumpType(
				map([
					["a", "patch"],
					["b", "minor"],
				]),
			),
		).toBe("minor");
	});

	it("returns patch when every bump is a patch", () => {
		expect(
			getHighestBumpType(
				map([
					["a", "patch"],
					["b", "patch"],
				]),
			),
		).toBe("patch");
	});
});

describe("parseChangesets", () => {
	it("returns the empty result when the directory does not exist", async () => {
		const result = await Effect.runPromise(
			parseChangesets({ changesetPath: "/repo/nowhere" }).pipe(Effect.provide(fsWith({ [DIR]: {} }))),
		);
		expect(result).toMatchObject({ hasChangesets: false, changesetCount: 0, releaseType: null });
	});

	it("returns the empty result when the directory holds no markdown", async () => {
		const result = await run({ "config.json": "{}" });
		expect(result.hasChangesets).toBe(false);
		expect(result.changesetCount).toBe(0);
	});

	it("excludes README.md from the count, case-insensitively", async () => {
		const result = await run({
			"README.md": "# Changesets",
			"readme.md": "# lower",
			"brave-cats.md": '---\n"@scope/a": patch\n---\n\nS\n',
		});
		expect(result.changesetCount).toBe(1);
	});

	it("aggregates packages and reports the highest bump", async () => {
		const result = await run({
			"one.md": '---\n"@scope/a": patch\n---\n\nOne\n',
			"two.md": '---\n"@scope/a": major\n"@scope/b": minor\n---\n\nTwo\n',
		});

		expect(result.hasChangesets).toBe(true);
		expect(result.changesetCount).toBe(2);
		expect(result.releaseType).toBe("major");
		// The highest bump per package wins, not the last one read.
		expect(result.packageBumps.get("@scope/a")).toBe("major");
		expect(result.packageBumps.get("@scope/b")).toBe("minor");
	});

	it("does not downgrade a package's bump when a later file asks for less", async () => {
		const result = await run({
			"a-major.md": '---\n"@scope/a": major\n---\n\nBig\n',
			"z-patch.md": '---\n"@scope/a": patch\n---\n\nSmall\n',
		});
		expect(result.packageBumps.get("@scope/a")).toBe("major");
		expect(result.releaseType).toBe("major");
	});

	it("sorts affected packages", async () => {
		const result = await run({ "one.md": '---\n"@scope/z": patch\n"@scope/a": patch\n---\n\nS\n' });
		expect(result.affectedPackages).toEqual(["@scope/a", "@scope/z"]);
	});

	it("counts a file with no frontmatter but does not let it affect packages", async () => {
		const result = await run({
			"good.md": '---\n"@scope/a": patch\n---\n\nS\n',
			"stray.md": "Just prose\n",
		});

		// Faithful to the pre-port behavior: the count is of markdown files, while
		// only parseable ones contribute releases.
		expect(result.changesetCount).toBe(2);
		expect(result.changesets).toHaveLength(1);
		expect(result.affectedPackages).toEqual(["@scope/a"]);
	});

	it("accepts an absolute path", async () => {
		expect(path.isAbsolute(DIR)).toBe(true);
		const result = await run({ "one.md": '---\n"@scope/a": minor\n---\n\nS\n' });
		expect(result.releaseType).toBe("minor");
	});

	it("resolves a relative path against the working directory", async () => {
		// `.changeset` resolves against cwd; the stub answers for that absolute
		// path, so this asserts the resolution rather than the filesystem.
		const resolved = path.join(process.cwd(), ".changeset");
		const result = await Effect.runPromise(
			parseChangesets().pipe(
				Effect.provide(fsWith({ [resolved]: { "one.md": '---\n"@scope/a": patch\n---\n\nS\n' } })),
			),
		);
		expect(result.changesetCount).toBe(1);
	});

	/**
	 * The error channel, actually fired.
	 *
	 * @remarks
	 * Discharges the standing obligation that every declared error reason has a
	 * test that constructs it. A channel that cannot fire is a documented lie.
	 *
	 * The reachable production shapes are an unreadable directory (`EACCES` in a
	 * restricted CI container) and a file vanishing between the listing and the
	 * read; both surface here as a failing `readDirectory`.
	 */
	it("fails with ChangesetParseError when the directory cannot be read", async () => {
		const unreadable = FileSystem.layerNoop({
			exists: () => Effect.succeed(true),
			readDirectory: (p: string) =>
				Effect.fail(
					systemError({
						_tag: "PermissionDenied",
						module: "FileSystem",
						method: "readDirectory",
						pathOrDescriptor: p,
					}),
				),
		});

		const error = await Effect.runPromise(
			Effect.flip(parseChangesets({ changesetPath: DIR }).pipe(Effect.provide(unreadable))),
		);

		expect(error).toBeInstanceOf(ChangesetParseError);
		expect(error.file).toBe(DIR);
		expect(error.message).toContain("Failed to parse");
		expect(error.cause).toBeDefined();
	});

	/**
	 * The R10 guard, demonstrated for this suite's own stub.
	 *
	 * @remarks
	 * `layerNoop` fills every member a caller did not supply, and a permissive
	 * fill turns a read the test never arranged into a silent empty success. Here
	 * the directory listing names a file the tree does not contain, so the read
	 * must **fail** rather than yield `""` — which would parse as "no frontmatter"
	 * and quietly drop the changeset.
	 */
	it("fails rather than inventing content for a file the stub never arranged", async () => {
		const lying = FileSystem.layerNoop({
			exists: () => Effect.succeed(true),
			// Names a file that `readFileString` below knows nothing about.
			readDirectory: () => Effect.succeed(["phantom.md"]),
			readFileString: (p: string) =>
				Effect.fail(
					systemError({ _tag: "NotFound", module: "FileSystem", method: "readFileString", pathOrDescriptor: p }),
				),
		});

		const error = await Effect.runPromise(
			Effect.flip(parseChangesets({ changesetPath: DIR }).pipe(Effect.provide(lying))),
		);
		expect(error).toBeInstanceOf(ChangesetParseError);
	});
});

describe("ChangesetParseError", () => {
	it("renders a message naming the file and the reason", () => {
		const error = new ChangesetParseError({ file: ".changeset", reason: "ENOTDIR" });
		expect(error.message).toBe("Failed to parse .changeset: ENOTDIR");
	});

	it("carries its tag", () => {
		expect(new ChangesetParseError({ file: "a", reason: "b" })._tag).toBe("ChangesetParseError");
	});

	it("retains the underlying cause when given one", () => {
		const cause = new Error("boom");
		expect(new ChangesetParseError({ file: "a", reason: "b", cause }).cause).toBe(cause);
	});
});
