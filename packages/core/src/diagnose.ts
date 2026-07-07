/**
 * Orchestrator: run every detector over the sanitized input and roll the
 * findings up into a categorized health level. Deliberately NOT a 0-100 fear
 * score (CLAUDE.md §0, §7) — just healthy / attention / at-risk with counts.
 */
import { DETECTORS } from './signals.js';
import type { Diagnosis, DoctorInput, Finding, HealthLevel } from './types.js';

function summarize(findings: Finding[]): Diagnosis['summary'] {
  const scored = findings.filter((f) => f.scored);
  const riskCount = scored.filter((f) => f.status === 'risk').length;
  const warnCount = scored.filter((f) => f.status === 'warn').length;
  const okCount = findings.filter((f) => f.status === 'ok').length;
  const infoCount = findings.filter((f) => f.status === 'info').length;

  let level: HealthLevel;
  let headline: string;
  if (riskCount > 0) {
    level = 'at-risk';
    headline = `发现 ${riskCount} 项已确认的封号向量，建议尽快按开药处理`;
  } else if (warnCount > 0) {
    level = 'attention';
    headline = `有 ${warnCount} 项需要注意（非确定封号，但有因果或卫生问题）`;
  } else {
    level = 'healthy';
    headline = '未见已知高置信封号向量；不等于风险为零';
  }

  return { level, riskCount, warnCount, okCount, infoCount, headline };
}

/** Rank findings for display: risk → warn → ok → info; scored before unscored. */
const STATUS_ORDER = { risk: 0, warn: 1, ok: 2, info: 3 } as const;

export function diagnose(input: DoctorInput): Diagnosis {
  const findings = DETECTORS.map((d) => d(input)).filter((f): f is Finding => f !== null);
  findings.sort((a, b) => {
    if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) {
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    }
    return Number(b.scored) - Number(a.scored);
  });
  return { findings, summary: summarize(findings) };
}
