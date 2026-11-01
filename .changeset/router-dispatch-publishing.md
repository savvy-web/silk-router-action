---
"@savvy-web/silk-router-action": patch
---

## Bug Fixes

- A `workflow_dispatch` on the target branch now runs release-commit detection, so a manual dispatch at a merged release commit resolves to the `publishing` phase instead of `branch-management` (#384).
