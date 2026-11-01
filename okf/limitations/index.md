# Limitation

* [An API-failure fallback cannot name the merged PR](fallback-cannot-name-the-pr.md) - When the PR-association query degrades, is_release_commit falls back to commit-message patterns and merged_pr_number is left empty
* [An explicit empty release-prefix is unverified on a real runner](empty-release-prefix-unverified-on-runner.md) - Whether GitHub publishes an empty INPUT_RELEASE-PREFIX for an explicitly-empty with value, versus substituting the action.yml default, has never been confirmed outside a local test
