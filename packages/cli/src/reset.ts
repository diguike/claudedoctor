/**
 * `claudedoctor reset` — move regenerable Claude caches into a recoverable backup.
 *
 * This is the same operation as scripts/reset-claude-cache.sh, kept in step with it:
 * - an explicit allowlist, so unknown Claude directories are never touched;
 * - files are moved to a timestamped backup, never deleted;
 * - preview is the default, applying needs --apply and a confirmation;
 * - root/sudo is refused, and targets under a symlinked parent are rejected.
 *
 * Deliberately not in the allowlist: skills, plugins, hooks, settings, credentials,
 * conversations, projects, tasks, history, file-history, backups, Claude.app and
 * Claude Desktop's Application Support.
 */
import { appendFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';

/** Paths relative to the home directory. Keep identical to the shell script's allowlist. */
export const RESET_ALLOWLIST: readonly string[] = [
  '.claude/cache',
  '.claude/paste-cache',
  '.claude/session-env',
  '.claude/shell-snapshots',
  '.claude/telemetry',
  '.claude/stats-cache.json',
  '.claude/mcp-needs-auth-cache.json',
];

export const RESET_ALLOWLIST_DARWIN: readonly string[] = [
  'Library/Caches/com.anthropic.claude',
  'Library/Caches/Claude',
  'Library/Logs/Claude',
  'Library/Saved Application State/com.anthropic.claude.savedState',
];

export const RESET_BACKUP_DIR = '.claudedoctor-cleanup-backups';

export interface ResetPlan {
  home: string;
  /** Allowlisted paths (relative to home) that exist right now. */
  targets: string[];
}

export interface ResetResult {
  backupDir: string;
  manifest: string;
  moved: string[];
}

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Every directory between home and the target must be a real directory, not a symlink. */
function assertRealParents(home: string, target: string): void {
  let parent = dirname(target);
  while (parent !== home) {
    if (!parent.startsWith(home + sep)) throw new Error(`目标不在主目录内: ${target}`);
    if (lstatSync(parent).isSymbolicLink()) throw new Error(`拒绝处理：上级目录是符号链接 ${parent}`);
    parent = dirname(parent);
  }
}

export function planReset(homeDir: string, platform: NodeJS.Platform = process.platform): ResetPlan {
  if (!homeDir || !existsSync(homeDir)) throw new Error(`主目录不存在: ${homeDir || '<未设置>'}`);
  const home = realpathSync(homeDir);
  if (dirname(home) === home) throw new Error(`主目录不安全: ${home}`);
  const allow = platform === 'darwin' ? [...RESET_ALLOWLIST, ...RESET_ALLOWLIST_DARWIN] : [...RESET_ALLOWLIST];
  const targets = allow.filter((rel) => exists(join(home, rel)));
  for (const rel of targets) assertRealParents(home, join(home, rel));
  return { home, targets };
}

function stamp(now: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
}

/** Moves every planned target into a fresh backup directory. Throws on the first failure; the manifest records progress. */
export function applyReset(plan: ResetPlan, now: Date = new Date()): ResetResult {
  const base = join(plan.home, RESET_BACKUP_DIR);
  if (exists(base)) {
    const st = lstatSync(base);
    if (st.isSymbolicLink()) throw new Error(`备份目录不能是符号链接: ${base}`);
    if (!st.isDirectory()) throw new Error(`备份路径已存在但不是目录: ${base}`);
  }
  mkdirSync(base, { recursive: true, mode: 0o700 });
  const backupDir = mkdtempSync(join(base, `${stamp(now)}-${process.pid}-`));
  const manifest = join(backupDir, 'manifest.tsv');
  writeFileSync(manifest, 'status\tsource\tbackup\n', { mode: 0o600 });
  const moved: string[] = [];
  for (const rel of plan.targets) {
    const source = join(plan.home, rel);
    const backup = join(backupDir, rel);
    // Re-check right before each move to narrow the symlink race window.
    assertRealParents(plan.home, source);
    mkdirSync(dirname(backup), { recursive: true, mode: 0o700 });
    appendFileSync(manifest, `planned\t${source}\t${backup}\n`);
    renameSync(source, backup);
    appendFileSync(manifest, `moved\t${source}\t${backup}\n`);
    moved.push(rel);
  }
  return { backupDir, manifest, moved };
}

export function isElevated(): boolean {
  return (typeof process.getuid === 'function' && process.getuid() === 0) || Boolean(process.env.SUDO_USER);
}
