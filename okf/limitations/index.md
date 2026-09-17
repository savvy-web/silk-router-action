# Limitation

* [An API-failure fallback cannot name the merged PR](fallback-cannot-name-the-pr.md) - When the PR-association query degrades, is\_release\_commit falls back to commit-message patterns and merged\_pr\_number is left empty
* [An explicit empty release-prefix is unverified on a real runner](empty-release-prefix-unverified-on-runner.md) - Whether GitHub publishes an empty INPUT\_RELEASE-PREFIX for an explicitly-empty with value, versus substituting the action.yml default, has never been confirmed outside a local test
