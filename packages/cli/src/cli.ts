/**
 * claudedoctor / cdoc — CLI entry.
 * Narrative: check（体检）→ fix（开药）→ verify（复诊）.
 */
import pc from 'picocolors';
import { diagnose, type DoctorInput } from '@claudedoctor/core';
import { collect } from './collect.js';
import { probeNetwork, activeProviderName } from './probe.js';
import { renderDiagnosis } from './render.js';
import { verifyDateLine } from './verify.js';

const BANNER = pc.bold('🩺  Claude Doctor') + pc.dim(' (claudedoctor / cdoc)');

interface Flags {
  why: boolean;
  net: boolean;
  json: boolean;
}

function parseFlags(args: string[]): { rest: string[]; flags: Flags } {
  const flags: Flags = { why: false, net: false, json: false };
  const rest: string[] = [];
  for (const a of args) {
    if (a === '--why' || a === '-w') flags.why = true;
    else if (a === '--net' || a === '--online') flags.net = true;
    else if (a === '--json') flags.json = true;
    else rest.push(a);
  }
  return { rest, flags };
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
  }
  return input;
}

async function cmdCheck(flags: Flags): Promise<number> {
  const input = await buildInput(flags);
  const dx = diagnose(input);
  if (flags.json) {
    process.stdout.write(JSON.stringify(dx, null, 2) + '\n');
    return dx.summary.riskCount > 0 ? 2 : 0;
  }
  process.stdout.write(renderDiagnosis(dx, { why: flags.why }));
  return dx.summary.riskCount > 0 ? 2 : dx.summary.warnCount > 0 ? 1 : 0;
}

async function cmdFix(flags: Flags): Promise<number> {
  const input = await buildInput(flags);
  const dx = diagnose(input);
  const withFix = dx.findings.filter((f) => f.fix);
  if (flags.json) {
    process.stdout.write(JSON.stringify(withFix, null, 2) + '\n');
    return 0;
  }
  process.stdout.write('\n' + BANNER + pc.bold(' · 开药（dry-run）') + '\n\n');
  if (withFix.length === 0) {
    process.stdout.write(pc.green('   ✓ 没有需要处理的项，当前配置健康。\n\n'));
    return 0;
  }
  for (const f of withFix) {
    const mark = f.status === 'risk' ? pc.red('✗') : pc.yellow('⚠');
    process.stdout.write(`   ${mark} ${pc.bold(f.title)} — ${f.summary}\n`);
    process.stdout.write(pc.cyan(`     药方: ${f.fix!.title}\n`));
    for (const cmd of f.fix!.commands) process.stdout.write(`       ${pc.green('$')} ${cmd}\n`);
    if (f.fix!.note) process.stdout.write(pc.dim(`       ${f.fix!.note}\n`));
    process.stdout.write('\n');
  }
  process.stdout.write(
    pc.dim('   以上为 dry-run，未改动任何文件。请自行执行需要的命令，然后 `claudedoctor verify` 复诊。\n\n'),
  );
  return 0;
}

async function cmdVerify(flags: Flags): Promise<number> {
  // 复诊：字节级复检 M0 的日期行 + 复跑体检。
  process.stdout.write('\n' + BANNER + pc.bold(' · 复诊') + '\n\n');
  const result = await verifyDateLine();
  if (result) {
    const clean = result.apostropheHex === '27' && !result.separatorHex.includes('2f');
    const icon = clean ? pc.green('✓') : pc.red('✗');
    process.stdout.write(`   ${icon} 日期行字节复检：${clean ? '干净（ASCII 撇号 + "-" 分隔符）' : '异常，机制可能回归'}\n`);
    process.stdout.write(pc.dim(`      "${result.text}"\n`));
    process.stdout.write(pc.dim(`      撇号 hex=${result.apostropheHex}  分隔符 hex=${result.separatorHex}\n\n`));
  } else {
    process.stdout.write(pc.yellow('   ⚠ 未能抓到日期行（claude 未安装/未登录，或代理超时）。跳过字节复检。\n\n'));
  }
  // 复跑体检（把复检到的 dateLine 一并喂给诊断）
  const input = await buildInput(flags);
  if (result) input.dateLine = result;
  const dx = diagnose(input);
  process.stdout.write(renderDiagnosis(dx, { why: flags.why }));
  return dx.summary.riskCount > 0 ? 2 : 0;
}

function cmdEnv(flags: Flags): number {
  const input = collect();
  // sanitized snapshot — no secrets are present in DoctorInput by construction
  process.stdout.write('\n' + BANNER + pc.bold(' · 环境快照（脱敏）') + '\n\n');
  process.stdout.write(JSON.stringify(input, null, 2) + '\n\n');
  void flags;
  return 0;
}

function printHelp(): void {
  process.stdout.write(
    '\n' +
      BANNER +
      '\n\n' +
      '  给本地 Claude Code 做体检 → 开药 → 复诊。只碰有因果的封号信号，每条带置信度与出处。\n\n' +
      pc.bold('  用法:\n') +
      '    claudedoctor [check]   体检本地 Claude Code（默认）\n' +
      '    claudedoctor fix       开药：列出可执行修复（dry-run）\n' +
      '    claudedoctor verify    复诊：字节级复检日期行 + 复跑体检\n' +
      '    claudedoctor env       打印脱敏环境快照\n\n' +
      pc.bold('  选项:\n') +
      '    --why      展开每条结论的出处与说明\n' +
      '    --net      联网体检出口 IP/地区（会把 IP 告知第三方）\n' +
      '    --json     机器可读输出\n\n' +
      pc.dim('  证据账本: docs/ban-signals.md · docs/mechanism.md\n\n'),
  );
}

export async function main(argv: string[]): Promise<number> {
  const { rest, flags } = parseFlags(argv);
  const cmd = rest[0] ?? 'check';
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
