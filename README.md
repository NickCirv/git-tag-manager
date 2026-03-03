# git-tag-manager

> Interactive TUI for managing git tags and releases. Zero dependencies.

## Install

```bash
# Run without installing
npx git-tag-manager

# Or install globally
npm install -g git-tag-manager
```

## Quick Start

```
$ gtm

  git-tag-manager — interactive tag browser
  ↑↓ navigate  Enter=details  n=new  d=delete  p=push  r=refresh  q=quit

  TAG              DATE        SHA      MESSAGE
  ──────────────────────────────────────────────────────────────────────
▶ v1.2.0          2024-03-01  a1b2c3d  Release 1.2.0 — new features
  v1.1.0          2024-02-15  d4e5f6a  Release 1.1.0 — bug fixes
  v1.0.0          2024-01-10  b7c8d9e  Initial release
  v0.9.0-beta     2023-12-20  f0a1b2c  Beta release
```

## Commands

| Command | Description |
|---|---|
| `gtm` | Open interactive TUI |
| `gtm list` | Table view: tag, date, sha, message |
| `gtm create <tag>` | Create a tag (annotated or lightweight) |
| `gtm delete <tag>` | Delete local tag |
| `gtm push` | Push all unpushed tags to remote |
| `gtm search <pattern>` | Filter tags by name or message |
| `gtm compare <tag1> <tag2>` | Diff stats between two tags |
| `gtm latest` | Show the most recent tag |

### Options

```bash
gtm create v1.3.0 --message "Release 1.3.0"   # annotated tag
gtm create v1.3.0 --message "..." --push        # create and push
gtm delete v0.1.0 --remote                      # delete local + remote
gtm push --all                                   # push every tag
```

## Interactive TUI Keys

| Key | Action |
|---|---|
| `↑` / `k` | Navigate up |
| `↓` / `j` | Navigate down |
| `Enter` | Show tag details |
| `n` | Create new tag |
| `d` | Delete selected tag |
| `p` | Push selected tag to remote |
| `r` | Refresh list |
| `q` / `Ctrl+C` | Quit |

## Features

- Semver-aware sorting (`v1.10.0` ranks above `v1.9.0`)
- ANSI colors and clean table layout
- Annotated + lightweight tag support
- Safe: uses `spawnSync` — no shell injection
- Works with any git remote

## Why?

Because nobody memorises `git tag -a v1.2.0 -m "..."` and `git push origin --tags` every time. `gtm` gives you a visual interface with sane defaults and keyboard shortcuts — no flags, no docs, just navigate and act.

---

Built with Node.js · Zero dependencies · MIT License
