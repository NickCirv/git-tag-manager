#!/usr/bin/env node

import { spawnSync, execFileSync } from 'child_process';
import * as readline from 'readline';
import { stdout, stdin, exit } from 'process';

// ─── ANSI ────────────────────────────────────────────────────────────────────

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
  bgBlue:  '\x1b[44m',
  bgBlack: '\x1b[40m',
};

const color  = (c, s) => `${c}${s}${C.reset}`;
const bold   = (s)    => color(C.bold, s);
const dim    = (s)    => color(C.dim, s);
const red    = (s)    => color(C.red, s);
const green  = (s)    => color(C.green, s);
const yellow = (s)    => color(C.yellow, s);
const cyan   = (s)    => color(C.cyan, s);
const blue   = (s)    => color(C.blue, s);

// ─── GIT HELPERS ─────────────────────────────────────────────────────────────

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.error) throw new Error(`git not found: ${result.error.message}`);
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim(), status: result.status };
}

function gitOrDie(...args) {
  const r = git(...args);
  if (r.status !== 0) {
    console.error(red(`git ${args[0]} failed: ${r.stderr || r.stdout}`));
    exit(1);
  }
  return r.stdout;
}

function isGitRepo() {
  const r = git('rev-parse', '--is-inside-work-tree');
  return r.status === 0;
}

function semverParts(tag) {
  const clean = tag.replace(/^v/i, '');
  const parts = clean.split('.').map(p => parseInt(p, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function semverSort(tags) {
  const looksLikeSemver = (t) => /^v?\d+\.\d+/.test(t);
  const semver = tags.filter(looksLikeSemver);
  const other  = tags.filter(t => !looksLikeSemver(t));

  semver.sort((a, b) => {
    const [a0, a1, a2] = semverParts(a);
    const [b0, b1, b2] = semverParts(b);
    if (b0 !== a0) return b0 - a0;
    if (b1 !== a1) return b1 - a1;
    return b2 - a2;
  });

  other.sort((a, b) => a.localeCompare(b));
  return [...semver, ...other];
}

function fetchTags() {
  const raw = git('tag', '--sort=-creatordate',
    '--format=%(refname:short)|%(creatordate:short)|%(objecttype)|%(*objectname)|%(objectname)|%(contents:subject)');

  if (raw.status !== 0 || !raw.stdout) return [];

  const lines = raw.stdout.split('\n').filter(Boolean);
  const tags = lines.map(line => {
    const parts = line.split('|');
    const name    = parts[0] || '';
    const date    = parts[1] || '';
    const type    = parts[2] || '';
    const objHash = parts[3] || parts[4] || '';
    const sha     = objHash.slice(0, 7);
    const msg     = parts.slice(5).join('|').trim() || dim('(no message)');
    return { name, date, sha, msg, type };
  });

  return tags;
}

function getRemote() {
  const r = git('remote');
  return r.stdout.split('\n').filter(Boolean)[0] || 'origin';
}

// ─── TABLE RENDERER ──────────────────────────────────────────────────────────

function padEnd(str, len) {
  // strip ansi codes for length calc
  const plain = str.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = Math.max(0, len - plain.length);
  return str + ' '.repeat(pad);
}

function renderTable(tags, { highlightIdx = -1 } = {}) {
  if (!tags.length) {
    return dim('  No tags found in this repository.\n');
  }

  const colWidths = {
    name: Math.min(30, Math.max(4, ...tags.map(t => t.name.length))),
    date: 10,
    sha:  7,
    msg:  40,
  };

  const header = [
    padEnd(bold('TAG'),     colWidths.name),
    padEnd(bold('DATE'),    colWidths.date),
    padEnd(bold('SHA'),     colWidths.sha),
    padEnd(bold('MESSAGE'), colWidths.msg),
  ].join('  ');

  const sep = dim('─'.repeat(colWidths.name + colWidths.date + colWidths.sha + colWidths.msg + 6));

  const rows = tags.map((t, i) => {
    const isHl = i === highlightIdx;
    const prefix  = isHl ? color(C.cyan, '▶ ') : '  ';
    const rowName = isHl ? bold(cyan(padEnd(t.name, colWidths.name))) : padEnd(green(t.name), colWidths.name);
    const rowDate = padEnd(dim(t.date), colWidths.date);
    const rowSha  = padEnd(yellow(t.sha), colWidths.sha);
    const rawMsg  = t.msg.replace(/\x1b\[[0-9;]*m/g, '');
    const msgTrunc = rawMsg.length > colWidths.msg ? rawMsg.slice(0, colWidths.msg - 1) + '…' : rawMsg;
    const rowMsg  = padEnd(msgTrunc, colWidths.msg);
    return `${prefix}${rowName}  ${rowDate}  ${rowSha}  ${rowMsg}`;
  });

  return [header, sep, ...rows].join('\n') + '\n';
}

// ─── TUI ─────────────────────────────────────────────────────────────────────

function clearScreen() {
  stdout.write('\x1b[2J\x1b[H');
}

function moveCursor(row, col) {
  stdout.write(`\x1b[${row};${col}H`);
}

function hideCursor() { stdout.write('\x1b[?25l'); }
function showCursor() { stdout.write('\x1b[?25h'); }

function renderTUI(tags, idx, statusMsg) {
  clearScreen();
  const title = bold(cyan('  git-tag-manager')) + dim(' — interactive tag browser');
  const keys  = dim('  ↑↓ navigate  Enter=details  n=new  d=delete  p=push  r=refresh  q=quit');
  console.log(title);
  console.log(keys);
  console.log();
  console.log(renderTable(tags, { highlightIdx: idx }));

  if (statusMsg) {
    console.log();
    console.log(`  ${statusMsg}`);
  }
}

function showTagDetail(tag) {
  clearScreen();
  console.log(bold(cyan(`\n  Tag: ${tag.name}`)));
  console.log(dim('  ──────────────────────────────'));
  console.log(`  ${bold('Date:')}    ${tag.date}`);
  console.log(`  ${bold('SHA:')}     ${yellow(tag.sha)}`);
  console.log(`  ${bold('Type:')}    ${tag.type}`);
  console.log(`  ${bold('Message:')} ${tag.msg}`);

  // full commit info
  const logR = git('log', '-1', '--pretty=format:%an <%ae>%n%cd%n%n%B',
    '--date=format:%Y-%m-%d %H:%M:%S', tag.name + '^{}' || tag.name);
  if (logR.status === 0 && logR.stdout) {
    const lines = logR.stdout.split('\n');
    console.log(`  ${bold('Author:')}  ${lines[0] || ''}`);
    console.log(`  ${bold('Commit:')}  ${lines[1] || ''}`);
    if (lines[3]) {
      console.log();
      console.log(dim('  Commit message:'));
      lines.slice(3).filter(Boolean).forEach(l => console.log(`    ${l}`));
    }
  }

  console.log();
  console.log(dim('  Press any key to return…'));
}

async function prompt(question) {
  showCursor();
  const rl = readline.createInterface({ input: stdin, output: stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      hideCursor();
      resolve(answer.trim());
    });
  });
}

async function confirmPrompt(question) {
  const answer = await prompt(`${question} ${dim('[y/N]')} `);
  return answer.toLowerCase() === 'y';
}

async function interactiveMode() {
  if (!isGitRepo()) {
    console.error(red('Not a git repository.'));
    exit(1);
  }

  hideCursor();

  let tags     = semverSort(fetchTags().map(t => t.name)).map(name => {
    return fetchTags().find(t => t.name === name) || { name, date: '', sha: '', msg: '', type: '' };
  });
  // dedupe
  tags = fetchTags();
  tags = semverSort(tags.map(t => t.name)).map(name => tags.find(t => t.name === name));

  let idx       = 0;
  let statusMsg = '';
  let running   = true;

  renderTUI(tags, idx, statusMsg);

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  const cleanup = () => {
    stdin.setRawMode(false);
    stdin.pause();
    showCursor();
    clearScreen();
  };

  const refresh = () => {
    tags = fetchTags();
    tags = semverSort(tags.map(t => t.name)).map(name => tags.find(t => t.name === name));
    if (idx >= tags.length) idx = Math.max(0, tags.length - 1);
    renderTUI(tags, idx, statusMsg);
  };

  await new Promise(resolve => {
    stdin.on('data', async (key) => {
      if (!running) return;

      // ctrl+c / q
      if (key === '\u0003' || key === 'q') {
        running = false;
        cleanup();
        resolve();
        return;
      }

      // up arrow
      if (key === '\u001b[A' || key === 'k') {
        idx = Math.max(0, idx - 1);
        renderTUI(tags, idx, statusMsg);
        return;
      }

      // down arrow
      if (key === '\u001b[B' || key === 'j') {
        idx = Math.min(tags.length - 1, idx + 1);
        renderTUI(tags, idx, statusMsg);
        return;
      }

      // enter — details
      if (key === '\r' || key === '\n') {
        if (!tags.length) return;
        showTagDetail(tags[idx]);
        await new Promise(r => stdin.once('data', r));
        renderTUI(tags, idx, statusMsg);
        return;
      }

      // r — refresh
      if (key === 'r') {
        statusMsg = dim('Refreshed.');
        refresh();
        return;
      }

      // n — new tag
      if (key === 'n') {
        stdin.setRawMode(false);
        clearScreen();
        const tagName = await prompt(bold('\n  New tag name: '));
        if (!tagName) {
          stdin.setRawMode(true);
          statusMsg = red('Cancelled.');
          renderTUI(tags, idx, statusMsg);
          return;
        }
        const msg = await prompt(bold(`  Message (optional, enter for lightweight): `));
        const doPush = await confirmPrompt(bold('  Push to remote?'));
        stdin.setRawMode(true);

        try {
          if (msg) {
            gitOrDie('tag', '-a', tagName, '-m', msg);
          } else {
            gitOrDie('tag', tagName);
          }
          if (doPush) {
            const remote = getRemote();
            gitOrDie('push', remote, tagName);
            statusMsg = green(`Created and pushed tag ${tagName}.`);
          } else {
            statusMsg = green(`Created tag ${tagName}.`);
          }
        } catch (e) {
          statusMsg = red(String(e.message));
        }
        refresh();
        return;
      }

      // d — delete
      if (key === 'd') {
        if (!tags.length) return;
        const tag = tags[idx];
        stdin.setRawMode(false);
        clearScreen();
        const doRemote = await confirmPrompt(bold(`\n  Delete "${tag.name}" from remote too?`));
        const confirmed = await confirmPrompt(bold(`  Confirm delete local tag "${tag.name}"?`));
        stdin.setRawMode(true);

        if (!confirmed) {
          statusMsg = dim('Delete cancelled.');
          renderTUI(tags, idx, statusMsg);
          return;
        }

        try {
          gitOrDie('tag', '-d', tag.name);
          if (doRemote) {
            const remote = getRemote();
            const r = git('push', remote, '--delete', tag.name);
            if (r.status !== 0) {
              statusMsg = yellow(`Local tag deleted. Remote: ${r.stderr || 'failed'}`);
            } else {
              statusMsg = green(`Deleted local + remote tag ${tag.name}.`);
            }
          } else {
            statusMsg = green(`Deleted local tag ${tag.name}.`);
          }
        } catch (e) {
          statusMsg = red(String(e.message));
        }
        refresh();
        return;
      }

      // p — push
      if (key === 'p') {
        if (!tags.length) return;
        const tag = tags[idx];
        const remote = getRemote();
        try {
          gitOrDie('push', remote, tag.name);
          statusMsg = green(`Pushed ${tag.name} to ${remote}.`);
        } catch (e) {
          statusMsg = red(String(e.message));
        }
        renderTUI(tags, idx, statusMsg);
        return;
      }
    });
  });
}

// ─── CLI COMMANDS ─────────────────────────────────────────────────────────────

function cmdList() {
  if (!isGitRepo()) { console.error(red('Not a git repository.')); exit(1); }
  const tags = fetchTags();
  if (!tags.length) { console.log(dim('No tags found.')); return; }
  const sorted = semverSort(tags.map(t => t.name)).map(name => tags.find(t => t.name === name));
  console.log('\n' + renderTable(sorted));
}

function cmdCreate(args) {
  if (!isGitRepo()) { console.error(red('Not a git repository.')); exit(1); }
  const tagName = args[0];
  if (!tagName) { console.error(red('Usage: gtm create <tag> [--message "..."] [--push]')); exit(1); }

  const msgIdx = args.indexOf('--message');
  const msg    = msgIdx !== -1 ? args[msgIdx + 1] : null;
  const doPush = args.includes('--push');

  if (msg) {
    gitOrDie('tag', '-a', tagName, '-m', msg);
  } else {
    gitOrDie('tag', tagName);
  }
  console.log(green(`✓ Created tag ${bold(tagName)}`));

  if (doPush) {
    const remote = getRemote();
    gitOrDie('push', remote, tagName);
    console.log(green(`✓ Pushed to ${remote}`));
  }
}

function cmdDelete(args) {
  if (!isGitRepo()) { console.error(red('Not a git repository.')); exit(1); }
  const tagName = args[0];
  if (!tagName) { console.error(red('Usage: gtm delete <tag> [--remote]')); exit(1); }
  const doRemote = args.includes('--remote');

  gitOrDie('tag', '-d', tagName);
  console.log(green(`✓ Deleted local tag ${bold(tagName)}`));

  if (doRemote) {
    const remote = getRemote();
    const r = git('push', remote, '--delete', tagName);
    if (r.status !== 0) {
      console.error(yellow(`⚠ Remote delete failed: ${r.stderr}`));
    } else {
      console.log(green(`✓ Deleted remote tag from ${remote}`));
    }
  }
}

function cmdPush(args) {
  if (!isGitRepo()) { console.error(red('Not a git repository.')); exit(1); }
  const remote = getRemote();
  if (args.includes('--all')) {
    gitOrDie('push', remote, '--tags');
    console.log(green(`✓ Pushed all tags to ${remote}`));
  } else {
    // push tags not yet on remote
    const localTags  = git('tag').stdout.split('\n').filter(Boolean);
    const remoteTags = git('ls-remote', '--tags', remote).stdout
      .split('\n').filter(Boolean)
      .map(l => l.split('/').pop().replace(/\^\{\}$/, ''));

    const missing = localTags.filter(t => !remoteTags.includes(t));
    if (!missing.length) {
      console.log(dim('All tags already pushed.'));
      return;
    }
    missing.forEach(t => {
      gitOrDie('push', remote, t);
      console.log(green(`✓ Pushed ${t}`));
    });
  }
}

function cmdSearch(args) {
  if (!isGitRepo()) { console.error(red('Not a git repository.')); exit(1); }
  const pattern = args[0];
  if (!pattern) { console.error(red('Usage: gtm search <pattern>')); exit(1); }

  const tags = fetchTags();
  const re   = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
  const matches = tags.filter(t => re.test(t.name) || re.test(t.msg));

  if (!matches.length) {
    console.log(dim(`No tags matching "${pattern}".`));
    return;
  }

  const sorted = semverSort(matches.map(t => t.name)).map(name => matches.find(t => t.name === name));
  console.log(`\n${dim(`Found ${sorted.length} tag(s) matching "${pattern}":\n`)}`);
  console.log(renderTable(sorted));
}

function cmdCompare(args) {
  if (!isGitRepo()) { console.error(red('Not a git repository.')); exit(1); }
  const [tag1, tag2] = args;
  if (!tag1 || !tag2) { console.error(red('Usage: gtm compare <tag1> <tag2>')); exit(1); }

  console.log(`\n${bold('Diff stats:')} ${cyan(tag1)} → ${cyan(tag2)}\n`);

  const stat = git('diff', '--stat', `${tag1}...${tag2}`);
  if (stat.status !== 0) { console.error(red(stat.stderr)); exit(1); }
  console.log(stat.stdout || dim('No differences.'));

  const logR = git('log', '--oneline', `${tag1}...${tag2}`);
  if (logR.stdout) {
    const commits = logR.stdout.split('\n').filter(Boolean);
    console.log(`\n${bold(`Commits between ${tag1} and ${tag2}:`)} ${dim(`(${commits.length})`)}\n`);
    commits.forEach(c => {
      const sha = c.slice(0, 7);
      const msg = c.slice(8);
      console.log(`  ${yellow(sha)}  ${msg}`);
    });
  }
}

function cmdLatest() {
  if (!isGitRepo()) { console.error(red('Not a git repository.')); exit(1); }
  const tags = fetchTags();
  if (!tags.length) { console.log(dim('No tags found.')); return; }
  const sorted = semverSort(tags.map(t => t.name));
  const name   = sorted[0];
  const tag    = tags.find(t => t.name === name);

  console.log();
  console.log(`${bold('Latest tag:')} ${green(tag.name)}`);
  console.log(`${bold('Date:')}       ${dim(tag.date)}`);
  console.log(`${bold('SHA:')}        ${yellow(tag.sha)}`);
  console.log(`${bold('Message:')}    ${tag.msg}`);
  console.log();
}

function cmdHelp() {
  console.log(`
${bold(cyan('git-tag-manager'))} ${dim('v1.0.0')} — Interactive TUI for git tags

${bold('USAGE')}
  gtm                         Open interactive TUI
  gtm <command> [options]

${bold('COMMANDS')}
  ${cyan('list')}                        List all tags in a table
  ${cyan('create')} <tag>                Create a new tag
    --message "..."             Annotated tag with message
    --push                      Push to remote after creating
  ${cyan('delete')} <tag>                Delete a tag
    --remote                    Also delete from remote
  ${cyan('push')} [--all]                Push unpushed tags (or all)
  ${cyan('search')} <pattern>            Filter tags by name or message
  ${cyan('compare')} <tag1> <tag2>       Diff stats between two tags
  ${cyan('latest')}                      Show the most recent tag
  ${cyan('help')}                        Show this help

${bold('INTERACTIVE TUI KEYS')}
  ↑ / k     Navigate up
  ↓ / j     Navigate down
  Enter     Show tag details
  n         Create new tag
  d         Delete selected tag
  p         Push selected tag
  r         Refresh list
  q / ^C    Quit

${bold('EXAMPLES')}
  gtm
  gtm list
  gtm create v1.2.0 --message "Release 1.2.0" --push
  gtm delete v0.1.0 --remote
  gtm push --all
  gtm search "v1.*"
  gtm compare v1.0.0 v1.1.0
  gtm latest
`);
}

// ─── ENTRYPOINT ──────────────────────────────────────────────────────────────

const [,, cmd, ...rest] = process.argv;

switch (cmd) {
  case 'list':    cmdList();          break;
  case 'create':  cmdCreate(rest);    break;
  case 'delete':  cmdDelete(rest);    break;
  case 'push':    cmdPush(rest);      break;
  case 'search':  cmdSearch(rest);    break;
  case 'compare': cmdCompare(rest);   break;
  case 'latest':  cmdLatest();        break;
  case 'help':
  case '--help':
  case '-h':      cmdHelp();          break;
  default:        interactiveMode();  break;
}
