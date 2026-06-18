---
"@savvy-web/silk-router-action": minor
---

## Features

Add a `release-prefix` input (default `release:`). When a push to the target branch carries a commit whose message starts with the prefix but GitHub has not yet associated the merged release PR with the commit, the router now retries detection up to 3 times, 10 seconds apart, before falling back to branch-management. This fixes the race where an auto-merged release PR was misrouted to the branch-management phase and had to be re-run manually. The prefix only gates the retry; the GitHub API remains the sole authority for `is_release_commit`.
