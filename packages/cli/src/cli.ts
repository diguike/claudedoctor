/**
 * claudedoctor / cdoc — CLI entry.
 * Narrative: check（体检）→ fix（开药）→ verify（复诊）.
 */
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { readFileSync } from 'node:fs';
import { diagnose, type DoctorInput, type Finding } from '@claudedoctor/core';
import { collect } from './collect.js';
import { probeNetwork, activeProviderName } from './probe.js';
import { renderDiagnosis } from './render.js';
import { verifyDateLine } from './verify.js';
import { applyToProfile, blockLines, detectProfile, revertProfile, sessionScript } from './apply.js';

const BANNER = pc.bold('🩺  Claude Doctor') + pc.dim(' (claudedoctor / cdoc)');
const VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
})();

interface Flags {
  why: boolean;
  net: boolean;
  json: boolean;
  revert: boolean;
  dryRun: boolean;
  all: boolean;
  session: boolean;
  yes: boolean;
  help: boolean;
  version: boolean;
}

export function parseFlags(args: string[]): { rest: string[]; flags: Flags; error: string | null } {
  const flags: Flags = {
    why: false,
    net: false,
    json: false,
    revert: false,
    dryRun: false,
    all: false,
    session: false,
    yes: false,
    help: false,
    version: false,
  };
  const rest: string[] = [];
  let error: string | null = null;
  for (const a of args) {
    if (a === '--why' || a === '-w') flags.why = true;
    else if (a === '--net' || a === '--online') flags.net = true;
    else if (a === '--json') flags.json = true;
    else if (a === '--revert' || a === '--undo') flags.revert = true;
    else if (a === '--dry-run' || a === '-n') flags.dryRun = true;
    else if (a === '--all') flags.all = true;
    else if (a === '--session') flags.session = true;
    else if (a === '--yes' || a === '-y') flags.yes = true;
    else if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--version' || a === '-v') flags.version = true;
    else if (a.startsWith('-')) error ??= `未知选项: ${a}`;
    else rest.push(a);
  }
  return { rest, flags, error };
}

function reportJson(dx: ReturnType<typeof diagnose>): object {
  return { schemaVersion: 1, toolVersion: VERSION, ...dx };
}

function diagnosisExitCode(dx: ReturnType<typeof diagnose>): number {
  return dx.summary.riskCount > 0 ? 2 : dx.summary.warnCount > 0 ? 1 : 0;
}

async function buildInput(flags: Flags): Promise<DoctorInput> {
  const input = collect();
  if (flags.net) {
    if (!flags.json) {
      process.stderr.write(
        pc.dim(`   （--net 已开启：将通过 ${activeProviderName()} 查询出口 IP/地区/代理，这会把你的 IP 告知该第三方）\n`),
      );
      if (!process.env.IPDATA_API_KEY) {
        process.stderr.write(pc.dim('   （默认已含 VPN/代理/机房/威胁判定，无需任何 key；如想改用 ipdata.co 可设 IPDATA_API_KEY）\n'));
      }
    }
    input.network = await probeNetwork();
    input.networkProbe = input.network ? 'complete' : 'failed';
  }
  return input;
}

async function cmdCheck(flags: Flags): Promise<number> {
  const input = await buildInput(flags);
  const dx = diagnose(input);
  if (flags.json) {
    process.stdout.write(JSON.stringify(reportJson(dx), null, 2) + '\n');
    return diagnosisExitCode(dx);
  }
  process.stdout.write(renderDiagnosis(dx, { why: flags.why }));
  return diagnosisExitCode(dx);
}

function printManual(manual: Finding[]): void {
  if (manual.length === 0) return;
  process.stdout.write(pc.dim('  需手动处理（无法安全自动应用）:\n'));
  for (const f of manual) {
    const mark = f.status === 'risk' ? pc.red('✗') : f.status === 'warn' ? pc.yellow('⚠') : pc.dim('ⓘ');
    process.stdout.write(`  ${mark} ${pc.bold(f.title)} — ${f.fix!.title}\n`);
    for (const cmd of f.fix!.commands) process.stdout.write(`      ${pc.green('$')} ${cmd}\n`);
    if (f.fix!.note) process.stdout.write(pc.dim(`      ${f.fix!.note}\n`));
  }
  process.stdout.write('\n');
}

async function cmdFix(flags: Flags): Promise<number> {
  // 撤销：移除 shell profile 里的托管块
  if (flags.revert) {
    const r = revertProfile();
    process.stdout.write('\n' + BANNER + pc.bold(' · 撤销修复') + '\n\n');
    if (r.removed) {
      process.stdout.write(pc.green(`  ✓ 已移除 ${r.profile} 中的 claudedoctor 托管块`) + pc.dim(`（备份：${r.backup}）\n`));
      process.stdout.write(pc.dim(`  重开终端或 \`source ${r.profile}\` 生效。\n\n`));
    } else {
      process.stdout.write(pc.dim(`  未发现 claudedoctor 托管块（${r.profile}），无需撤销。\n\n`));
    }
    return 0;
  }

  const input = await buildInput(flags);
  const dx = diagnose(input);
  const auto = dx.findings.filter((f) => f.fix?.apply);
  const manual = dx.findings.filter((f) => f.fix && !f.fix.apply);

  if (flags.json) {
    process.stdout.write(
      JSON.stringify(
        { schemaVersion: 1, toolVersion: VERSION, fixes: dx.findings.filter((f) => f.fix) },
        null,
        2,
      ) + '\n',
    );
    return 0;
  }

  // --session：只把可 eval 的行打到 stdout，供 `eval "$(claudedoctor fix --session)"`
  if (flags.session) {
    process.stdout.write(sessionScript(auto.map((f) => f.fix!)) + '\n');
    return 0;
  }

  process.stdout.write('\n' + BANNER + pc.bold(' · 开药') + '\n\n');
  if (auto.length === 0 && manual.length === 0) {
    process.stdout.write(pc.green('  ✓ 没有需要处理的项，当前配置健康。\n\n'));
    return 0;
  }
  printManual(manual);
  if (auto.length === 0) return 0;

  const interactive = Boolean(process.stdout.isTTY && process.stdin.isTTY) && !flags.dryRun && !flags.all;

  let chosen: Finding[];
  if (flags.all) {
    chosen = auto;
  } else if (!interactive) {
    // 预览模式（非 TTY 或 --dry-run）：只列，不改
    process.stdout.write(pc.dim('  可自动应用的修复（预览，未改动）:\n'));
    for (const f of auto) {
      const p2 = f.fix!.precautionary ? pc.dim('（预防性·不改变政策分类）') : '';
      process.stdout.write(`  ${pc.cyan('☐')} ${pc.bold(f.title)} — ${f.fix!.title} ${p2}\n`);
      for (const l of blockLines([f.fix!])) process.stdout.write(pc.dim(`      + ${l}\n`));
    }
    process.stdout.write(
      pc.dim('\n  交互勾选并应用：直接在终端跑 `claudedoctor fix`；或 `fix --all` 全部应用、`fix --session` 仅本会话。\n\n'),
    );
    return 0;
  } else {
    const picked = await p.multiselect({
      message: '勾选要应用的修复（空格选中，回车确认）',
      required: false,
      options: auto.map((f, i) => ({
        value: i,
        label: `${f.title} — ${f.fix!.title}`,
        hint: f.fix!.precautionary ? '预防性 · 不改变政策分类' : '有因果 · 可改善健康状态',
      })),
    });
    if (p.isCancel(picked)) {
      p.cancel('已取消，未改动任何文件。');
      return 0;
    }
    chosen = (picked as number[]).map((i) => auto[i]!);
  }

  if (chosen.length === 0) {
    process.stdout.write(pc.dim('  未选择任何项，未改动。\n\n'));
    return 0;
  }

  const fixes = chosen.map((f) => f.fix!);
  const profile = detectProfile();
  const lines = blockLines(fixes);
  process.stdout.write(pc.bold(`\n  将写入 ${profile}（会先自动备份）:\n`));
  for (const l of lines) process.stdout.write(pc.green(`      ${l}\n`));

  if (interactive && !flags.yes) {
    const ok = await p.confirm({ message: '确认写入 shell profile？' });
    if (p.isCancel(ok) || !ok) {
      p.cancel('已取消，未改动任何文件。');
      return 0;
    }
  }

  const r = applyToProfile(fixes, profile);
  process.stdout.write(pc.green(`\n  ✓ 已写入 ${r.profile}`) + pc.dim(`（备份：${r.backup ?? '无（原文件不存在）'}）\n`));
  process.stdout.write(pc.dim(`  生效：重开终端，或 \`source ${r.profile}\`。之后 \`claudedoctor verify\` 复诊。\n`));
  process.stdout.write(pc.dim(`  撤销：\`claudedoctor fix --revert\`。\n\n`));
  return 0;
}

async function cmdVerify(flags: Flags): Promise<number> {
  // 复诊：字节级复检 M0 的日期行 + 复跑体检。
  if (!flags.json) process.stdout.write('\n' + BANNER + pc.bold(' · 复诊') + '\n\n');
  const result = await verifyDateLine();
  if (result) {
    const clean = result.apostropheHex === '27' && result.separatorHex === '2d 2d';
    const icon = clean ? pc.green('✓') : pc.red('✗');
    if (!flags.json) {
      process.stdout.write(`   ${icon} 日期行字节复检：${clean ? '干净（ASCII 撇号 + "-" 分隔符）' : '异常，机制可能回归'}\n`);
      process.stdout.write(pc.dim(`      "${result.text}"\n`));
      process.stdout.write(pc.dim(`      撇号 hex=${result.apostropheHex}  分隔符 hex=${result.separatorHex}\n\n`));
    }
  } else {
    if (!flags.json) {
      process.stdout.write(pc.yellow('   ⚠ 未能抓到日期行（claude 未安装/未登录，或代理超时）。本次只复跑体检，不构成完整复诊闭环。\n\n'));
    }
  }
  // 复跑体检（把复检到的 dateLine 一并喂给诊断）
  const input = await buildInput(flags);
  if (result) input.dateLine = result;
  const dx = diagnose(input);
  if (flags.json) {
    const verification = {
      status: result
        ? result.apostropheHex === '27' && result.separatorHex === '2d 2d'
          ? 'passed'
          : 'changed'
        : 'unavailable',
      dateLine: result,
    };
    process.stdout.write(JSON.stringify({ schemaVersion: 1, toolVersion: VERSION, verification, ...dx }, null, 2) + '\n');
    return result ? diagnosisExitCode(dx) : Math.max(1, diagnosisExitCode(dx));
  }
  process.stdout.write(renderDiagnosis(dx, { why: flags.why }));
  return result ? diagnosisExitCode(dx) : Math.max(1, diagnosisExitCode(dx));
}

function cmdEnv(flags: Flags): number {
  const input = collect();
  // sanitized snapshot — no secrets are present in DoctorInput by construction
  if (!flags.json) process.stdout.write('\n' + BANNER + pc.bold(' · 环境快照（脱敏）') + '\n\n');
  process.stdout.write(JSON.stringify(input, null, 2) + (flags.json ? '\n' : '\n\n'));
  return 0;
}

function printHelp(): void {
  process.stdout.write(
    '\n' +
      BANNER +
      '\n\n' +
      '  给本地 Claude Code 做体检 → 开药 → 复诊。只碰有因果的封号信号，每条带置信度与出处。\n\n' +
      pc.dim('  说明: 体检通过仅表示未发现已知高置信风险向量，不保证账号绝不会被限制。\n\n') +
      pc.bold('  用法:\n') +
      '    claudedoctor [check]   体检本地 Claude Code（默认，表格输出）\n' +
      '    claudedoctor fix       开药：交互勾选并应用修复（--dry-run 只看 / --all 全应用 / --revert 撤销）\n' +
      '    claudedoctor verify    复诊：字节级复检日期行 + 复跑体检\n' +
      '    claudedoctor env       打印脱敏环境快照\n\n' +
      pc.bold('  选项:\n') +
      '    --why      展开每条结论的出处与说明\n' +
      '    --net      联网体检出口 IP/地区（会把 IP 告知第三方）\n' +
      '    --json     机器可读输出\n' +
      '    --version  打印版本\n' +
      '    fix --dry-run/--all/--session/--revert/--yes   修复的几种模式\n\n' +
      pc.dim('  证据账本: docs/ban-signals.md · docs/mechanism.md\n\n'),
  );
}

export async function main(argv: string[]): Promise<number> {
  const { rest, flags, error } = parseFlags(argv);
  if (flags.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (flags.help) {
    printHelp();
    return 0;
  }
  if (error) {
    process.stderr.write(pc.red(`${error}\n`));
    return 64;
  }
  if (rest.length > 1) {
    process.stderr.write(pc.red(`多余参数: ${rest.slice(1).join(' ')}\n`));
    return 64;
  }
  const cmd = rest[0] ?? 'check';
  const fixOnly = flags.revert || flags.dryRun || flags.all || flags.session || flags.yes;
  if (cmd !== 'fix' && fixOnly) {
    process.stderr.write(pc.red('选项 --revert/--dry-run/--all/--session/--yes 仅适用于 fix。\n'));
    return 64;
  }
  if (cmd === 'fix' && [flags.revert, flags.dryRun, flags.all, flags.session].filter(Boolean).length > 1) {
    process.stderr.write(pc.red('fix 的 --revert/--dry-run/--all/--session 不能组合使用。\n'));
    return 64;
  }
  switch (cmd) {
    case 'check':
      return cmdCheck(flags);
    case 'fix':
      return cmdFix(flags);
    case 'verify':
      return cmdVerify(flags);
    case 'env':
      return cmdEnv(flags);
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return 0;
    default:
      process.stderr.write(pc.red(`未知命令: ${cmd}\n`));
      printHelp();
      return 64;
  }
}
