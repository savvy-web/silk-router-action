import { defineConfig } from "vitest/config";

// NOTE: The @vitest-agent/plugin config is temporarily disabled for the Effect v4
// migration. @vitest-agent/plugin@1.1.9 (latest) is an Effect v3 package: importing
// AgentPlugin transitively loads @effect/sql-sqlite-node@0.52.0, whose v3-only
// SqliteClient calls Context.GenericTag (removed in v4) at config-eval and crashes
// the whole run. Effect v3 and v4 cannot coexist. Restore the block below once a
// v4-line @vitest-agent/plugin ships.
//
// import { AgentPlugin } from "@vitest-agent/plugin";
//
// export default async () => {
// 	const { projects, tags } = await AgentPlugin.discover();
// 	return defineConfig({
// 		plugins: [
// 			AgentPlugin({
// 				console: {
// 					human: "stream",
// 					agent: "agent",
// 				},
// 				coverageTargets: AgentPlugin.COVERAGE_LEVELS.strict.coverageTargets,
// 			}),
// 		],
// 		test: {
// 			...(projects ? { projects } : {}),
// 			tags,
// 			pool: "forks",
// 			globalSetup: ["vitest.setup.ts"],
// 			coverage: {
// 				enabled: true,
// 				provider: "v8",
// 				thresholds: AgentPlugin.COVERAGE_LEVELS.strict.thresholds,
// 				exclude: [],
// 			},
// 		},
// 	});
// };

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		pool: "forks",
		globalSetup: ["vitest.setup.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/main.ts"],
		},
	},
});
