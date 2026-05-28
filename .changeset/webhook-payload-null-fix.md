---
"@savvy-web/silk-router-action": patch
---

## Bug Fixes

- Bump `@savvy-web/github-action-effects` to `^2.0.1` and rebuild `dist/main.js` against it. The library's `WebhookPayload` schema now accepts `null` in `IssueRef.body`, `IssueRef.html_url`, `Repository.full_name`, and `Repository.html_url`, matching what GitHub actually sends when a PR has no description. Without this, every `pull_request` event whose body or url was `null` aborted the action with `[ActionEnvironmentError] Event payload did not match the expected shape: WebhookPayload — Expected string, actual null`.
