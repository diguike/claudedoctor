# Claude Doctor（克劳德医生）

> A *real* health-check & anti-detection toolkit for Claude Code — not a scoreboard.
> 给你的浏览器 Claude 和本地 Claude Code 做体检：诊断哪些信号会暴露，开药（可执行修复），改完复诊。

这是给在本仓库工作的 AI agent（以及人类）看的最高优先级说明。**动手前先读完。**

品牌 **Claude Doctor / 克劳德医生**，命令行 **`claudedoctor`**（另注册短别名 **`cdoc`**，二者指向同一程序，方便快速敲）。叙事贯穿始终：**体检（check）→ 开药（fix）→ 复诊（verify）**。

---

## 0. 一句话定位

`FuckClaude` 那类项目只做了"打分吓唬人"，且 70% 的信号和真实机制无关、测错了对象（测浏览器却谈论终端进程）。**Claude Doctor 要做的是相反的三步闭环：取证式诊断 → 可执行开药 → 改完复诊。** 我们只对**有因果关系**的信号动手，并对每条结论标注置信度。像 `flutter doctor` / `brew doctor` 一样——一看命令就懂它在给环境做体检。

产品由两部分组成：

- **CLI（`claudedoctor`）** — 体检**本地 Claude Code**（终端 Node 进程）的真实环境，诊断哪些信号会泄露，开出修复命令，`claudedoctor fix` 后能 `claudedoctor verify` 复诊。这是核心。
- **Web** — 体检**浏览器里的 Claude**（claude.ai）环境，科普 + 引流入口。SEO/双语/静态托管。

---

## 1. 我们对抗的"真实机制"——先验证，别假设

据公开逆向分析（**未经 Anthropic 证实，当作假说对待**）：Claude Code 指向非官方 `ANTHROPIC_BASE_URL`（中转）时，据称会读取**系统时区**与**中转 hostname**，并把结果隐写进 system prompt 里 `Today's date is …` 那一行：
- 命中中国时区时，日期分隔符 `-` → `/`；
- 撇号（apostrophe）在 4 种视觉几乎相同的 Unicode 变体间切换，编码是否命中"域名清单 / AI 实验室关键词"。

**⚠️ 头号任务（M0，见下）：先用字节级取证验证这个机制到底还存不存在、长什么样。** 原始说法用的是过去式（"was reported"）。Claude Code 一直更新，机制可能已改/已移除。**在没有亲眼 dump 出证据之前，任何"开药"都是空中楼阁。** 我们用 hex diff 说话，不传谣。

### 因果 vs 氛围
真正能影响那条机制的，目前只有 **系统时区** 和 **中转 hostname** 两个信号是有因果的。像浏览器语言、canvas 中文字体、emoji 厂商这些，在**终端 Node 进程**里根本不参与，属于"中文环境氛围"。**CLI 侧只处理有因果的信号；氛围信号如果要显示，必须明确标注"不影响 Claude Code，仅供参考"，且不能混进同一个风险分。**

---

## 2. 架构

pnpm monorepo（workspace）：

```
packages/
├── core/   @claudedoctor/core  —— 同构纯逻辑：探针取证、信号评分、置信度、修复建议。无 I/O 副作用，浏览器和 Node 都能用。
├── cli/    @claudedoctor/cli    —— claudedoctor 命令。读真实 env / 构造出的 system prompt 行 / 做 hex 取证，调 core 评分，输出诊断 + 开药。
└── web/    @claudedoctor/web    —— Astro 静态站，复用 core 的评分器，体检浏览器环境，双语 SEO。
```

**铁律：检测/评分逻辑只写在 `core` 里，`cli` 和 `web` 都复用同一套纯函数。** 绝不在两处各写一份评分（这正是原项目埋下不一致的地方）。

---

## 3. CLI 设计（`claudedoctor`）

命令面向"体检 → 开药 → 复诊"叙事：

- `claudedoctor`（默认）/ `claudedoctor check` — 体检本地 Claude Code：读真实 `TZ` / `Intl` 时区、`LANG`、`ANTHROPIC_BASE_URL` 的 hostname，**实际 dump 出会打进 system prompt 的那一行并做 hex 取证**，逐条给因果诊断 + 置信度。
- `claudedoctor fix` — 开药：给出（或可选自动写入 shell profile）规避命令：`export TZ=...`、`LANG=...`、中转 hostname 处理建议。默认 dry-run，改动需显式确认。
- `claudedoctor verify` — 复诊：修复后再跑一遍，用字节对比确认那一行真的变干净了。
- `claudedoctor env`（可选）— 环境自检（Node 版本、Claude Code 是否安装、config 路径）。

原则：**先诊断 → 再开药 → 改完复诊**。体检只说"有病"，医生必须给药并证明药有效。

---

## 4. 工程约定

- 语言：TypeScript，`strict: true`。Node `>=20`，ESM。
- 包管理：**pnpm**（workspace）。命令统一在仓库根跑：`pnpm -F @claudedoctor/cli <script>`。
- CLI 框架：轻量优先（如 `commander` / `cac`），彩色输出可用 `picocolors`。避免重依赖。
- Web：Astro `output: 'static'`，双语（`/` 英 + `/zh/` 中），无 UI 框架，SEO 完整。
- 每条给用户的结论都带**置信度**（confirmed / reported / speculative）和**因果标注**。不确定就说不确定——这是本项目的立身之本，见第 7 节。
- 隐私：默认 100% 本地，不上传任何环境数据。若将来加遥测，必须显式 opt-in。

## 5. 常用命令

```bash
pnpm install                      # 安装全部 workspace 依赖
pnpm -F @claudedoctor/cli dev    # 开发 CLI
pnpm -F @claudedoctor/cli build
pnpm -F @claudedoctor/web dev    # 本地起 Astro 站
pnpm -F @claudedoctor/web build
pnpm -r build                     # 全量构建
node packages/cli/bin/claudedoctor.mjs check   # 本地直跑 CLI（构建后）
```

## 6. 路线图（下个会话从 M0 开始）

- **M0 · 取证先行**：写 `core` 里的探针，实际 dump Claude Code 构造的 `Today's date is …` 行，hex 输出分隔符与撇号字节。**先证实机制，再谈其他。** 结论如实写进 `docs/mechanism.md`（含出处链接 + 置信度）。
- **M1 · CLI 体检**：`claudedoctor check` 跑通，基于 M0 的真实机制做因果诊断。
- **M2 · CLI 开药 + 复诊**：`claudedoctor fix` / `claudedoctor verify` 闭环，字节对比证明有效。
- **M3 · Web**：复用 core，体检浏览器 Claude，双语 SEO 站上线。
- **M4 · 持续追踪**：CI 定期对最新版 Claude Code 做字节级 diff，机制变化能被发现。

## 7. 立身原则（务必遵守）

1. **证据优先**：能 dump 字节就不猜。传闻标注为传闻。
2. **只碰有因果的信号**：氛围信号不混进风险判断。
3. **测对对象**：CLI 测终端进程，Web 测浏览器，两者不能张冠李戴。
4. **闭环**：诊断必须能配套开药 + 复诊，否则只是又一个吓唬人的分数。
5. **诚实的营销**：可以有梗、有品牌，但不能靠制造虚假焦虑变现。
