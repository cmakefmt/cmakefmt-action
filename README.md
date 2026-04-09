# cmakefmt-action

[![CI](https://github.com/cmakefmt/cmakefmt-action/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/cmakefmt/cmakefmt-action/actions/workflows/ci.yml)
[![GitHub Marketplace](https://img.shields.io/badge/GitHub%20Actions-Marketplace-blue?logo=github)](https://github.com/marketplace/actions/cmakefmt-action)

Official GitHub Action for [cmakefmt](https://cmakefmt.dev) — a fast, native CMake formatter.

Installs `cmakefmt` on Linux, macOS, and Windows runners and runs it on the
entire repository by default.

## Usage

### Format check on every push and pull request

```yaml
name: CMake Format

on: [push, pull_request]

jobs:
  fmt:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: cmakefmt/cmakefmt-action@v2
```

By default the action runs `cmakefmt --check --report-format github .` —
it checks all CMake files and emits inline PR annotations for any that
would be reformatted. The step fails if any file is not formatted correctly.

> **Note:** The default does not print a diff. To see what `cmakefmt`
> would change in the CI log, add `diff: true`:
>
> ```yaml
> - uses: cmakefmt/cmakefmt-action@v2
>   with:
>     diff: true
> ```

### Auto-fix mode (reformat in-place)

```yaml
- uses: cmakefmt/cmakefmt-action@v2
  with:
    check-only: false
```

This reformats all CMake files in-place. Useful in workflows that
auto-commit formatting fixes (e.g. with `stefanzweifel/git-auto-commit-action`).

### Pin a specific version

```yaml
- uses: cmakefmt/cmakefmt-action@v2
  with:
    version: '0.2.0'
```

### Install only, run manually

```yaml
- uses: cmakefmt/cmakefmt-action@v2
  with:
    args: ''   # skip the built-in run step

- name: Check staged files only
  run: cmakefmt --staged --check --report-format github
```

### Custom arguments

```yaml
- uses: cmakefmt/cmakefmt-action@v2
  with:
    args: '--config .cmakefmt.yaml src/'
```

### Use human-readable output instead of annotations

```yaml
- uses: cmakefmt/cmakefmt-action@v2
  with:
    report-format: human
```

### Matrix across OS

```yaml
jobs:
  fmt:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v6
      - uses: cmakefmt/cmakefmt-action@v2
```

### Run in a subdirectory

```yaml
- uses: cmakefmt/cmakefmt-action@v2
  with:
    args: 'cmake'
    working-directory: src
```

## Inputs

| Input               | Default               | Description                                                                                                                 |
|---------------------|-----------------------|-----------------------------------------------------------------------------------------------------------------------------|
| `version`           | `latest`              | Version to install (e.g. `0.2.0`). Defaults to the newest release.                                                         |
| `args`              | `.`                   | Paths and extra flags passed to `cmakefmt`. Set to `""` to install without running.                                        |
| `check-only`        | `true`                | Only check formatting (exit non-zero if files would change). Set to `false` to reformat in-place.                          |
| `diff`              | `false`               | Print a unified diff of the changes. Requires cmakefmt >= 0.4.0.                                                          |
| `report-format`     | `github`              | Output format (`human`, `github`, `json`, `checkstyle`). Set to `""` to disable. Skipped if `args` already contains the flag. |
| `working-directory` | _(repo root)_         | Directory from which to run `cmakefmt`. Useful for monorepos.                                                               |
| `token`             | `${{ github.token }}` | GitHub token for version resolution. The default built-in token is sufficient.                                              |

## Outputs

| Output    | Description                                  |
|-----------|----------------------------------------------|
| `version` | The installed version (without leading `v`). |

## Platforms

| Runner                    | Architecture | Binary used                          |
|---------------------------|--------------|--------------------------------------|
| `ubuntu-*`                | `x86_64`     | `x86_64-unknown-linux-musl` (static) |
| `ubuntu-*-arm`            | `aarch64`    | `aarch64-unknown-linux-gnu`          |
| `macos-*` (Apple Silicon) | `arm64`      | `aarch64-apple-darwin`               |
| `macos-*-intel`           | `x86_64`     | `x86_64-apple-darwin`                |
| `windows-*`               | `x86_64`     | `x86_64-pc-windows-msvc`             |

## Exit codes

`cmakefmt --check` exits `0` when all files are correctly formatted and `1`
when any file would be changed. The action fails the step on a non-zero exit,
which (with `--report-format github`) annotates the offending lines directly
in the pull request diff.

## License

MIT OR Apache-2.0 — see [LICENSE](LICENSE).
