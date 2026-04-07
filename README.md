# cmakefmt-action

Official GitHub Action for [cmakefmt](https://cmakefmt.dev) — a fast, native
CMake formatter.

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
      - uses: actions/checkout@v4
      - uses: cmakefmt/cmakefmt-action@v1
        with:
          args: '--check --report-format github .'
```

`--check` exits non-zero if any file would change. `--report-format github`
emits inline annotations on pull request diffs.

### Default usage (format entire repository)

```yaml
- uses: cmakefmt/cmakefmt-action@v1
```

This runs `cmakefmt .` — formats all CMake files in the working directory.

### Pin a specific version

```yaml
- uses: cmakefmt/cmakefmt-action@v1
  with:
    version: '0.2.0'
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
| `args` | `.` | Arguments passed to `cmakefmt`. Set to `""` to install without running. |

## Outputs

| Output | Description |
|--------|-------------|
| `version` | The installed version (without leading `v`). |

## Platforms

| Runner | Architecture | Binary used |
|--------|-------------|-------------|
| `ubuntu-*` | `x86_64` | `x86_64-unknown-linux-musl` (static) |
| `ubuntu-*-arm` | `aarch64` | `aarch64-unknown-linux-gnu` |
| `macos-*` (Apple Silicon) | `arm64` | `aarch64-apple-darwin` |
| `macos-*-intel` | `x86_64` | `x86_64-apple-darwin` |
| `windows-*` | `x86_64` | `x86_64-pc-windows-msvc` |

## Exit codes

`cmakefmt --check` exits `0` when all files are correctly formatted and `1`
when any file would be changed. The action fails the step on a non-zero exit,
which (with `--report-format github`) annotates the offending lines directly
in the pull request diff.

## License

MIT OR Apache-2.0 — see [LICENSE](LICENSE).
