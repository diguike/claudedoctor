/**
 * Terminal rendering for the diagnosis — a structured, bordered table plus a
 * prescriptions section. Colors via picocolors (auto-off when not a TTY).
 * Status is shown as an ASCII word (OK/RISK/WARN/INFO) so column widths stay
 * stable regardless of emoji width; CJK cells are width-aware.
 */
import pc from 'picocolors';
import type { Diagnosis, Finding, FindingStatus, HealthLevel } from '@claudedoctor/core';

/** Display width: CJK / fullwidth code points count as 2 columns. */
function dispWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0x303e) ||
      (c >= 0x3041 && c <= 0x33ff) ||
      (c >= 0x3400 && c <= 0x4dbf) ||
      (c >= 0x4e00 && c <= 0x9fff) ||
      (c >= 0xa000 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x20000 && c <= 0x3fffd);
    w += wide ? 2 : 1;
  }
  return w;
}

function truncate(s: string, max: number): string {
  if (dispWidth(s) <= max) return s;
  let out = '';
  let w = 0;
  for (const ch of s) {
    const cw = dispWidth(ch);
    if (w + cw > max - 1) break;
    out += ch;
    w += cw;
  }
  return out + '…';
}

/** Pad `s` (raw) to `width` display columns, then apply color to the content only. */
function cell(s: string, width: number, paint: (t: string) => string = (t) => t): string {
  const clipped = truncate(s, width);
  const pad = ' '.repeat(Math.max(0, width - dispWidth(clipped)));
  return paint(clipped) + pad;
}

const STATUS_WORD: Record<FindingStatus, string> = { risk: 'RISK', warn: 'WARN', ok: 'OK', info: 'INFO' };
function paintStatus(s: FindingStatus): (t: string) => string {
  return { risk: pc.red, warn: pc.yellow, ok: pc.green, info: pc.dim }[s];
}

function healthBadge(level: HealthLevel): string {
  switch (level) {
    case 'at-risk':
      return pc.bold(pc.red('✗ AT-RISK'));
    case 'attention':
      return pc.bold(pc.yellow('⚠ ATTENTION'));
    case 'healthy':
      return pc.bold(pc.green('✓ HEALTHY'));
  }
}

function verdictTag(f: Finding): string {
  const parts: string[] = [f.confidence];
  if (f.classLabel) parts.push(f.classLabel);
  else if (f.causal) parts.push('因果');
  else if (f.status === 'info') parts.push('氛围');
  return parts.join('·');
}

// column display widths
const C = { status: 4, signal: 22, verdict: 46, tag: 18 };

function hr(l: string, m: string, r: string): string {
  return '  ' + pc.dim(l + '─'.repeat(C.status + 2) + m + '─'.repeat(C.signal + 2) + m + '─'.repeat(C.verdict + 2) + m + '─'.repeat(C.tag + 2) + r);
}
function row(a: string, b: string, c: string, d: string): string {
  const bar = pc.dim('│');
  return `  ${bar} ${a} ${bar} ${b} ${bar} ${c} ${bar} ${d} ${bar}`;
}

export function renderDiagnosis(dx: Diagnosis, opts: { why: boolean }): string {
  const out: string[] = [];
  const { summary } = dx;

  out.push('');
  out.push(pc.bold('🩺  Claude Doctor · 体检报告'));
  out.push('');
  out.push(`  健康度  ${healthBadge(summary.level)}   ${summary.headline}`);
  out.push(
    pc.dim(`  确认风险 ${summary.riskCount} · 需注意 ${summary.warnCount} · 正常 ${summary.okCount} · 提示 ${summary.infoCount}`),
  );
  out.push('');

  // table
  out.push(hr('┌', '┬', '┐'));
  out.push(
    row(
      cell('状态', C.status, pc.bold),
      cell('信号', C.signal, pc.bold),
      cell('结论', C.verdict, pc.bold),
      cell('判定', C.tag, pc.bold),
    ),
  );
  out.push(hr('├', '┼', '┤'));
  for (const f of dx.findings) {
    out.push(
      row(
        cell(STATUS_WORD[f.status], C.status, paintStatus(f.status)),
        cell(f.title, C.signal, pc.bold),
        cell(f.summary, C.verdict),
        cell(verdictTag(f), C.tag, pc.dim),
      ),
    );
  }
  out.push(hr('└', '┴', '┘'));

  // prescriptions + (optional) details, below the table
  const rx = dx.findings.filter((f) => f.fix || (opts.why && f.detail));
  if (rx.length) {
    out.push('');
    out.push(pc.dim('  详情与开药:'));
    for (const f of rx) {
      const mark = paintStatus(f.status)(STATUS_WORD[f.status]);
      out.push(`  ${mark} ${pc.bold(f.title)}`);
      if (opts.why && f.detail) out.push(pc.dim(`     ${f.detail}`));
      if (opts.why && f.evidence.length) out.push(pc.dim(`     出处: ${f.evidence.join('  ')}`));
      if (f.fix) {
        out.push(pc.cyan(`     药方: ${f.fix.title}`));
        for (const cmd of f.fix.commands) out.push(`       ${pc.green('$')} ${cmd}`);
        if (f.fix.note) out.push(pc.dim(`       ${f.fix.note}`));
      }
    }
  }

  out.push('');
  const hints: string[] = [];
  if (!opts.why) hints.push('--why 展开出处与说明');
  hints.push('--net 联网体检出口 IP');
  hints.push('fix 勾选并执行修复');
  out.push(pc.dim(`  提示: ${hints.join(' · ')}`));
  out.push(pc.dim('  判定说明: confirmed=官方证实 · reported=社区报告 · 因果=有服务端因果 · 画像因子/氛围=不计入风险分'));
  out.push('');

  return out.join('\n');
}
