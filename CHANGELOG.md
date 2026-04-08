# Changelog

## Unreleased

### Added

- `token` input: GitHub token used for version resolution and downloads;
  defaults to the built-in `GITHUB_TOKEN` (no extra permissions needed)
- `working-directory` input: run cmakefmt from a subdirectory, useful for
  monorepo layouts
- Binary caching via `actions/cache`: the downloaded binary is cached per
  OS/arch/version so repeat runs skip the download entirely
- SHA-256 checksum verification: the `SHA256SUMS` file published with each
  release is now fetched and verified before extracting the binary
- CI test `check-fails-on-unformatted`: asserts that `--check` exits non-zero
  when a file would be reformatted
- CI test `working-directory`: exercises the new `working-directory` input
- CI test assertion that the `version` output matches the pinned version in
  `test-pinned-version`

### Changed

- Default `args` changed from `.` (format in-place) to
  `--check --report-format github .` (check mode with GitHub PR annotations);
  this is the correct default for CI — reformatting in-place creates a dirty
  working tree and breaks subsequent steps
- Version resolution now uses the GitHub REST API with an authenticated
  request instead of following an HTTP redirect; avoids the 60 req/hr
  anonymous rate limit and is more robust against redirect changes
- Binary is now installed to `~/.cmakefmt-bin` (a stable, cacheable path)
  instead of `$RUNNER_TEMP` (which is cleaned up between jobs)

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
