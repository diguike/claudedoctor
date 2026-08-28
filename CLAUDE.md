# Claude Doctor（克劳德医生）

> An evidence-first diagnostics toolkit for Claude Code — not a scoreboard or evasion tool.
> 给你的浏览器 Claude 和本地 Claude Code 做体检：诊断哪些信号会暴露，开药（可执行修复），改完复诊。

这是给在本仓库工作的 AI agent（以及人类）看的最高优先级说明。**动手前先读完。**

品牌 **Claude Doctor / 克劳德医生**，命令行 **`claudedoctor`**（另注册短别名 **`cdoc`**，二者指向同一程序，方便快速敲）。叙事贯穿始终：**体检（check）→ 开药（fix）→ 复诊（verify）**。

---

## 0. 一句话定位

`FuckClaude` 那类项目只做了"打分吓唬人"，且 70% 的信号和真实机制无关、测错了对象（测浏览器却谈论终端进程）。**Claude Doctor 要做的是相反的三步闭环：取证式诊断 → 可执行开药 → 改完复诊。** 我们只对**有因果关系**的信号动手，并对每条结论标注置信度。像 `flutter doctor` / `brew doctor` 一样——一看命令就懂它在给环境做体检。

产品由两部分组成：

- **CLI（`claudedoctor`）** — 体检**本地 Claude Code**（终端 Node 进程）的真实环境，诊断哪些信号会泄露，开出修复命令，`claudedoctor fix` 后能 `claudedoctor verify` 复诊。这是核心。
- **Web** — 自动检查浏览器当前出口地区与 IP 信誉；与 CLI 范围严格分开。双语、静态构建、SEO 完整。

---

## 1. 我们对抗的"真实机制"——先验证，别假设

据公开逆向分析（**未经 Anthropic 证实，当作假说对待**）：Claude Code 指向非官方 `ANTHROPIC_BASE_URL`（中转）时，据称会读取**系统时区**与**中转 hostname**，并把结果隐写进 system prompt 里 `Today's date is …` 那一行：
- 命中中国时区时，日期分隔符 `-` → `/`；
- 撇号（apostrophe）在 4 种视觉几乎相同的 Unicode 变体间切换，编码是否命中"域名清单 / AI 实验室关键词"。

**⚠️ 头号任务（M0，见下）：先用字节级取证验证这个机制到底还存不存在、长什么样。** 原始说法用的是过去式（"was reported"）。Claude Code 一直更新，机制可能已改/已移除。**在没有亲眼 dump 出证据之前，任何"开药"都是空中楼阁。** 我们用 hex diff 说话，不传谣。

### 因果 vs 氛围
真正能影响那条机制的，目前只有 **系统时区** 和 **中转 hostname** 两个信号是有因果的。像浏览器语言、canvas 中文字体、emoji 厂商这些，在**终端 Node 进程**里根本不参与，属于"中文环境氛围"。**CLI 侧只处理有因果的信号；氛围信号如果要显示，必须明确标注"不影响 Claude Code，仅供参考"，且不能混进政策风险分类。**

---

## 2. 架构

pnpm monorepo（workspace）：

```
packages/
├── core/   @claudedoctor/core  —— 同构纯逻辑：探针取证、信号分类、置信度、修复建议。无 I/O 副作用，浏览器和 Node 都能用。
├── cli/    @diguike/claudedoctor —— claudedoctor 命令。读真实 env / 配置层 / 网络与字节探针，调 core 输出诊断 + 开药。
└── web/    @claudedoctor/web     —— 零框架静态站；构建时从 core 生成政策地区数据，自动体检浏览器网络。
```

**铁律：政策数据与 CLI 诊断逻辑只写在 `core`。** Web 构建产物从 core 生成地区数据；Web 特有的浏览器展示逻辑不得复制或改写政策清单，也不得生成伪精确风险分。

---

## 3. CLI 设计（`claudedoctor`）

命令面向"体检 → 开药 → 复诊"叙事：

- `claudedoctor`（默认）/ `claudedoctor check` — 读取实际凭证优先级、分层 settings、活动客户端路径、本地代理卫生；`--net` 才联网检查出口。
- `claudedoctor fix` — 给出或选择性写入可逆的 shell profile 托管块。自动修复只用于能安全表达的环境变量变更；settings/network 问题保持手动。
- `claudedoctor verify` — 复诊：修复后再跑一遍，用字节对比确认那一行真的变干净了。
- `claudedoctor env`（可选）— 环境自检（Node 版本、Claude Code 是否安装、config 路径）。

原则：**先诊断 → 再开药 → 改完复诊**。体检只说"有病"，医生必须给药并证明药有效。

---

## 4. 工程约定

- 语言：TypeScript，`strict: true`。Node `>=20`，ESM。
- 包管理：**pnpm**（workspace）。命令统一在仓库根跑：`pnpm -F @claudedoctor/cli <script>`。
- CLI 框架：轻量优先（如 `commander` / `cac`），彩色输出可用 `picocolors`。避免重依赖。
- Web：零框架静态构建，双语切换、SEO 完整；联网自动执行，但失败必须显示 `UNKNOWN`，不得用样例数据代替。
- 每条给用户的结论都带**置信度**（confirmed / reported / speculative）和**因果标注**。不确定就说不确定——这是本项目的立身之本，见第 7 节。
- 隐私：CLI 默认 100% 本地，只有 `--net` 联网；Web 自动查询浏览器出口并明确数据源。若将来加遥测，必须显式 opt-in。

## 5. 常用命令

```bash
pnpm install                      # 安装全部 workspace 依赖
pnpm -F @diguike/claudedoctor dev    # 开发 CLI
pnpm -F @diguike/claudedoctor build
pnpm -F @claudedoctor/web dev        # 本地静态站
pnpm -F @claudedoctor/web build
pnpm -r build                     # 全量构建
node packages/cli/bin/claudedoctor.mjs check   # 本地直跑 CLI（构建后）
```

## 6. 里程碑状态

- **M0 · 取证先行**：已完成；证据在 `docs/mechanism.md`。
- **M1 · CLI 体检**：已完成并覆盖当前官方认证优先级与配置层级。
- **M2 · 开药 + 复诊**：已完成；自动变更可备份、撤销，日期行检查验证两个分隔符。
- **M3 · Web**：已上线；浏览器范围使用分类结论而非 0–100 伪精确分数。
- **M4 · 工程化**：CI、单元测试、npm 包审计已落地。后续重点是跨平台探针和定期证据复核。

## 7. 立身原则（务必遵守）

1. **证据优先**：能 dump 字节就不猜。传闻标注为传闻。
2. **只碰有因果的信号**：氛围信号不混进风险判断。
3. **测对对象**：CLI 测终端进程，Web 测浏览器，两者不能张冠李戴。
4. **闭环**：诊断必须能配套开药 + 复诊，否则只是又一个吓唬人的分数。
5. **诚实的营销**：可以有梗、有品牌，但不能靠制造虚假焦虑变现。
