import { describe, expect, it } from "vitest";
import { renderJobSummary } from "../../src/format.js";
import type { PhaseDetectionResult } from "../../src/schema/domain.js";
import type { ParseChangesetsResult } from "../../src/steps/parse-changesets.js";

const inputs = { releaseBranch: "changeset-release/main", targetBranch: "main", releasePrefix: "release:" };

const phase = (overrides: Partial<PhaseDetectionResult> = {}): PhaseDetectionResult => ({
	phase: "branch-management",
	reason: "Push to main (not a release commit)",
	isReleaseBranch: false,
	isMainBranch: true,
	isReleaseCommit: false,
	isPullRequestEvent: false,
	isPRMerged: false,
	isReleasePRMerged: false,
	commitMessage: "feat: a thing",
	...overrides,
});

const changesets = (overrides: Partial<ParseChangesetsResult> = {}): ParseChangesetsResult => ({
	hasChangesets: false,
	changesetCount: 0,
	changesets: [],
	releaseType: null,
	affectedPackages: [],
	packageBumps: new Map(),
	...overrides,
});

/**
 * The claims the changeset actually makes about rendering.
 *
 * @remarks
 * Added after a near-miss: a variant of `format.ts` that hand-joined strings
 * instead of using `GitHubMarkdown` — producing output with no table separator
 * rows and no escaping at all — passed the whole suite below, because every
 * assertion was a `toContain` on a substring that survives losing the table
 * structure entirely.
 *
 * The changeset tells consumers that table cells are escaped correctly and that
 * this deleted a live defect. **These are the tests that make that claim true**;
 * without them it is marketing.
 */
describe("renderJobSummary — GFM structure", () => {
	const render = () => renderJobSummary({ phase: phase(), changesets: changesets(), inputs });

	it("emits a real GFM table, header separator included", () => {
		const lines = render().split("\n");
		expect(lines).toContain("| Property | Value |");
		// The separator row is what makes it a table rather than three lines of
		// text that happen to contain pipes.
		expect(lines.some((l) => /^\|\s*---/.test(l))).toBe(true);
	});

	it("emits one separator row per table", () => {
		const separators = render()
			.split("\n")
			.filter((l) => /^\|\s*---/.test(l));
		expect(separators).toHaveLength(3);
	});

	it("escapes a pipe inside a cell so it cannot break the table", () => {
		// `reason` interpolates branch names and PR titles, so a pipe is reachable
		// from user data. Unescaped, it silently adds a column and corrupts the row.
		const md = renderJobSummary({
			phase: phase({ reason: "Merged release PR #7 | urgent" }),
			changesets: changesets(),
			inputs,
		});
		expect(md).toContain("\\|");
		expect(md).not.toContain("PR #7 | urgent");
	});

	it("escapes a pipe arriving from a branch name, even inside inline code", () => {
		const md = renderJobSummary({
			phase: phase(),
			changesets: changesets(),
			inputs: { ...inputs, targetBranch: "weird|branch" },
		});
		const row = md.split("\n").find((l) => l.startsWith("| Target Branch |"));
		expect(row).toBeDefined();
		// Every pipe between the delimiters must be escaped. Counting `split("|")`
		// segments would not show this — `\|` still contains the character — so
		// assert on the escape itself.
		expect(row).toContain("`weird\\|branch`");
		expect(row).not.toMatch(/[^\\]\|branch/);
	});
});

describe("renderJobSummary", () => {
	it("renders the phase, its description and the reason", () => {
		const md = renderJobSummary({ phase: phase(), changesets: changesets(), inputs });
		expect(md).toContain("Workflow Control");
		expect(md).toContain("`branch-management`");
		expect(md).toContain("Create or update the release branch with changesets");
		expect(md).toContain("Push to main (not a release commit)");
	});

	it("renders the branch inputs it was given, not hardcoded names", () => {
		const md = renderJobSummary({
			phase: phase(),
			changesets: changesets(),
			inputs: { ...inputs, targetBranch: "trunk", releaseBranch: "release/next" },
		});
		expect(md).toContain("`trunk`");
		expect(md).toContain("`release/next`");
	});

	it("omits the merged-PR row when there is no merged PR", () => {
		expect(renderJobSummary({ phase: phase(), changesets: changesets(), inputs })).not.toContain("Merged PR");
	});

	it("includes the merged-PR row when there is one", () => {
		const md = renderJobSummary({ phase: phase({ mergedReleasePRNumber: 42 }), changesets: changesets(), inputs });
		expect(md).toContain("Merged PR");
		expect(md).toContain("#42");
	});

	it("omits release type and affected packages when there are no changesets", () => {
		const md = renderJobSummary({ phase: phase(), changesets: changesets(), inputs });
		expect(md).not.toContain("Release Type");
		expect(md).not.toContain("Affected Packages");
	});

	it("lists release type and affected packages when there are changesets", () => {
		const md = renderJobSummary({
			phase: phase(),
			changesets: changesets({
				hasChangesets: true,
				changesetCount: 2,
				releaseType: "minor",
				affectedPackages: ["@scope/a", "@scope/b"],
			}),
			inputs,
		});
		expect(md).toContain("`minor`");
		expect(md).toContain("`@scope/a`");
		expect(md).toContain("`@scope/b`");
	});

	it("gives every phase a distinct description", () => {
		const phases = ["branch-management", "validation", "publishing", "close-issues", "none"] as const;
		const descriptions = phases.map((p) => {
			const md = renderJobSummary({ phase: phase({ phase: p }), changesets: changesets(), inputs });
			const row = md.split("\n").find((line) => line.startsWith("| Description |"));
			expect(row, `no Description row rendered for phase "${p}"`).toBeDefined();
			return row;
		});
		// Every phase must describe itself differently, or the summary panel is
		// telling the reader less than the phase name already did.
		expect(new Set(descriptions).size).toBe(phases.length);
	});
});
