# Changelog

## Unreleased

### Added

- `mode` input for common workflows: `check`, `diff`, `fix`, and `setup`.
  This gives users a simpler first-choice API while preserving the advanced
  `args` input.
- `scope` input for file selection: `all`, `changed`, or `staged`.
  `scope: changed` uses `--changed` and infers `origin/${{ github.base_ref }}`
  on pull request workflows unless `since` is set.
- `paths` input for newline-delimited explicit paths. This avoids shell-style
  argument splitting for common multi-path workflows.
- `since` input for choosing the Git base ref used by `scope: changed`.
  If omitted, pull request workflows default to `origin/${{ github.base_ref }}`
  and push workflows default to the push event's `before` commit.
- GitHub Step Summary output with the installed version, command, outcome,
  local fix commands on failure, and JSON report counts when available.
- CI smoke coverage for action metadata loading, `mode: setup`, and real
  `scope: changed` execution against a local Git range.
- Release workflow preflight checks: `npm ci`, unit tests, bundled `dist/`
  freshness, setup-mode smoke test, and changed-scope smoke test all run
  before the GitHub Release is created or the floating major tag is moved.
- Manual release promotion via `workflow_dispatch`, which validates the
  requested version, verifies the action, creates the tag, publishes the
  release, and updates the floating major tag in one workflow.
- `check-only` input (default `true`): when true, injects `--check` so
  cmakefmt only verifies formatting. Set to `false` to reformat in-place,
  useful for auto-fix workflows. Skipped if `args` already contains
  `--check`, `--in-place`, or `-i`.
- `diff` input (default `false`): when true, injects `--diff` to print a
  unified diff of the changes cmakefmt would make. Now composes correctly
  with `--check` and `--report-format` as of cmakefmt v0.4.0.
- `report-format` input (default `github`): controls the output format
  (`human`, `github`, `json`, `checkstyle`). Injected as
  `--report-format <value>` unless `args` already contains the flag.
  Set to `""` to disable.

### Changed

- Default `args` simplified from `--check --report-format github .` to
  `.`; the `--check` and `--report-format github` flags are now handled
  by the dedicated `check-only` and `report-format` inputs.
- `check-only: false` now injects `--in-place`, matching the documented
  auto-fix behaviour.
- The README now leads with strict whole-repo, changed-file, diff, setup,
  explicit-path, and auto-format recipes.

---

## v2.0.0

### Changed

- **Rewritten from composite shell action to TypeScript (Node 20)**:
  single cross-platform code path replaces per-OS bash/PowerShell scripts.
  Uses `@actions/tool-cache` for binary caching, `@actions/exec` for
  argument handling, and `@actions/http-client` for version resolution.
- Binary caching now uses the `@actions/tool-cache` runner cache instead of
  `actions/cache@v5`; the binary persists across jobs on the same runner
  without a separate cache action
- SHA-256 checksum verification rewritten in Node.js; no longer depends on
  platform-specific `sha256sum`/`shasum`/`Get-FileHash` commands
- CI now includes a `build` job that verifies `dist/` is up to date with
  the TypeScript source

### Added

- `token` input: GitHub token used for version resolution and downloads;
  defaults to the built-in `GITHUB_TOKEN` (no extra permissions needed)
- `working-directory` input: run cmakefmt from a subdirectory, useful for
  monorepo layouts
- Default `args` changed from `.` (format in-place) to
  `--check --report-format github .` (check mode with GitHub PR annotations)
- CI tests: `check-fails-on-unformatted`, `working-directory`, and a
  `version` output assertion in `test-pinned-version`

---

## v1.0.0

### Added

- Initial release of `cmakefmt/cmakefmt-action`
- Composite action that installs `cmakefmt` on Linux, macOS, and Windows
- `version` input for pinning a specific release (default: `latest`)
- `args` input for controlling what `cmakefmt` runs
- `version` output exposing the resolved installed version
- CI workflow testing default, install-only, and pinned-version scenarios
  across all three platforms
