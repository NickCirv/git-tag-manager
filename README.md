<div align="center">

# git-tag-manager

**List, search, create, delete, and push Git tags — with rich ANSI output and `--json` for scripting**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?labelColor=0B0A09)](LICENSE)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?labelColor=0B0A09)](package.json)
[![Node: >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen?labelColor=0B0A09)](package.json)

</div>

## Install

```bash
npx github:NickCirv/git-tag-manager
```

Both `git-tag-manager` and `gtm` are available as bin aliases.

## Usage

```bash
gtm list                                         # all tags, semver-sorted
gtm list --sort date --json                      # date-sorted JSON for scripting
gtm create v1.3.0 --message "Release 1.3.0" --push
gtm delete v0.1.0 --remote                      # local + remote
gtm push                                          # push any tags not yet on remote
gtm search "v1.*" --from 2025-01-01             # filter by pattern + date range
gtm batch-delete --older-than 90 --dry-run      # preview stale-tag cleanup
gtm batch-delete --older-than 90 --remote       # delete stale local + remote
```

| Flag | Description |
|------|-------------|
| `--sort semver\|date\|name` | Sort order for `list` (default: semver) |
| `--message "text"` | Create an annotated tag |
| `--push` | Push to remote after `create` |
| `--remote` | Also apply operation to remote |
| `--older-than <days>` | Target tags older than N days (`batch-delete`) |
| `--dry-run` | Preview without making changes |
| `--from / --to YYYY-MM-DD` | Date range filter for `search` |
| `--json` | Machine-readable output on every command |
| `--all` | Push all tags (`push --all`) |

## What it does

`gtm` wraps the git tag workflow in a single ergonomic CLI. `list` renders a colour-coded table with tag type (annotated vs lightweight), date, short SHA, and message. `search` filters by glob/regex pattern and optional date range. `batch-delete` bulk-removes stale tags by age with a `--dry-run` preview. Every command emits `--json` output for use with `jq` or CI scripts.

Uses `spawnSync` with explicit argument arrays throughout — no shell injection, no `exec`, no network calls.

---

<sub>Zero dependencies · Node >=18 · MIT · by <a href="https://github.com/NickCirv">NickCirv</a></sub>
