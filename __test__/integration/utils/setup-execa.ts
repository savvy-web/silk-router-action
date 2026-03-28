import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const FIXTURES_DIR = resolve(REPO_ROOT, ".github/workflows/__fixtures__");
const DIST_MAIN = resolve(REPO_ROOT, ".github/actions/local/dist/main.js");
const DIST_POST = resolve(REPO_ROOT, ".github/actions/local/dist/post.js");

export interface RunActionOptions {
	/** Fixture directory relative to __fixtures__/pnpm/ (e.g. "pnpm-basic-changesets") */
	fixture: string;
	/** GitHub event name to simulate (default: "push") */
	event?: string;
	/** Git ref to simulate (e.g. "refs/heads/main") */
	ref?: string;
	/** Commit SHA to simulate */
	sha?: string;
	/** Event payload file relative to __fixtures__/events/ */
	eventPayload?: string;
	/** GitHub App ID (reads from env if not provided) */
	appId?: string;
	/** GitHub App private key (reads from env if not provided) */
	privateKey?: string;
}

export interface RunActionResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	outputs: Record<string, string>;
}

/**
 * Runs the built silk-router action via node with mocked GITHUB_* env vars.
 * Points GITHUB_WORKSPACE at the fixture directory for a self-contained workspace.
 *
 * Uses the same approach as .github/actions/test-fixture/action.yml but invoked
 * from vitest instead of a composite action.
 */
export async function runAction(opts: RunActionOptions): Promise<RunActionResult> {
	const fixtureDir = resolve(FIXTURES_DIR, "pnpm", opts.fixture);
	const ts = Date.now();
	const env: Record<string, string> = {
		...process.env,
		// GitHub Actions runtime
		GITHUB_ACTIONS: "true",
		GITHUB_WORKSPACE: fixtureDir,
		GITHUB_REPOSITORY: "savvy-web/silk-router-action",
		GITHUB_REPOSITORY_OWNER: "savvy-web",
		GITHUB_SHA: opts.sha ?? "test-sha-000",
		GITHUB_REF: opts.ref ?? "refs/heads/main",
		GITHUB_EVENT_NAME: opts.event ?? "push",
		GITHUB_EVENT_PATH: opts.eventPayload ? resolve(FIXTURES_DIR, "events", opts.eventPayload) : "",
		GITHUB_RUN_ID: "1",
		GITHUB_RUN_NUMBER: "1",
		GITHUB_ACTOR: "test-actor",
		GITHUB_SERVER_URL: "https://github.com",
		GITHUB_API_URL: "https://api.github.com",
		GITHUB_GRAPHQL_URL: "https://api.github.com/graphql",
		GITHUB_ACTION: "silk-router-test",
		GITHUB_JOB: "test",
		GITHUB_WORKFLOW: "test",
		// GitHub Actions file-based outputs
		GITHUB_OUTPUT: resolve(REPO_ROOT, `.github-output-${ts}`),
		GITHUB_STEP_SUMMARY: resolve(REPO_ROOT, `.github-summary-${ts}`),
		GITHUB_STATE: resolve(REPO_ROOT, `.github-state-${ts}`),
		GITHUB_ENV: resolve(REPO_ROOT, `.github-env-${ts}`),
		GITHUB_PATH: resolve(REPO_ROOT, `.github-path-${ts}`),
		// Action inputs
		"INPUT_APP-ID": opts.appId ?? process.env.APP_ID ?? "",
		"INPUT_PRIVATE-KEY": opts.privateKey ?? process.env.APP_PRIVATE_KEY ?? "",
		"INPUT_TARGET-BRANCH": "main",
		"INPUT_RELEASE-BRANCH": "changeset-release/main",
	};

	// Create empty output/state/env files (Actions runtime expects them to exist)
	const { writeFileSync } = await import("node:fs");
	for (const f of [env.GITHUB_OUTPUT, env.GITHUB_STEP_SUMMARY, env.GITHUB_STATE, env.GITHUB_ENV, env.GITHUB_PATH]) {
		writeFileSync(f, "");
	}

	// Run main step
	const result = await execa("node", [DIST_MAIN], {
		env,
		reject: false,
		cwd: REPO_ROOT,
		timeout: 30_000,
	});

	// Run post step (fire and forget, like GitHub Actions)
	await execa("node", [DIST_POST], {
		env,
		reject: false,
		cwd: REPO_ROOT,
		timeout: 10_000,
	});

	// Parse outputs from GITHUB_OUTPUT file
	const outputs: Record<string, string> = {};
	try {
		const { readFileSync, unlinkSync } = await import("node:fs");
		const content = readFileSync(env.GITHUB_OUTPUT, "utf-8");
		for (const line of content.split("\n")) {
			const match = line.match(/^([^=]+)=(.*)$/);
			if (match) {
				outputs[match[1]] = match[2];
			}
		}
		// Clean up temp files
		for (const f of [env.GITHUB_OUTPUT, env.GITHUB_STEP_SUMMARY, env.GITHUB_STATE, env.GITHUB_ENV, env.GITHUB_PATH]) {
			try {
				unlinkSync(f);
			} catch {}
		}
	} catch {}

	return {
		exitCode: result.exitCode ?? 1,
		stdout: result.stdout,
		stderr: result.stderr,
		outputs,
	};
}
