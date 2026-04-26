# cmakefmt-action

[![CI](https://github.com/cmakefmt/cmakefmt-action/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/cmakefmt/cmakefmt-action/actions/workflows/ci.yml)
[![GitHub Marketplace](https://img.shields.io/badge/GitHub%20Actions-Marketplace-blue?logo=github)](https://github.com/marketplace/actions/cmakefmt-action)

Official GitHub Action for [cmakefmt](https://cmakefmt.dev) — a fast, native CMake formatter.

Installs `cmakefmt` on Linux, macOS, and Windows runners. By default it checks
the whole repository, emits GitHub annotations, and writes a short job summary.

## Usage

### Strict whole-repo check

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

### Changed-file check for pushes and pull requests

Use this when adopting `cmakefmt` in an existing repository without formatting
every CMake file on day one:

```yaml
name: CMake Format

on: [push, pull_request]

jobs:
  fmt:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: cmakefmt/cmakefmt-action@v2
        with:
          scope: changed
          mode: diff
```

On pull requests, `scope: changed` compares against `origin/${{ github.base_ref }}`.
On push events, it compares against the push event's `before` commit. The
action fetches the needed Git history automatically.

### Check and print a diff

```yaml
- uses: cmakefmt/cmakefmt-action@v2
  with:
    mode: diff
```

### Auto-fix mode (reformat in-place)

```yaml
- uses: cmakefmt/cmakefmt-action@v2
  with:
    mode: fix
```

This reformats all CMake files in-place. Useful in workflows that
auto-commit formatting fixes (e.g. with `stefanzweifel/git-auto-commit-action`).

### Auto-format pull requests

```yaml
name: CMake Format

on: [pull_request]

permissions:
  contents: write

jobs:
  fmt:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: cmakefmt/cmakefmt-action@v2
        with:
          mode: fix
      - uses: stefanzweifel/git-auto-commit-action@v7
        with:
          commit_message: Format CMake files with cmakefmt
```

### Pin a specific version

```yaml
- uses: cmakefmt/cmakefmt-action@v2
  with:
    version: '1.3.0'
```

### Install only, run manually

```yaml
- uses: cmakefmt/cmakefmt-action@v2
  with:
    mode: setup

- name: Check staged files only
  run: cmakefmt --staged --check --report-format github
```

The legacy `args: ''` install-only form still works.

### Explicit paths

Use `paths` for multiple roots or paths containing spaces:

```yaml
- uses: cmakefmt/cmakefmt-action@v2
  with:
    paths: |
      CMakeLists.txt
      cmake/modules
      examples/with spaces
```

### Advanced arguments

```yaml
- uses: cmakefmt/cmakefmt-action@v2
  with:
    args: '--config .cmakefmt.yaml src/'
```

`args` is the escape hatch for advanced `cmakefmt` flags. Prefer `mode`,
`scope`, and `paths` for common workflows.

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
    paths: cmake
    working-directory: src
```

## Inputs

| Input               | Default               | Description                                                                                                                                |
|---------------------|-----------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| `version`           | `latest`              | Version to install (e.g. `1.3.0`). Defaults to the newest release.                                                                         |
| `mode`              | _(legacy inputs)_     | Shortcut mode: `check`, `diff`, `fix`, or `setup`. Default behaviour is equivalent to `check`.                                             |
| `scope`             | `all`                 | File selection scope: `all`, `changed`, or `staged`.                                                                                       |
| `paths`             | _(empty)_             | Newline-delimited paths passed to `cmakefmt`. Cannot be combined with custom `args` or `scope: changed` / `scope: staged`.                 |
| `since`             | _(auto)_              | Base ref for `scope: changed`; defaults to the PR base or push `before` SHA.                                                               |
| `report-format`     | `github`              | Output format (`human`, `github`, `json`, `checkstyle`). Set to `""` to disable. Skipped if `args` already contains the flag.              |
| `working-directory` | _(repo root)_         | Directory from which to run `cmakefmt`. Useful for monorepos.                                                                              |
| `args`              | `.`                   | Advanced raw arguments passed to `cmakefmt`. Set to `""` to install without running.                                                       |
| `check-only`        | `true`                | Legacy input. When true, injects `--check`; when false, injects `--in-place`. Ignored when `mode` is set.                                  |
| `diff`              | `false`               | Legacy input. When true, injects `--diff`. Prefer `mode: diff`. Ignored when `mode` is set.                                                |
| `token`             | `${{ github.token }}` | GitHub token for version resolution. The default built-in token is sufficient.                                                             |

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
in the pull request diff. The action also writes a GitHub Step Summary with
the installed version, command, outcome, and local fix commands.

## License

MIT OR Apache-2.0 — see [LICENSE](LICENSE).
