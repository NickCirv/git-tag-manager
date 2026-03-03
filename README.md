# git-tag-manager

Manage Git tags from the terminal — list, search, create, delete, push with rich ANSI formatting and JSON output mode.

Zero external dependencies. Pure Node.js ES modules. Node 18+.

```
  TAG             DATE        SHA      TYPE         MESSAGE
  ────────────────────────────────────────────────────────────────────────
  v2.0.0          2026-03-01  a1b2c3d  annotated    Major release
  v1.1.0          2026-02-15  d4e5f6a  annotated    Release 1.1.0 — fixes
  v1.0.0          2026-01-10  b7c8d9e  lightweight  init
  old-format-tag  2025-12-20  f0a1b2c  lightweight  initial commit

  Total: 4 tag(s)
```

## Install

```bash
# Run without installing
npx git-tag-manager list

# Install globally
npm install -g git-tag-manager
```

Both `git-tag-manager` and `gtm` are available as bin aliases.

## Commands

### list

```bash
gtm list
gtm list --sort date
gtm list --sort name
gtm list --json
```

Shows all tags (annotated + lightweight) with date, SHA, type, and message. Sorted semver-aware by default.

### show

```bash
gtm show v1.2.0
gtm show v1.2.0 --json
```

Full tag detail — commit hash, author, date, tag message, and commit body.

### create

```bash
gtm create v1.3.0
gtm create v1.3.0 --message "Release 1.3.0"    # annotated
gtm create v1.3.0 --message "Release 1.3.0" --push
```

### delete

```bash
gtm delete v0.1.0
gtm delete v0.1.0 --remote    # delete local + remote
gtm delete v0.1.0 --json
```

### push

```bash
gtm push v1.3.0               # push a specific tag
gtm push                       # push all tags not yet on remote
gtm push --all                 # push everything (git push --tags)
```

### search

```bash
gtm search "v1.*"
gtm search "release"
gtm search --from 2025-01-01
gtm search --from 2025-01-01 --to 2025-12-31
gtm search "v2" --from 2026-01-01 --json
```

Glob/regex-style pattern matching on tag name and message. Optional date range filters.

### batch-delete

```bash
gtm batch-delete --older-than 90 --dry-run    # preview
gtm batch-delete --older-than 90              # delete stale local tags
gtm batch-delete --older-than 90 --remote     # delete local + remote
gtm batch-delete --older-than 90 --json
```

Batch delete all tags older than N days.

## JSON output

Every command supports `--json` for scripting and piping:

```bash
gtm list --json | jq '.[0]'
# {
#   "name": "v2.0.0",
#   "date": "2026-03-01",
#   "sha": "a1b2c3d",
#   "type": "tag",
#   "message": "Major release"
# }

gtm batch-delete --older-than 60 --dry-run --json | jq '.wouldDelete'
```

## Security

- Uses `spawnSync` with explicit argument arrays — no shell injection possible
- Never calls `exec` or `execSync`
- No external dependencies — nothing from npm beyond Node.js itself

## Requirements

- Node.js 18+
- Git available on PATH

## License

MIT
