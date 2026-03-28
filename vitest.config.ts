import { VitestConfig } from "@savvy-web/vitest";

export default VitestConfig.create({
	agentReporter: false,
	coverage: VitestConfig.COVERAGE_LEVELS.none,
});
