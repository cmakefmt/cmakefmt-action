# Changelog

## Unreleased

### Added

- Initial release of `cmakefmt/cmakefmt-action`
- Composite action that installs `cmakefmt` on Linux, macOS, and Windows
- `version` input for pinning a specific release (default: `latest`)
- `args` input for controlling what `cmakefmt` runs (default: `--check --report-format github .`)
- `version` output exposing the resolved installed version
- CI workflow testing default, install-only, and pinned-version scenarios across all three platforms
