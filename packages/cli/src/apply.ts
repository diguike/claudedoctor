/**
 * Apply layer for `claudedoctor fix`. Turns a set of selected fixes into a
 * single MANAGED block in the user's shell profile — clearly delimited, backed
 * up before every write, and fully removable via `fix --revert`. We never touch
 * the user's own lines; everything we add lives between our markers.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Fix } from '@claudedoctor/core';

const BEGIN = '# >>> claudedoctor >>>';
const END = '# <<< claudedoctor <<<';

/** Best-effort shell profile for the current shell (override with CLAUDEDOCTOR_PROFILE). */
export function detectProfile(): string {
  if (process.env.CLAUDEDOCTOR_PROFILE) return process.env.CLAUDEDOCTOR_PROFILE;
  const home = homedir();
  const shell = process.env.SHELL ?? '';
  if (shell.includes('zsh')) return join(home, '.zshrc');
  if (shell.includes('bash')) {
    return existsSync(join(home, '.bashrc')) ? join(home, '.bashrc') : join(home, '.bash_profile');
  }
  return join(home, '.profile');
}

/** Turn selected fixes into ordered shell lines (unset first, then exports). */
export function blockLines(fixes: Fix[]): string[] {
  const unset = new Set<string>();
  const set = new Map<string, string>();
  const raw: string[] = [];
  for (const f of fixes) {
    for (const k of f.apply?.unset ?? []) unset.add(k);
    for (const [k, v] of Object.entries(f.apply?.set ?? {})) set.set(k, v);
    for (const l of f.apply?.raw ?? []) if (!raw.includes(l)) raw.push(l);
  }
  // If a var is both set and unset, the explicit `set` wins (drop it from unset).
  for (const k of set.keys()) unset.delete(k);
  const lines: string[] = [];
  for (const k of unset) lines.push(`unset ${k}`);
  for (const [k, v] of set) lines.push(`export ${k}=${v}`);
  lines.push(...raw);
  return lines;
}

function stripBlock(text: string): string {
  const b = text.indexOf(BEGIN);
  const e = text.indexOf(END);
  if (b === -1 || e === -1 || e < b) return text;
  const before = text.slice(0, b).replace(/\n+$/, '\n');
  const after = text.slice(e + END.length).replace(/^\n+/, '\n');
  return (before + after).replace(/\n{3,}/g, '\n\n');
}

export interface ApplyResult {
  profile: string;
  backup: string | null;
  lines: string[];
  removed: boolean;
}

function backup(profile: string): string | null {
  if (!existsSync(profile)) return null;
  const bak = `${profile}.claudedoctor.bak`;
  copyFileSync(profile, bak);
  return bak;
}

/** Write/replace the managed block. Returns what happened (for reporting). */
export function applyToProfile(fixes: Fix[], profile = detectProfile()): ApplyResult {
  const lines = blockLines(fixes);
  const bak = backup(profile);
  const current = existsSync(profile) ? readFileSync(profile, 'utf8') : '';
  const base = stripBlock(current).replace(/\n+$/, '');
  const block = [BEGIN + '  (claudedoctor fix 管理；移除用 `claudedoctor fix --revert`)', ...lines, END].join('\n');
  const next = (base ? base + '\n\n' : '') + block + '\n';
  writeFileSync(profile, next);
  return { profile, backup: bak, lines, removed: false };
}

/** Remove the managed block entirely. */
export function revertProfile(profile = detectProfile()): ApplyResult {
  if (!existsSync(profile)) return { profile, backup: null, lines: [], removed: false };
  const current = readFileSync(profile, 'utf8');
  if (!current.includes(BEGIN)) return { profile, backup: null, lines: [], removed: false };
  const bak = backup(profile);
  writeFileSync(profile, stripBlock(current).replace(/\n+$/, '') + '\n');
  return { profile, backup: bak, lines: [], removed: true };
}

/** Eval-able lines for `eval "$(claudedoctor fix --session)"` (no file edit). */
export function sessionScript(fixes: Fix[]): string {
  return blockLines(fixes).join('\n');
}
