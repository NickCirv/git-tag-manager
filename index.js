#!/usr/bin/env node

/**
 * git-tag-manager (gtm)
 * Manage Git tags — list, search, create, delete, push with rich formatting.
 * Pure Node.js ESM · Zero external dependencies · Node 18+ · MIT
 */

import { spawnSync } from 'child_process';

// ─── ANSI ─────────────────────────────────────────────────────────────────────

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
};

const isNoColor  = process.env.NO_COLOR !== undefined || process.env.TERM === 'dumb';
const colorize   = (c, s) => isNoColor ? s : `${c}${s}${C.reset}`;
const bold       = (s) => colorize(C.bold,    s);
const dim        = (s) => colorize(C.dim,     s);
const red        = (s) => colorize(C.red,     s);
const green      = (s) => colorize(C.green,   s);
const yellow     = (s) => colorize(C.yellow,  s);
const cyan       = (s) => colorize(C.cyan,    s);
const magenta    = (s) => colorize(C.magenta, s);

// ─── GIT HELPERS ──────────────────────────────────────────────────────────────

/**
 * Run a git command safely using spawnSync (never exec/execSync).
 * Returns { stdout, stderr, status }.
 */
function git(...args) {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (r.error) {
    die(`git not found on PATH: ${r.error.message}`);
  }
  return {
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
    status: r.status ?? 1,
  };
}

function gitOrDie(...args) {
  const r = git(...args);
  if (r.status !== 0) {
    die(`git ${args[0]} failed: ${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

function die(msg) {
  process.stderr.write(red(`error: ${msg}\n`));
  process.exit(1);
}

function requireRepo() {
  const r = git('rev-parse', '--is-inside-work-tree');
  if (r.status !== 0) die('Not a git repository.');
}

function getRemote() {
  const r = git('remote');
  const remotes = r.stdout.split('\n').filter(Boolean);
  return remotes.includes('origin') ? 'origin' : (remotes[0] || 'origin');
}

// ─── TAG DATA ─────────────────────────────────────────────────────────────────

/**
 * Fetch all tags with metadata.
 * Returns Array<{ name, date, dateMs, sha, type, msg }>.
 */
function fetchAllTags() {
  const fmt = [
    '%(refname:short)',
    '%(creatordate:iso-strict)',
    '%(objecttype)',
    '%(*objectname)',
    '%(objectname)',
    '%(contents:subject)',
  ].join('\x01');

  const r = git('tag', '--sort=-creatordate', `--format=${fmt}`);
  if (r.status !== 0 || !r.stdout) return [];

  return r.stdout.split('\n').filter(Boolean).map(line => {
    const parts   = line.split('\x01');
    const name    = parts[0] || '';
    const dateStr = parts[1] || '';
    const type    = parts[2] || 'commit';
    // For annotated tags *objectname is the commit; for lightweight use objectname
    const sha     = (parts[3] || parts[4] || '').slice(0, 7);
    const msg     = (parts[5] || '').trim();
    const dateMs  = dateStr ? Date.parse(dateStr) : 0;
    const date    = dateStr ? dateStr.slice(0, 10) : '';
    return { name, date, dateMs, sha, type, msg };
  });
}

// ─── SORTING ──────────────────────────────────────────────────────────────────

function semverParts(tag) {
  const clean = tag.replace(/^v/i, '');
  const parts = clean.split('.').map(p => parseInt(p, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function isSemver(t) {
  return /^v?\d+\.\d+/.test(t);
}

function semverSort(tags) {
  const sv    = tags.filter(t => isSemver(t.name));
  const other = tags.filter(t => !isSemver(t.name));

  sv.sort((a, b) => {
    const [a0, a1, a2] = semverParts(a.name);
    const [b0, b1, b2] = semverParts(b.name);
    if (b0 !== a0) return b0 - a0;
    if (b1 !== a1) return b1 - a1;
    return b2 - a2;
  });

  other.sort((a, b) => (b.dateMs || 0) - (a.dateMs || 0));
  return [...sv, ...other];
}

// ─── TABLE RENDERER ───────────────────────────────────────────────────────────

/** Strip ANSI codes to get printable length. */
function visLen(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function padEnd(s, len) {
  const pad = Math.max(0, len - visLen(s));
  return s + ' '.repeat(pad);
}

function renderTable(tags) {
  if (!tags.length) return dim('  No tags found.\n');

  const nameW = Math.min(35, Math.max(3, ...tags.map(t => t.name.length)));
  const dateW = 10;
  const shaW  = 7;
  const typeW = 10;
  const msgW  = 45;

  const header = [
    padEnd(bold('TAG'),     nameW),
    padEnd(bold('DATE'),    dateW),
    padEnd(bold('SHA'),     shaW),
    padEnd(bold('TYPE'),    typeW),
    bold('MESSAGE'),
  ].join('  ');

  const sepLen = nameW + dateW + shaW + typeW + msgW + 8;
  const sep    = dim('─'.repeat(sepLen));

  const rows = tags.map(t => {
    const colName = padEnd(green(t.name), nameW);
    const colDate = padEnd(dim(t.date || '—'), dateW);
    const colSha  = padEnd(yellow(t.sha || '—'), shaW);
    const colType = padEnd(t.type === 'tag' ? cyan('annotated') : dim('lightweight'), typeW);
    const rawMsg  = t.msg || '';
    const colMsg  = rawMsg.length > msgW ? rawMsg.slice(0, msgW - 1) + '…' : rawMsg;
    return `  ${colName}  ${colDate}  ${colSha}  ${colType}  ${colMsg}`;
  });

  return [header, sep, ...rows].join('\n') + '\n';
}

// ─── COMMANDS ─────────────────────────────────────────────────────────────────

/** gtm list [--json] [--sort date|name|semver] */
function cmdList(flags) {
  requireRepo();
  let tags = fetchAllTags();
  if (!tags.length) {
    if (flags.json) return process.stdout.write('[]\n');
    return process.stdout.write(dim('No tags found.\n'));
  }

  const sort = flags.sort || 'semver';
  if (sort === 'name')  tags = [...tags].sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'date') tags = [...tags].sort((a, b) => (b.dateMs || 0) - (a.dateMs || 0));
  else tags = semverSort(tags);

  if (flags.json) {
    process.stdout.write(JSON.stringify(tags.map(({ name, date, sha, type, msg }) =>
      ({ name, date, sha, type, message: msg })
    ), null, 2) + '\n');
    return;
  }

  process.stdout.write('\n' + renderTable(tags));
  process.stdout.write(dim(`\n  Total: ${tags.length} tag(s)\n\n`));
}

/** gtm create <tag> [--message "..."] [--push] [--json] */
function cmdCreate(args, flags) {
  requireRepo();
  const tagName = args[0];
  if (!tagName) die('Usage: gtm create <tag> [--message "msg"] [--push]');

  const msg    = flags.message;
  const doPush = flags.push;

  if (msg) {
    gitOrDie('tag', '-a', tagName, '-m', msg);
  } else {
    gitOrDie('tag', tagName);
  }

  let pushed = false;
  if (doPush) {
    const remote = getRemote();
    gitOrDie('push', remote, tagName);
    pushed = true;
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify({ created: tagName, annotated: !!msg, pushed }) + '\n');
    return;
  }

  process.stdout.write(green(`\n  created  ${bold(tagName)}`) +
    (msg   ? `  ${dim('(annotated)')}` : `  ${dim('(lightweight)')}`) +
    (pushed ? `  ${dim('pushed')}` : '') + '\n\n');
}

/** gtm delete <tag> [--remote] [--json] */
function cmdDelete(args, flags) {
  requireRepo();
  const tagName = args[0];
  if (!tagName) die('Usage: gtm delete <tag> [--remote]');

  gitOrDie('tag', '-d', tagName);

  let remoteDeleted = false;
  let remoteError   = null;

  if (flags.remote) {
    const remote = getRemote();
    const r = git('push', remote, '--delete', tagName);
    if (r.status !== 0) {
      remoteError = r.stderr || 'remote delete failed';
    } else {
      remoteDeleted = true;
    }
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify({
      deleted: tagName,
      local: true,
      remote: remoteDeleted,
      remoteError: remoteError || undefined,
    }) + '\n');
    return;
  }

  process.stdout.write(green(`\n  deleted  ${bold(tagName)}  (local)\n`));
  if (remoteDeleted) process.stdout.write(green(`  deleted  ${bold(tagName)}  (remote)\n`));
  if (remoteError)   process.stdout.write(yellow(`  warning: remote delete — ${remoteError}\n`));
  process.stdout.write('\n');
}

/** gtm push [<tag>] [--all] [--json] */
function cmdPush(args, flags) {
  requireRepo();
  const remote = getRemote();

  if (flags.all) {
    gitOrDie('push', remote, '--tags');
    if (flags.json) return process.stdout.write(JSON.stringify({ pushed: 'all', remote }) + '\n');
    return process.stdout.write(green(`\n  pushed all tags → ${remote}\n\n`));
  }

  if (args[0]) {
    gitOrDie('push', remote, args[0]);
    if (flags.json) return process.stdout.write(JSON.stringify({ pushed: [args[0]], remote }) + '\n');
    return process.stdout.write(green(`\n  pushed  ${bold(args[0])} → ${remote}\n\n`));
  }

  // push tags not yet on remote
  const localTags  = git('tag').stdout.split('\n').filter(Boolean);
  if (!localTags.length) {
    if (flags.json) return process.stdout.write(JSON.stringify({ pushed: [], remote }) + '\n');
    return process.stdout.write(dim('  No local tags.\n'));
  }

  const lsRemote   = git('ls-remote', '--tags', '--refs', remote);
  const remoteTags = lsRemote.status === 0
    ? lsRemote.stdout.split('\n').filter(Boolean).map(l => {
        const ref = l.split('\t')[1] || '';
        return ref.replace('refs/tags/', '').replace(/\^\{\}$/, '');
      })
    : [];

  const missing = localTags.filter(t => !remoteTags.includes(t));

  if (!missing.length) {
    if (flags.json) return process.stdout.write(JSON.stringify({ pushed: [], remote, note: 'all up to date' }) + '\n');
    return process.stdout.write(dim(`\n  All tags already on ${remote}.\n\n`));
  }

  const pushed = [];
  for (const t of missing) {
    gitOrDie('push', remote, t);
    pushed.push(t);
    if (!flags.json) process.stdout.write(green(`  pushed  ${bold(t)} → ${remote}\n`));
  }

  if (flags.json) process.stdout.write(JSON.stringify({ pushed, remote }) + '\n');
  else process.stdout.write('\n');
}

/** gtm search <pattern> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--json] */
function cmdSearch(args, flags) {
  requireRepo();
  const pattern = args[0];
  if (!pattern && !flags.from && !flags.to) {
    die('Usage: gtm search <pattern> [--from YYYY-MM-DD] [--to YYYY-MM-DD]');
  }

  let tags = fetchAllTags();

  // pattern filter
  if (pattern) {
    const re = new RegExp(pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'i');
    tags = tags.filter(t => re.test(t.name) || re.test(t.msg));
  }

  // date range filter
  if (flags.from) {
    const fromMs = Date.parse(flags.from);
    if (Number.isNaN(fromMs)) die(`Invalid --from date: ${flags.from}`);
    tags = tags.filter(t => t.dateMs >= fromMs);
  }
  if (flags.to) {
    const toMs = Date.parse(flags.to) + 86400000; // inclusive
    if (Number.isNaN(toMs)) die(`Invalid --to date: ${flags.to}`);
    tags = tags.filter(t => t.dateMs <= toMs);
  }

  tags = semverSort(tags);

  if (flags.json) {
    process.stdout.write(JSON.stringify(tags.map(({ name, date, sha, type, msg }) =>
      ({ name, date, sha, type, message: msg })
    ), null, 2) + '\n');
    return;
  }

  if (!tags.length) {
    process.stdout.write(dim(`\n  No tags matching the criteria.\n\n`));
    return;
  }

  const label = [pattern, flags.from && `from:${flags.from}`, flags.to && `to:${flags.to}`]
    .filter(Boolean).join('  ');
  process.stdout.write(`\n${dim(`  ${tags.length} match(es)  ${label}`)}\n\n`);
  process.stdout.write(renderTable(tags));
  process.stdout.write('\n');
}

/** gtm show <tag> [--json] */
function cmdShow(args, flags) {
  requireRepo();
  const tagName = args[0];
  if (!tagName) die('Usage: gtm show <tag>');

  const tags = fetchAllTags();
  const tag  = tags.find(t => t.name === tagName);
  if (!tag) die(`Tag not found: ${tagName}`);

  // get full commit info
  const logR = git(
    'log', '-1',
    '--pretty=format:%H%n%an%n%ae%n%cd%n%n%B',
    '--date=format:%Y-%m-%d %H:%M:%S',
    `${tagName}^{}`,
  );
  const logLines = logR.status === 0 ? logR.stdout.split('\n') : [];

  const commitHash  = logLines[0] || '';
  const authorName  = logLines[1] || '';
  const authorEmail = logLines[2] || '';
  const commitDate  = logLines[3] || '';
  const commitBody  = logLines.slice(5).join('\n').trim();

  if (flags.json) {
    process.stdout.write(JSON.stringify({
      tag: tag.name,
      type: tag.type,
      date: tag.date,
      sha: tag.sha,
      message: tag.msg,
      commit: {
        hash: commitHash,
        author: authorName,
        email: authorEmail,
        date: commitDate,
        body: commitBody,
      },
    }, null, 2) + '\n');
    return;
  }

  process.stdout.write(`
  ${bold(cyan(tag.name))}
  ${dim('─'.repeat(50))}
  ${bold('Type:')}        ${tag.type === 'tag' ? cyan('annotated') : dim('lightweight')}
  ${bold('Date:')}        ${tag.date}
  ${bold('SHA:')}         ${yellow(tag.sha)}
  ${bold('Tag message:')} ${tag.msg || dim('(none)')}

  ${bold('Commit:')}      ${dim(commitHash)}
  ${bold('Author:')}      ${authorName} <${authorEmail}>
  ${bold('Author date:')} ${commitDate}
`);
  if (commitBody) {
    process.stdout.write(`  ${bold('Commit body:')}\n`);
    commitBody.split('\n').forEach(l => process.stdout.write(`    ${l}\n`));
  }
  process.stdout.write('\n');
}

/** gtm batch-delete --older-than <days> [--remote] [--dry-run] [--json] */
function cmdBatchDelete(flags) {
  requireRepo();
  const days = parseInt(flags['older-than'], 10);
  if (!days || days <= 0) die('Usage: gtm batch-delete --older-than <days> [--remote] [--dry-run]');

  const cutoffMs  = Date.now() - days * 86400000;
  const tags      = fetchAllTags();
  const stale     = tags.filter(t => t.dateMs > 0 && t.dateMs < cutoffMs);

  if (!stale.length) {
    if (flags.json) return process.stdout.write(JSON.stringify({ deleted: [], dryRun: !!flags['dry-run'] }) + '\n');
    return process.stdout.write(dim(`\n  No tags older than ${days} days.\n\n`));
  }

  if (flags['dry-run']) {
    if (flags.json) {
      process.stdout.write(JSON.stringify({ wouldDelete: stale.map(t => t.name), dryRun: true }) + '\n');
    } else {
      process.stdout.write(`\n  ${dim(`Dry run — would delete ${stale.length} tag(s) older than ${days} days:`)}\n\n`);
      stale.forEach(t => process.stdout.write(`  ${yellow(t.name)}  ${dim(t.date)}\n`));
      process.stdout.write('\n');
    }
    return;
  }

  const deleted = [];
  const errors  = [];
  const remote  = flags.remote ? getRemote() : null;

  for (const t of stale) {
    const r = git('tag', '-d', t.name);
    if (r.status !== 0) {
      errors.push({ name: t.name, error: r.stderr });
      continue;
    }
    deleted.push(t.name);
    if (!flags.json) process.stdout.write(green(`  deleted  ${bold(t.name)}  ${dim(t.date)}\n`));

    if (remote) {
      const rr = git('push', remote, '--delete', t.name);
      if (rr.status !== 0 && !flags.json) {
        process.stdout.write(yellow(`  warning: remote delete of ${t.name} failed: ${rr.stderr}\n`));
      }
    }
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify({ deleted, errors, remote: remote || null }) + '\n');
  } else {
    process.stdout.write(`\n  ${dim(`Deleted ${deleted.length} of ${stale.length} stale tags.`)}\n\n`);
  }
}

/** gtm --version */
function cmdVersion() {
  process.stdout.write('git-tag-manager 1.0.0\n');
}

/** gtm help */
function cmdHelp() {
  process.stdout.write(`
${bold(cyan('git-tag-manager'))} ${dim('(gtm)')}\n
${bold('USAGE')}
  gtm <command> [options]

${bold('COMMANDS')}
  ${green('list')}                            List all tags (annotated + lightweight)
    ${dim('--sort semver|date|name')}          Sort order (default: semver)
    ${dim('--json')}                           JSON output

  ${green('show')} <tag>                       Show tag details (commit, author, date, message)
    ${dim('--json')}

  ${green('create')} <tag>                     Create a tag
    ${dim('--message "text"')}                 Annotated tag with message
    ${dim('--push')}                           Push to remote after creating
    ${dim('--json')}

  ${green('delete')} <tag>                     Delete a local tag
    ${dim('--remote')}                         Also delete from remote
    ${dim('--json')}

  ${green('push')} [<tag>]                     Push tag(s) to remote
    ${dim('--all')}                            Push all tags
    ${dim('--json')}

  ${green('search')} <pattern>                 Filter tags by name or message (glob/regex)
    ${dim('--from YYYY-MM-DD')}               Only tags on or after this date
    ${dim('--to   YYYY-MM-DD')}               Only tags on or before this date
    ${dim('--json')}

  ${green('batch-delete')}                     Delete multiple stale tags
    ${dim('--older-than <days>')}              Delete tags older than N days
    ${dim('--remote')}                         Also delete from remote
    ${dim('--dry-run')}                        Preview — do not delete
    ${dim('--json')}

  ${green('--version')}, ${green('-V')}                     Show version
  ${green('help')}, ${green('--help')}, ${green('-h')}               Show this help

${bold('EXAMPLES')}
  gtm list
  gtm list --sort date --json
  gtm show v1.2.0
  gtm create v1.3.0 --message "Release 1.3.0" --push
  gtm delete v0.1.0 --remote
  gtm push --all
  gtm search "v1.*"
  gtm search --from 2024-01-01 --to 2024-12-31
  gtm batch-delete --older-than 90 --dry-run
  gtm batch-delete --older-than 90 --remote
`);
}

// ─── ARG PARSER ───────────────────────────────────────────────────────────────

/**
 * Minimal flag parser — no external deps.
 * Returns { positional: string[], flags: Record<string, string|boolean> }.
 */
function parseArgs(argv) {
  const positional = [];
  const flags      = {};
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i += 1;
      }
    } else if (a.startsWith('-') && a.length === 2) {
      flags[a.slice(1)] = true;
      i += 1;
    } else {
      positional.push(a);
      i += 1;
    }
  }
  return { positional, flags };
}

// ─── ENTRYPOINT ───────────────────────────────────────────────────────────────

const { positional, flags } = parseArgs(process.argv.slice(2));
const [cmd, ...args] = positional;

if (flags.version || flags.V) { cmdVersion(); process.exit(0); }

switch (cmd) {
  case 'list':          cmdList(flags);            break;
  case 'show':          cmdShow(args, flags);       break;
  case 'create':        cmdCreate(args, flags);     break;
  case 'delete':        cmdDelete(args, flags);     break;
  case 'push':          cmdPush(args, flags);       break;
  case 'search':        cmdSearch(args, flags);     break;
  case 'batch-delete':  cmdBatchDelete(flags);      break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:       cmdHelp();                  break;
  default:
    process.stderr.write(red(`Unknown command: ${cmd}\nRun "gtm help" for usage.\n`));
    process.exit(1);
}
