# Log

## 2026-11-21

* Updated "Tests: 0/0 passed" reads as green but proves nothing
* Updated A hyphenated input name keeps its hyphen in the runner variable
* Updated A retry call-count assertion does not pin the retry interval
* Updated An API-failure fallback cannot name the merged PR
* Updated An explicit empty release-prefix is unverified on a real runner
* Updated Break the guarded thing before calling a suite done
* Updated Collect tests only from unit and integration, never restore stripped env vars
* Updated ConfigProvider.fromEnv silently misses every hyphenated input name
* Updated Each step declares its failure posture at contract time
* Updated Inject test inputs by provider, never by mutating process.env
* Updated Kit services over @actions/* packages
* Updated Omitting a test payload fails typed, not silently
* Updated Read inputs through ActionInput, resolve Repo per call, emit through one emitter
* Updated Release commit
* Updated Shape every step module the same way
* Updated The silent logger double cannot see the step log
* Updated action.yml is the single source of input and output names
* Updated release-cycle
* Updated savvy-web-shared-release-workflow
* Updated silk-router-action

## 2026-11-10

* Added Build with effected action build from @effected/plugin, configured by effected.toml
* Updated Build with the rsbuild-based github-action-builder, not ncc
* Updated Parse changeset frontmatter with a hand-written regex parser
* Updated dogfood-a-first-party-dependency
* Updated silk-router-action

## 2026-11-01

* Updated API-authoritative release detection
* Updated Bounded retry on release-prefixed pushes
* Updated Close-issues is a separate phase from publishing
* Updated Priority-ordered phase detection
* Updated action-contract

## 2026-10-26

* Updated Only five of seven GitHubError kinds degrade the release-commit query

## 2026-09-13

* Initialized the bundle with the software-project profile
