<div align="center">

<picture>
  <source srcset="https://raw.githubusercontent.com/diguike/claudedoctor/main/packages/web/public/og.svg" type="image/svg+xml" />
  <img src="https://raw.githubusercontent.com/diguike/claudedoctor/main/packages/web/public/og.png" alt="Claude Doctor · 克劳德医生" width="1200" />
</picture>

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

Passing a check does **not** guarantee a Claude Code account will never be restricted. It means this tool did not find any **known, high-confidence** risk vectors in the dimensions it can actually observe.

## 🩺 What it does

Unlike "are-you-a-China-user" scoreboards, Claude Doctor is a closed loop built on **byte-level
evidence**: it only touches signals with a real causal link to Claude Code's behaviour, labels
every verdict with a confidence level (`confirmed` / `reported` / `speculative`), and every
diagnosis ships with an executable, re-verifiable fix.

| | What it checks | Where |
|---|---|---|
| 🔑 | **Credentials & relays** — subscription OAuth leaving the official client via a relay (the one officially-confirmed ban cause) | CLI |
| 🖥️ | **Client integrity** — official Claude Code vs a spoofed harness | CLI |
| 🌐 | **Egress network & IP profile** — region, datacenter/proxy/VPN/Tor, IP purity, and dual-stack IPv4/IPv6 divergence when present (keyless via ipapi.is; optional ipdata) | CLI + web |
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

## 🧹 Safe local cache reset

[`scripts/reset-claude-cache.sh`](./scripts/reset-claude-cache.sh) resets only an explicit
allowlist of regenerable Claude Code/Desktop caches. It defaults to preview mode and moves files
to a private, timestamped backup instead of deleting them. Quit Claude Code and Claude Desktop
before applying it:

```bash
bash scripts/reset-claude-cache.sh           # preview
bash scripts/reset-claude-cache.sh --apply   # confirm, then move to backup
```

It deliberately preserves plugins, skills, hooks, settings, credentials, conversations, projects,
tasks, history, file-history and backups. It never uses `sudo` or changes machine identity, Git
configuration, shell profiles, Claude.app, or Desktop Application Support.
If an individual move fails, the script stops and points to a `manifest.tsv` journal containing
both planned and completed moves, so a partial run remains inspectable and recoverable.

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

**安全清缓存：**

仓库内的 [`scripts/reset-claude-cache.sh`](./scripts/reset-claude-cache.sh) 只处理明确列入白名单、
可以重新生成的缓存。默认只预览；执行时也只是把文件移动到私有、带时间戳的备份目录，不直接
删除。执行前请先退出 Claude Code 和 Claude Desktop：

```bash
bash scripts/reset-claude-cache.sh           # 预览
bash scripts/reset-claude-cache.sh --apply   # 确认后移动到备份
```

脚本明确保留 plugins、skills、hooks、配置、登录凭据、历史会话、projects、tasks、file-history
和 backups；不会使用 `sudo`，也不会修改机器标识、Git、shell profile、Claude.app 或 Desktop
Application Support。
如果中途某项移动失败，脚本会立即停止，并通过 `manifest.tsv` 记录计划移动和已经完成的项目，
方便检查 partial run 和恢复。

命令行给**本地 Claude Code**（终端进程）体检；Web 端给**浏览器 Claude** 体检，作科普与引流。
**默认 100% 本地**，不上传任何环境数据；凭证只做分类，原文永不外泄。只帮真实用户降低误伤，
不做指纹伪造 / 号池规避 / 封禁规避 这类 sketchy 功能。

## License

MIT © [递归客](https://github.com/diguike)。项目定位与设计原则见 [`CLAUDE.md`](./CLAUDE.md)。
