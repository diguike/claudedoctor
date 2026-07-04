# Claude Doctor · 克劳德医生 🩺

> A **real** health-check & anti-detection toolkit for Claude Code — detect → fix → re-check.
> 给你的 Claude Code 和浏览器 Claude 做体检：诊断哪些信号会暴露 → 开药（可执行修复）→ 复诊。

English | [中文](#中文)

Unlike "are-you-a-China-user" scoreboards, Claude Doctor is a closed loop built on
**byte-level evidence**: it only touches signals with a real causal link to Claude Code's
behaviour, labels every verdict with a confidence level, and every diagnosis ships with an
executable fix you can re-verify.

> **Status: M0–M2 working.** The `check → fix → verify` loop runs against your real
> Claude Code install. Byte-level forensics ([`docs/mechanism.md`](./docs/mechanism.md))
> **falsified** the rumored date-line steganography in Claude Code 2.1.201, so the CLI
> focuses on the *actually causal* ban signals ([`docs/ban-signals.md`](./docs/ban-signals.md)):
> subscription credentials leaving the official client (relays / third-party harnesses),
> credential hygiene, and — opt-in — egress region.

## Usage

```bash
pnpm install && pnpm -r build            # build core + cli
node packages/cli/bin/claudedoctor.mjs   # or link the bin; alias: cdoc

claudedoctor check          # 体检本地 Claude Code（默认）
claudedoctor check --why    #   展开每条结论的出处与置信度
claudedoctor check --net    #   联网体检出口 IP/地区（会把 IP 告知第三方）
claudedoctor fix            # 开药：列出可执行修复（dry-run）
claudedoctor verify         # 复诊：字节级复检日期行 + 复跑体检
claudedoctor env            # 打印脱敏环境快照
```

Exit code: `0` healthy · `1` attention · `2` at-risk. Add `--json` for machine-readable output.

## Monorepo layout

```
packages/
├── core/   @claudedoctor/core   isomorphic detect / score / forensics (no I/O)
├── cli/    @claudedoctor/cli     the `claudedoctor` (+`cdoc`) command
└── web/    @claudedoctor/web     Astro static site (M3)
```

## Develop

```bash
pnpm install
pnpm -F @claudedoctor/cli dev
pnpm -r build
```

See [`CLAUDE.md`](./CLAUDE.md) for the design rules, mechanism notes, and the M0–M4 roadmap.

---

<a id="中文"></a>

## 中文

和"你是不是中国用户"那种打分工具不同，Claude Doctor 是一个以**字节级取证**为基础的闭环：
只对与 Claude Code 行为**有真实因果**的信号动手，每条结论都标注置信度，且**每个诊断都配一条
可执行、可复检的修复**。检测 → 开药 → 复诊。

> ⚠️ **当前状态：脚手架。** 传闻中的检测机制**尚未证实**，开发从 **M0（取证先行）**开始，
> 详见 [`CLAUDE.md`](./CLAUDE.md)。

命令行主名 `claudedoctor`，短别名 `cdoc`。核心是给**本地 Claude Code**（终端进程）体检；
Web 端给**浏览器 Claude** 体检，作科普与引流。100% 本地运行，不上传任何环境数据。

## License

MIT © chaoyang. 项目定位与设计原则见 [`CLAUDE.md`](./CLAUDE.md)。
