# cmakefmt-action

Official GitHub Action for [cmakefmt](https://cmakefmt.dev) — a fast, native
CMake formatter.

Installs `cmakefmt` on Linux, macOS, and Windows runners, then optionally
checks that all CMake files in your repository are correctly formatted.

## Usage

### Check formatting on every push and pull request

```yaml
name: CMake Format

on: [push, pull_request]

jobs:
  fmt:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: cmakefmt/cmakefmt-action@v1
```

This runs `cmakefmt --check --report-format github .` by default, which
checks all CMake files recursively and emits inline annotations on pull
request diffs when formatting issues are found.

### Pin a specific version

```yaml
- uses: cmakefmt/cmakefmt-action@v1
  with:
    version: '0.3.0'
```

### Install only, run manually

```yaml
- uses: cmakefmt/cmakefmt-action@v1
  with:
    args: ''   # skip the built-in run step

- name: Check staged files only
  run: cmakefmt --staged --check --report-format github
```

### Custom arguments

```yaml
- uses: cmakefmt/cmakefmt-action@v1
  with:
    args: '--check --report-format github --config .cmakefmt.yaml src/'
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
      - uses: actions/checkout@v4
      - uses: cmakefmt/cmakefmt-action@v1
```

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `version` | `latest` | Version to install (e.g. `0.2.0`). Defaults to the newest release. |
| `args` | `--check --report-format github .` | Arguments passed to `cmakefmt`. Set to `""` to skip running it. |

## Outputs

| Output    | Description                                   |
|-----------|-----------------------------------------------|
| `version` | The installed version (without leading `v`).  |

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
which causes the GitHub Actions job to fail and (with `--report-format github`)
annotates the offending lines directly in the pull request diff.

## License

MIT OR Apache-2.0 — see [LICENSE](LICENSE).
