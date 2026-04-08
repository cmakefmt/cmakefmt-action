# Changelog

## Unreleased

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
