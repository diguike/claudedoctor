<div align="center">

<img src="https://raw.githubusercontent.com/diguike/claudedoctor/main/packages/web/public/og.png" alt="Claude Doctor · 克劳德医生" width="760" />

# 🩺 Claude Doctor · 克劳德医生

**给 Claude Code 做封禁风险体检：检测 → 修复 → 复验。**
只算有因果的信号，每条带置信度与出处，诊断都配可复检的修复。不是又一个吓唬人的分数。

[![npm](https://img.shields.io/npm/v/@diguike/claudedoctor?logo=npm&color=CB3837)](https://www.npmjs.com/package/@diguike/claudedoctor)
[![downloads](https://img.shields.io/npm/dm/@diguike/claudedoctor?color=0B9E71)](https://www.npmjs.com/package/@diguike/claudedoctor)
[![node](https://img.shields.io/node/v/@diguike/claudedoctor?color=339933&logo=node.js&logoColor=white)](https://nodejs.org)
[![license](https://img.shields.io/github/license/diguike/claudedoctor?color=blue)](./LICENSE)
[![stars](https://img.shields.io/github/stars/diguike/claudedoctor?style=social)](https://github.com/diguike/claudedoctor)

**🔗 Live · 在线体验 → [claudedoctor.pages.dev](https://claudedoctor.pages.dev)**

English | [中文](#中文)

</div>

---

## 📦 Install

```bash
npm i -g @diguike/claudedoctor      # command: claudedoctor  (alias: cdoc)
```

```bash
claudedoctor                 # health-check your local Claude Code (table output)
claudedoctor check --why     # expand every verdict with its source & confidence
claudedoctor check --net     # + egress IP / region / VPN / proxy / datacenter (keyless)
claudedoctor fix             # interactive checklist → apply fixes (--dry-run / --all / --revert)
claudedoctor verify          # byte-level re-check of the date line + re-run
```

Exit code: `0` healthy · `1` attention · `2` at-risk. Add `--json` for machine-readable output.

## 🩺 What it does

Unlike "are-you-a-China-user" scoreboards, Claude Doctor is a closed loop built on **byte-level
evidence**: it only touches signals with a real causal link to Claude Code's behaviour, labels
every verdict with a confidence level (`confirmed` / `reported` / `speculative`), and every
diagnosis ships with an executable, re-verifiable fix.

| | What it checks | Where |
|---|---|---|
| 🔑 | **Credentials & relays** — subscription OAuth leaving the official client via a relay (the one officially-confirmed ban cause) | CLI |
| 🖥️ | **Client integrity** — official Claude Code vs a spoofed harness | CLI |
| 🌐 | **Egress network & IP profile** — region, datacenter/proxy/VPN/Tor, IP purity (keyless via ipapi.is; optional ipdata) | CLI + web |
| 🧩 | **Device & telemetry transparency** — local vs outbound identity, never abusing your credentials | CLI |
| 🧭 | **Timezone profile factor** — byte-verified: the date-line marker existed, was official, and was removed in 2026-07 | CLI + web |

The `fix` command presents an interactive checklist and applies the ones you pick to a **managed,
fully-reversible block** in your shell profile (auto-backed-up; `fix --revert` removes it).

## 🧱 Monorepo

```
packages/
├── core/   @claudedoctor/core   isomorphic detect / score / forensics (pure, no I/O)
├── cli/    @diguike/claudedoctor the claudedoctor (+ cdoc) command
└── web/    @claudedoctor/web     the landing page (live exposure gauge + IP profile)
```

## 🛠️ Develop

```bash
pnpm install
pnpm -r build
node packages/cli/bin/claudedoctor.mjs check
pnpm -F @claudedoctor/web dev      # → http://localhost:4321
```

See [`CLAUDE.md`](./CLAUDE.md) for the design rules, [`docs/mechanism.md`](./docs/mechanism.md)
(byte-level forensics ledger) and [`docs/ban-signals.md`](./docs/ban-signals.md) (ban-signal evidence).

---

<a id="中文"></a>

## 中文

和"你是不是中国用户"那种打分工具不同，Claude Doctor 是一个以**字节级取证**为基础的闭环：
只对与 Claude Code 行为**有真实因果**的信号动手，每条结论都标注置信度（confirmed / reported /
speculative），且**每个诊断都配一条可执行、可复检的修复**。检测 → 修复 → 复验。

**安装：**

```bash
npm i -g @diguike/claudedoctor      # 命令：claudedoctor（短别名 cdoc）
```

**用法：**

```bash
claudedoctor                 # 体检本地 Claude Code（默认，表格输出）
claudedoctor check --net     # + 出口 IP / 地区 / VPN / 代理 / 机房（免 key）
claudedoctor fix             # 交互勾选并应用修复（写入 shell profile 托管块，可 --revert 撤销）
claudedoctor verify          # 字节级复检日期行 + 复跑体检
```

命令行给**本地 Claude Code**（终端进程）体检；Web 端给**浏览器 Claude** 体检，作科普与引流。
**默认 100% 本地**，不上传任何环境数据；凭证只做分类，原文永不外泄。只帮真实用户降低误伤，
不做指纹伪造 / 号池规避等 sketchy 功能。

## License

MIT © [递归客](https://github.com/diguike)。项目定位与设计原则见 [`CLAUDE.md`](./CLAUDE.md)。
