---
"@savvy-web/silk-router-action": patch
---

## Refactoring

The run log now opens with a bold **Workflow Control** heading, and each pipeline step runs through `ActionLogger.step`, which replaced `group` + `withStep` when `@effected/github-actions` 0.36.0 removed them. The run log shows one result line per step, such as `✓ Detect workflow phase · 1.2s`, with the step's detail folded beneath it on success and written unfolded on failure. Inputs, outputs and phase detection are unchanged.
