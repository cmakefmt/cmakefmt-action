# Contributing

Bug reports, issues, and pull requests are welcome.

For general contribution guidelines, coding standards, and changelog policy,
see [CONTRIBUTING.md](https://github.com/cmakefmt/cmakefmt/blob/main/CONTRIBUTING.md)
in the main `cmakefmt` repository.

## This Repo

This repository contains the GitHub Action wrapper for `cmakefmt`. It downloads
a pre-built binary from the [cmakefmt releases](https://github.com/cmakefmt/cmakefmt/releases)
and runs it on the repository.

Changes here typically fall into one of:

- Updating the default or pinned `cmakefmt` version
- Improving platform detection or binary download logic
- Updating action inputs, outputs, or documentation
