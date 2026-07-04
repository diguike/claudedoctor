/**
 * Terminal rendering for the diagnosis. Narrative: 体检 → (开药). Colors via
 * picocolors; degrades gracefully when stdout is not a TTY.
 */
import pc from 'picocolors';
import type { Diagnosis, Finding, FindingStatus, HealthLevel } from '@claudedoctor/core';

const STATUS_ICON: Record<FindingStatus, string> = { risk: '✗', warn: '⚠', ok: '✓', info: 'ⓘ' };

function paintStatus(s: FindingStatus, text: string): string {
  switch (s) {
    case 'risk':
      return pc.red(text);
    case 'warn':
      return pc.yellow(text);
    case 'ok':
      return pc.green(text);
    case 'info':
      return pc.dim(text);
  }
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

function tag(f: Finding): string {
  const parts: string[] = [f.confidence];
  if (f.classLabel) parts.push(f.classLabel);
  else if (f.causal) parts.push('因果');
  else if (f.status === 'info') parts.push('氛围');
  return pc.dim(`[${parts.join('·')}]`);
}

const PAD = 18;
function padTitle(title: string): string {
  // account for CJK width roughly (each CJK ~2 cols)
  const width = [...title].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e7f ? 2 : 1), 0);
  return title + ' '.repeat(Math.max(1, PAD - width));
}

export function renderDiagnosis(dx: Diagnosis, opts: { why: boolean }): string {
  const out: string[] = [];
  const { summary } = dx;

  out.push('');
  out.push(pc.bold('🩺  Claude Doctor · 体检报告'));
  out.push('');
  out.push(`   健康度  ${healthBadge(summary.level)}   ${summary.headline}`);
  out.push(
    pc.dim(
      `   确认风险 ${summary.riskCount} · 需注意 ${summary.warnCount} · 正常 ${summary.okCount} · 提示 ${summary.infoCount}`,
    ),
  );
  out.push('');
  out.push(pc.dim('   信号:'));

  for (const f of dx.findings) {
    const icon = paintStatus(f.status, STATUS_ICON[f.status]);
    out.push(`   ${icon} ${pc.bold(padTitle(f.title))} ${f.summary}  ${tag(f)}`);
    if (opts.why && f.detail) {
      out.push(pc.dim(`      ↳ ${f.detail}`));
    }
    if (opts.why && f.evidence.length) {
      out.push(pc.dim(`      出处: ${f.evidence.join('  ')}`));
    }
    if (f.fix) {
      out.push(pc.cyan(`      药方: ${f.fix.title}`));
      for (const cmd of f.fix.commands) {
        out.push(`        ${pc.green('$')} ${cmd}`);
      }
      if (f.fix.note) out.push(pc.dim(`        ${f.fix.note}`));
    }
  }

  out.push('');
  const hints: string[] = [];
  if (!opts.why) hints.push('--why 展开出处与说明');
  hints.push('--net 体检出口 IP/地区（会联网）');
  hints.push('fix 查看可执行修复');
  out.push(pc.dim(`   提示: ${hints.join(' · ')}`));
  out.push('');

  return out.join('\n');
}
