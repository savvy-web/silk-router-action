---
"@savvy-web/silk-router-action": patch
---

## Bug Fixes

- Rebuild `dist/main.js` against a patched `@savvy-web/github-action-effects` that accepts `null` in `WebhookPayload.IssueRef.body`, `IssueRef.html_url`, `Repository.full_name`, and `Repository.html_url`. Without the patch, every `pull_request` event whose body or url was `null` aborted the action with `[ActionEnvironmentError] Event payload did not match the expected shape: WebhookPayload — Expected string, actual null`. The library fix ships in github-action-effects PR #135.
