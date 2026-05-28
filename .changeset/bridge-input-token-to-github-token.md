---
"@savvy-web/silk-router-action": patch
---

## Bug Fixes

- Bridge the `token` action input to the `GITHUB_TOKEN` environment variable in `src/main.ts` before `Action.run` constructs the layer. `GitHubClientLive.fromEnv()` reads `GITHUB_TOKEN` from the environment, which the runner does not populate automatically. Without the bridge, every action call failed with `[GitHubClientError] GITHUB_TOKEN not set` even when the workflow passed `with: token: ${{ github.token }}`.
