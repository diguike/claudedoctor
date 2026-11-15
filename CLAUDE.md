# Claude Doctor

> An evidence-first diagnostics toolkit for Claude Code — not a scoreboard or evasion tool.
> 给你的浏览器 Claude 和本地 Claude Code 做体检：诊断哪些信号会暴露，开药（可执行修复），改完复诊。

这是给在本仓库工作的 AI agent（以及人类）看的最高优先级说明。**动手前先读完。**

品牌只用英文名 **Claude Doctor**（不使用中文品牌名，旧的中文名已有意移除，不要加回来），命令行 **`claudedoctor`**（另注册短别名 **`cdoc`**，二者指向同一程序，方便快速敲）。叙事贯穿始终：**体检（check）→ 开药（fix）→ 复诊（verify）**。

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

仓库根还有两样可以单独拿走的东西：`scripts/reset-claude-cache.sh`（清缓存脚本）和 `skills/claude-isp-clash/`（给 agent 用的 Clash 配置 skill，从维护者本地脱敏而来，里面不得出现真实节点、账号、IP）。

**铁律：政策数据与 CLI 诊断逻辑只写在 `core`。** Web 构建产物从 core 生成地区数据；Web 特有的浏览器展示逻辑不得复制或改写政策清单，也不得生成伪精确风险分。

---

## 3. CLI 设计（`claudedoctor`）

命令面向"体检 → 开药 → 复诊"叙事：

- `claudedoctor`（默认）/ `claudedoctor check` — 读取实际凭证优先级、分层 settings、活动客户端路径、本地代理卫生；`--net` 才联网检查出口。
- `claudedoctor fix` — 给出或选择性写入可逆的 shell profile 托管块。自动修复只用于能安全表达的环境变量变更；settings/network 问题保持手动。
- `claudedoctor verify` — 复诊：修复后再跑一遍，用字节对比确认那一行真的变干净了。
- `claudedoctor env`（可选）— 环境自检（Node 版本、Claude Code 是否安装、config 路径）。
- `claudedoctor reset` — 清理可重新生成的缓存：默认只预览，`--apply` 才把白名单内的路径移到 `~/.claudedoctor-cleanup-backups/`（不删除）。白名单和行为必须与 `scripts/reset-claude-cache.sh` 保持一致，改一处就改另一处。

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

## 8. 官网设计规范（已锁定，不要改回去）

`packages/web` 在 2026-11 由维护者（递归客）要求重做了两轮：第一版（霓虹绿、仪表盘、emoji、图标卡片）和第二版（奶油底、细衬线、灰绿色）都被判为"AI 味太重"。现行版本跟随维护者自己的产品风格，参照物是剧本搭子（`scriptbuddy` 首页）和 inferloop.dev。**除非维护者明确要求重新设计，任何 agent（Claude Code、Codex、Cursor 等）都不得更改视觉方向。** 硬性规则由 `packages/web/test/design.test.mjs` 检查；测试失败时改页面，不要改测试。

### 页面是给用户看的

这是最重要的一条。页面上只写用户关心的东西：查了什么、结果是什么、接下来做什么。

- **维护者和 agent 讨论出来的产品口径、内部约束、免责和限定语，不写进页面，也不写进 CLI 输出。** 例如推荐链接的佣金说明、"这是卫生建议不是已证实信号"、数据核查边界这一类话，留在本文件和代码注释里。
- 文字越少越好。能用卡片、切换、展开、动效表达的，不用大段文字。一个区块一句话说清，细节放进点开才出现的层。
- 中英文内容保持同步，都用平实的短句，不写口号。

### 页面是一份能跟着做的排查文档

目标是让用户照着页面就能把 Claude Code 的问题排查掉。"遇到了什么问题？"区块按**症状**组织（登录卡住、提示 key 无效、地区不支持、终端连不上、换号后异常、买了 ISP 代理怎么配、在用中转），每个症状给一句原因和几步可复制的命令，并且可以用 `#guide-<id>` 直接链接到某个症状。新增内容优先加成一个症状，而不是加一段说明文字。步骤里的命令和说法必须与 CLI 的真实行为一致。

首屏下面的第二屏是「稳定使用 Claude Code 的五步」（`STEPS`）：干净的浏览器环境 → `claudedoctor reset` → 受支持且固定的出口 → 登录 → 最多两台设备且出口一致。这五步的顺序和内容由维护者定，改动前先问。

### 数据来源

浏览器检查用两个免 key 的来源：`ipdata.free`（ipdata.co 的免 key 接口，地区 + 运营方 + ASN，主来源，按 IPv4 / IPv6 各查一次）和 `ipapi.is`（补充城市）。2026-11 起 ipapi.is 的免 key 响应不再带 `location` 对象和信誉标记，所以页面不再自己给 IP 信誉结论，而是在信誉那一行和出口画像里给出 `https://ipdata.co/` 的跳转（链接里不带 IP：我们拿到的 IP 不一定准，让 ipdata.co 自己识别访问者）；代码保留了对完整格式的兼容，标记回来时会自动显示。ipdata 拿不到地区才显示 `UNKNOWN`。不要把任何 API key 写进页面。新增联网域名时，`public/_headers` 和 `serve.mjs` 里的 `connect-src` 要同步改。

### 视觉

- **品牌**：只写 `Claude Doctor`。标志是递归橙圆角方块里的白色十字（内联 SVG）。静态 HTML 默认英文，中文通过语言切换提供。
- **颜色**：取自递归客的品牌色（`diguike/brand/品牌规范.md`）。白纸 `#FBFBFA`、墨黑 `#171A18`、**递归橙 `#FF6A2B` 是唯一的强调色**，灰色承载阅读。绿色只表示"通过"。橙色只做点缀（标志、标题下的手绘线、`##`、小标签），不做大面积底色。
- **字体**：系统字体栈，标题用粗黑体（800），数据和命令用等宽。不用衬线，不引入 web font。
- **构图**：真实的产物（体检报告、出口画像、终端输出）放在一块灰色"桌面"上的白纸里，这是页面的主要视觉。首屏居中：小印章、大标题、一句话、安装命令，下面就是实时的浏览器检查结果。
- **区块标题**：小节标题前带等宽的橙色 `##`。
- **结论呈现**：首屏检查块顶部是一条按结论上色的实色状态条（通过绿 / 注意琥珀 / 地区不支持红 / 未知灰，白字），下面是四格卡片（出口地区、出口 IP、IP 信誉、IPv4/IPv6），每格一个实色状态标签加一个大号结果。这是维护者 2026-11 明确要求的：关键信息和结果要用醒目的颜色。状态色只用于结论，不用于装饰。状态词 `OK / WARN / RISK / INFO` 与 CLI 一致。
- **不要内嵌 ipdata.co**：它对 iframe 请求只返回一段裸 JSON（按 `Sec-Fetch-Dest` 区分），嵌进来没有页面可看，所以用跳转链接。信号分成政策风险、访问问题、环境信息三类，三类不合成一个分数。

### 交互和动效

允许，并且鼓励用它代替文字，但每个动效都要对应一件真实发生的事：检查结果逐条到达、终端命令逐字打出、卡片点开、悬停反馈。不做纯装饰的入场编排，并且必须尊重 `prefers-reduced-motion`。

### 禁止（前两版就是这样，不要恢复）

- emoji 或象形符号。
- 仪表盘、进度弧、0–100 分数、任何看起来像概率的数字。
- 霓虹绿、奶油底配细衬线、紫色等常见的 AI 产品配色；渐变、发光、shimmer。
- 全大写等宽 eyebrow 标签、巨大的 01/02/03 序号、仿 macOS 红黄绿圆点的终端窗口。
- 口号式文案（"一次查清""不只是 X，更是 Y"）和制造焦虑的措辞。
- 外部脚本、外部样式表、外部字体、分析或追踪代码。

## 9. 换号建议与 ISP 代理推荐

- **换号建议**（`ACCOUNT_SWITCH_ADVICE`，在 core）：更换账号后，先清除 claude.ai 的浏览器 Cookie，或新建 Chrome 用户（Profile）再登录。CLI 报告末尾和官网"建议"区都会显示。
- **ISP 代理推荐**（`ISP_PROXY_REFERRAL`，在 core）：出口被判为机房 IP，或被标记为代理 / VPN / 信誉问题时，推荐正规的静态住宅 ISP 代理，并附维护者的推荐链接。
  1. 链接只在 core 定义一次，CLI 和 Web 都从 core 读取，不得硬编码，不得改动或去掉推荐码。
  2. 出口地区不受支持时不展示。
  3. 面向用户的文案只说建议本身，不加佣金说明之类的话（见 §8"页面是给用户看的"）。
