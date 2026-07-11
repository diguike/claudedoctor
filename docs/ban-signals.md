# 封号信号证据账本（M1 依据）

> 本文件是 Claude Doctor 对"**真实账号封禁 / 风控信号**"的取证账本。与 `mechanism.md`（M0 日期行隐写取证）并列。
> 立身原则同 CLAUDE.md 第 7 节：**只把有服务端因果的信号归为政策风险；氛围 / 传闻信号单独展示并标注，绝不制造 FUD。**
> 初次取证日期 2026-07-05；最近一次官方文档核对 2026-07-10。每条结论标注 **confirmed / reported / speculative**。

---

## 0. 一句话总纲

> **本地最关键、且有官方条款直接支撑的凭证风险，是订阅凭证（claude.ai OAuth token）被第三方代用户转发。** 官方帮助中心还把“不支持地区创建账号”和一般条款/AUP 违规列为账号停用原因。机房/VPN/代理信誉、时区和行为学推断不能冒充这些官方结论。

因此 CLI 体检的**主轴**是：**你的订阅凭证有没有离开官方客户端？** 而不是浏览器指纹、也不是（M0 已证伪的）日期行隐写。

---

## 1. 信号分层总表（M1 `check` 直接据此实现）

| ID | 信号 | 因果强度 | 可信度 | CLI 本地可测? | 可开药? | 政策风险? |
|---|---|---|---|---|---|---|
| **A1** | `ANTHROPIC_BASE_URL` 指向非官方中转 + 用订阅 OAuth | 强（服务端凭证-客户端绑定校验） | **confirmed** | ✅ 读 env + 判凭证类型 | ✅ 切回官方 / 改用 API key | ✅ 高 |
| **A1′** | 中转为"汇聚型"（多 token 单出口 relay/拼车） | 强（流量特征） | reported | ⚠️ 只能测 URL 特征 | ✅ 提示脱离中转 | ✅ 中 |
| **A2** | 共享 / 转售订阅凭证、多人共用 token | 强（条款明禁 + 官方点名执法） | **confirmed**（条款）/ reported（拼车秒封案例） | ⚠️ 仅测凭证类型，不测"共享行为" | 部分 | ✅ 中 |
| **A2-bug** | 残留被封 org 的 `ANTHROPIC_API_KEY` 覆盖有效订阅登录（假连坐） | 强（confirmed bug） | **confirmed**（claude-code#8327） | ✅ 读 env + 配置 | ✅ 移除 env | ✅ 高（且易修） |
| **A3** | 非官方 / 魔改客户端伪造官方 Claude Code 身份（UA/header） | 强（官方证实触发 abuse filter） | **confirmed** | ⚠️ 只识别活动命令的已知官方分发路径，不能证明二进制完整性 | ✅ 用官方客户端 / API key | ✅ 高 |
| **A3′** | CI 复制交互式登录，而非使用官方非交互认证 | 中 | reported | ✅ `CI` + 有效凭证优先级 | ✅ `setup-token` / API key | ⚠️ 提示 |
| **B4-region** | 出口 IP 属**不支持地区** | 强（官方明列"unsupported location"为封号原因） | **confirmed** | ✅ GeoIP + 官方 allow-list（CLI 需 `--net`） | 建议性 | ✅ 中 |
| **B4-dc** | 出口 IP 为**机房 ASN** → claude.ai OAuth 被 Cloudflare 拦 | 强（接入层，confirmed；非封号） | **confirmed** | ✅ ASN 查询（需联网） | ✅ 换住宅出口 | ⚠️ 提示（是"连不上"不是"封"） |
| **B4-route** | **Node 默认网络栈**与双栈/curl 探测出口不一致 | 中（本机实测、影响 Node/CLI 工具地区判断与可达性） | reported | ✅（`--net` 下本机双探测） | ✅ 开 TUN / 显式 proxy env | ⚠️ 路径提示 |
| **B4-hop** | geo-hopping / 频繁切换国家节点 | 弱（机制合理但无一手证据） | speculative | ❌ | ❌ | ❌ 仅氛围展示 |
| **M0-stego** | 日期行时区/hostname 隐写 | —— | **已证伪@2.1.201**（见 mechanism.md） | ✅ hex 复检 | —— | ❌ 仅"已体检未命中" |
| **AMB** | 浏览器时区/语言/字体/canvas 指纹 | 无（终端进程不参与） | 氛围 | Web 侧才相关 | —— | ❌ 明确标注"不影响 Claude Code" |

> 只有 **A1 / A1′ / A2 / A2-bug / A3 / B4-region** 归入政策风险分类。其余为访问 / 路径 / 环境提示，仍可能使总结果进入 `ATTENTION`，但不会冒充账号封禁概率。

---

## 2. 各信号取证详情

### A1 · 非官方中转 + 订阅凭证（confirmed 主轴）

**结论**：把订阅 OAuth token 通过非官方客户端 / 中转使用，明确违反官方条款且已被实际执行封号。但"设了 `ANTHROPIC_BASE_URL` 就必封"是过度简化——真正的因果是**凭证类型 + 是否脱离官方客户端**，不是环境变量本身。

**一手证据**
- 官方 Claude Code 法律文档 "Authentication and credential use"（**最硬一手**）：
  > "OAuth authentication is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications."
  > "Anthropic does not permit third-party developers to offer Claude.ai login or to route requests through Free, Pro, or Max plan credentials on behalf of their users."
  > "Anthropic reserves the right to take measures to enforce these restrictions and may do so without prior notice."
  — https://code.claude.com/docs/en/legal-and-compliance
- 2026-01-09 服务端封禁第三方 harness，Anthropic 员工 Thariq Shihipar 公开证实："tightened our safeguards against spoofing the Claude Code harness after accounts were banned for triggering abuse filters from third-party harnesses using Claude subscriptions." 新错误信息：*"This credential is only authorized for use with Claude Code and cannot be used for other API requests."*
  — https://news.ycombinator.com/item?id=46549823 · https://venturebeat.com/technology/anthropic-cracks-down-on-unauthorized-claude-usage-by-third-party-harnesses
- 汇聚 vs 轮换架构对比（relay 汇聚被封 / per-profile 官方客户端被接受）：https://dev.to/vainamoinen/two-multi-account-claude-code-architectures-one-anthropic-accepts-one-they-ban-2om7
- 典型中转项目自述（README 自带"可能违反 ToS"提示）：https://github.com/Wei-Shaw/claude-relay-service

**因果机制**：订阅 OAuth token 被设计为只服务官方 harness；非官方客户端/中转无法完整复刻官方握手与遥测 → 服务端判定"订阅凭证被非官方来源使用" → 命中条款 / abuse filter。汇聚型中转还有"同出口 + 多 token + 高并发 + 无遥测"的高辨识流量特征，并造成**同池交叉传染**（一个号触发风控，同出口其他号连坐）。

**⚠️ 重要 nuance（防 FUD）**：官方 [LLM gateway 文档](https://code.claude.com/docs/en/llm-gateway) 明确支持通过 `ANTHROPIC_BASE_URL` 配置网关，并记录 `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` 的认证方式。红线是第三方替用户转发 Free/Pro/Max 订阅凭证，不是网关变量本身。

当前官方认证优先级（[Authentication](https://code.claude.com/docs/en/authentication)）：云提供商 → `ANTHROPIC_AUTH_TOKEN` → `ANTHROPIC_API_KEY` → `apiKeyHelper` → `CLAUDE_CODE_OAUTH_TOKEN` → 交互式登录。`claude setup-token` 生成的长效 token 应放在 `CLAUDE_CODE_OAUTH_TOKEN`，官方明确支持用于 CI / 脚本。

---

### A2 · 共享 / 转售凭证（confirmed 条款 + reported 案例）

**结论**：共享登录凭证 / API key、转售访问、拼车共用 token，明确违反 Consumer Terms，且官方公开点名执法。CLI 本地**只能测凭证类型与卫生，测不了"是否在共享"**（共享是服务端按并发/多 IP 检测的）。

**官方条款（confirmed）** — Consumer Terms §2：
> "You may not share your Account login information, Anthropic API key, or Account credentials with anyone else. You also may not make your Account available to anyone else."
> §3 禁止 "resell the Services"；§12 违约可无通知暂停/终止。
— https://www.anthropic.com/legal/consumer-terms
- 官方 2025-07-28 限流公告直接点名 "account sharing and reselling access" 为违规动因：https://techcrunch.com/2025/07/28/anthropic-unveils-new-rate-limits-to-curb-claude-code-power-users/

**拼车秒封案例（reported）**：sub2api/CRS issue 区大量"多人共享秒封""2 小时被封"一手抱怨；知乎称 2026-03 起中转圈大清洗、10-50 人拼车"活不过 48 小时"。
- https://github.com/Wei-Shaw/sub2api/issues/2781 · https://github.com/Wei-Shaw/sub2api/issues/1374 · https://zhuanlan.zhihu.com/p/2035004013914140693
- ⚠️ 其中"prompt 风格熵 / 工作时间熵多人格检测"等机制说法 = **speculative**，不归入政策风险。

**A2-bug（confirmed，可测可修的实锤）**：环境里残留**被封 org 的 `ANTHROPIC_API_KEY`** 会**覆盖**有效的订阅登录，表现为"订阅也用不了"的假连坐。
— https://github.com/anthropics/claude-code/issues/8327 → **检测项 + 一键修复（提示移除该 env）**。

**API key vs 订阅 OAuth 风控差异（落地关键）**

| 维度 | 裸 API key `sk-ant-api03-*` | 订阅 OAuth `sk-ant-oat*` / claude.ai 登录 |
|---|---|---|
| 第三方工具/中转中使用 | **官方允许** | **官方禁止**（Consumer Terms "Authentication and credential use"） |
| 转售套利动机 | 弱（按量计费） | 强（月费 vs 按量差价）→ 风控重点 |
| 技术边界 | 可用于官方记录的 API / gateway 认证 | 应通过官方客户端，或按文档放在 `CLAUDE_CODE_OAUTH_TOKEN`；放错到通用 API/gateway 变量会失败或把凭证交给错误端点 |
| 封禁粒度 | **org 级**（org 停用则该 org 所有 key 失效） | **账号级**（Web + Claude Code 一起失效） |

---

### A3 · 客户端完整性（confirmed，与 A1 同源）

**结论**：伪造官方 Claude Code 身份（用订阅 token + 伪造 HTTP header 冒充官方 binary）是被官方证实的封号向量，触发 abuse filter 自动封号。**但存在误伤，Anthropic 事后主动解封**——文案严禁写成"用第三方工具必封"。

**一手证据**
- Thariq（Anthropic）公开声明 + VentureBeat 报道（同 A1）。
- 服务端按**工具专属前缀**识别第三方工具：OpenCode PR 把前缀 `oc_`→`mcp_` 以绕过初期检测，反证 Anthropic 在按前缀/header 识别。
  — https://paddo.dev/blog/anthropic-walled-garden-crackdown/ · https://news.ycombinator.com/item?id=46625918
- 历史 issue 记录了把 OAuth token 当通用 API 凭证时被拒绝：https://github.com/anthropics/claude-code/issues/28091。**这不等于 setup-token 已被禁用**；当前官方文档明确支持将其放在 `CLAUDE_CODE_OAUTH_TOKEN` 用于 CI / 脚本。

**因果链（confirmed）**：第三方客户端用订阅 OAuth → 发伪造 header 冒充官方 binary → 无官方遥测 + 异常流量 → 触发 abuse filter → 自动封号（含误伤 → 官方回滚）。

**speculative（不归入政策风险）**：具体封哪些 UA 字符串、TLS/JA3 指纹、beta header 精确清单——各来源均称未披露。

**A3′ 自动化边界（reported）**：abuse filter 存在，但阈值 / 并发 / 速率触发条件**未公开**，本地无法量化。工具只检查 CI 是否错误复用交互式登录，并引导到官方 `setup-token` / API key；不会把官方支持的 `CLAUDE_CODE_OAUTH_TOKEN` 误报为自动化违规。

**官方条款（confirmed）** — AUP："Intentionally bypass capabilities, restrictions, or guardrails…"、"Coordinate malicious activity across multiple accounts…"、"Utilize automation in account creation or to engage in spammy behavior"、"Circumvent a ban through the use of a different account…" — https://www.anthropic.com/legal/aup

---

### B4 · IP / 地域（confirmed 地区政策 + speculative geo-hopping）

**结论**：与 IP 直接相关且**官方证实**的只有两条——**不支持地区**（封号硬因）、**机房 IP 被 Cloudflare 拦 OAuth**（访问被拒，非封号）。"VPN → 封号""频繁切节点必封"是 reported / speculative，且大量归因偏差（最大封号潮 2026-01 其实是 harness 伪造检测误伤，与 IP 无关）。

**confirmed**
- 官方帮助中心明列封号原因含 "Account creation from an unsupported location"：https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals
- 不支持地区 API 直接 `400 …unsupported countries, regions, or territories`：https://github.com/anthropics/claude-code/issues/2656
- 机房 IP 被 Cloudflare 拦 claude.ai OAuth 端点（"Just a moment…"），Anthropic 标为 external：https://github.com/anthropics/claude-code/issues/36201 · https://github.com/anthropics/claude-code/issues/10050
- 官方支持地区列表（不含中国大陆/港澳、俄、伊朗等）：https://www.anthropic.com/supported-countries
- 官方从未发布"用 VPN 即违规"条款——被禁止的是"从不支持地区访问/注册"这一**结果**，VPN 只是手段。

**reported**：企业 VPN + Max 付费用户被封（claude-code#51583）；开 VPN 1 小时后被封（HN Ask HN #48641160）。封号是真的，"VPN 是原因"是用户推测。

**speculative（不归入政策风险，防 FUD）**："1 小时切美/日/港节点必封""IP 占封号原因 60%""申诉成功率 3.3%"——全部出自 VPN 厂商 / 中转商 / 防指纹浏览器引流文，无出处、有变现动机。

**落地**：`B4-region`（出口 IP 是否官方支持地区）与 `B4-dc`（是否机房 ASN，影响 OAuth 可达性）有因果、可检测、可开药；`B4-route` 用本机实测识别"浏览器/部分 curl 已出海，但 Node/CLI 工具仍直连本地"的代理路径不一致；`B4-hop` 只作氛围提示。**CLI 的这些查询默认关闭，显式传 `--net` / `--online` 才执行；Web 为即时结果自动查询，并在界面中明确第三方数据源和检测边界。**

### B4-route · Node / CLI 代理路径不一致（reported，本机实测）

**结论**：在"只开系统代理、未开 TUN"的常见配置下，浏览器和部分 `curl` 请求可能已经走了海外出口，但 **Node 默认网络栈** 仍然本地直连或命中另一条分流路径。对 Claude Code / `claudedoctor` / 其它 Node-based CLI 来说，这会直接造成**地区判断和可达性不一致**。

**为什么要做这个检测**
- 这不是服务端公开规则，而是**本机可复现的路径卫生问题**：同一台机器上，`curl` / 双栈探测显示支持地区，但 Node `fetch` 仍显示中国等不支持地区。
- 对用户来说，这类问题的体感极差：网页看着正常，命令行工具却仍报 unsupported region / China。
- 这类问题可以给出明确药方：**优先开 TUN**；否则给命令行工具显式设置 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`。

**在 Claude Doctor 里的实现**
- `--net` 下同时做两类探测：
  - **双栈/curl 路径**：`curl -4/-6` 强制 IPv4/IPv6，看网络层真实出口；
  - **当前 Node 运行时路径**：当前进程的默认 `fetch` 看到什么出口。
- 如果两者国家/IP 不一致，就提示 `B4-route`。它属于"路径卫生"而非官方封号条款；若探测到实际不支持地区，会让总结果进入 `ATTENTION`。

**药方**
- 最稳：开启代理客户端 **TUN mode**
- 否则：给目标 shell/命令显式设置
  - `HTTP_PROXY=http://127.0.0.1:<port>`
  - `HTTPS_PROXY=http://127.0.0.1:<port>`
  - `ALL_PROXY=socks5h://127.0.0.1:<port>`

---

## 3. 官方条款速查（CLI 引用前建议对原页做一次核对）

| 主题 | 出处 |
|---|---|
| 订阅 OAuth 仅限官方应用 / 禁第三方转发订阅凭证 / 无预警执行 | https://code.claude.com/docs/en/legal-and-compliance |
| 禁共享登录/凭证/API key、禁转售、无通知终止 | https://www.anthropic.com/legal/consumer-terms |
| 禁绕过封禁 / 禁跨号协同规避 / 受支持地区限制 | https://www.anthropic.com/legal/aup |
| 商用转售限制 | https://www.anthropic.com/legal/commercial-terms |
| 封禁原因与申诉（含 unsupported location） | https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals |
| 官方支持地区列表 | https://www.anthropic.com/supported-countries |

---

## 4. 对 M0 结论的交叉印证

四份独立取证（A1/A2/A3/B4）**一致**把中文社区的"时区/域名黑名单/`Today's date` 撇号隐写"标为 **speculative、未经 Anthropic 证实、且属与凭证机制不同的另一条**。这与本项目 M0 的字节级结论（`mechanism.md`：该机制在 2.1.201 **已证伪**）一致。→ **日期行隐写不归入政策风险，仅作"已体检未命中"展示。**

---

## 5. 给 M1 的实现约束

1. **有效凭证优先级判定是一切的前置**：按官方顺序处理云提供商、bearer gateway token、API key、`apiKeyHelper`、`CLAUDE_CODE_OAUTH_TOKEN` 与交互登录；不能根据“某个凭证存在”就假设它实际生效。
2. **只对 confirmed/reported 且有本地因果的信号开药**；speculative 只展示，不形成政策结论。
3. **CLI 联网检测（B4）默认关闭**，`--net` 显式开启；不上传任何环境或凭证数据。
4. **文案防 FUD**：区分"访问被拒"（机房 IP/地区）与"账号被封"（订阅凭证脱离官方客户端）；明说"误伤存在、官方会解封"。
5. 每条结论在 CLI 输出里都带 confidence + 出处（可 `--why` 展开）。

---

## 6. 反封禁对抗检测扩展（三思路研究，2026-07-05）

三条思路（源码/政策 · 社区 · 红蓝对抗）联合取证的结论。**总纲不变**：能安全本地检测的都是"卫生自查——你这一端会不会被误判"，不是"替你估算 Anthropic 的风控分"。多数 fraud 向量是服务端信号，本地物理上看不到；工具**帮真实用户别被误伤，不帮任何人骗过风控**。

### 6.1 设备与会话（confirmed 机制存在，reported→封号）

- **Trusted-device 登记（二进制实证）**：Claude Code 登录时会向服务端登记本机、拿 `device_id` + trusted-device token（`[trusted-device] Enrolled device_id=…`；可被 `CLAUDE_TRUSTED_DEVICE_TOKEN` 覆盖）。→ 账号-设备绑定是**真实内建能力**。
- **本地身份文件 `~/.claude.json`**：`machineID = randomBytes(32)`（一次性随机、持久化、**grep 证实从不出站**）；`userID = sha256(loginSession)`（稳定绑账号）；`oauthAccount`（含 org/account uuid、`organizationType: claude_max`）。
- **遥测实际出站身份**（`~/.claude/telemetry/*` 落盘样本）：`account_uuid` + `organization_uuid` + `device_id(=userID 哈希)` + `session_id` + env(platform/arch/shell/terminal/is_ci…)。**注意 machineID 不在其中**。
- **出站请求头**：`x-stainless-*`（环境描述）、`x-app=cli`、`X-Claude-Code-Session-Id`、`user-agent=claude-cli/2.1.201 (external, cli)`、OAuth Bearer。（`x-client-*`/MSAL 头是打包的微软认证库残留，**非** Anthropic 出站头，勿张冠李戴。）
- **官方能力**：claude.ai → Settings → Account → **Active Sessions** 可看每台设备/位置/最后活跃并逐个踢下线（[官方文档](https://support.claude.com/en/articles/13124001-managing-your-active-sessions)）。
- **因果边界**：个人 Pro/Max 下**多设备本身不违规**（只共享额度）。真正触发的是"**同一凭证被非官方客户端/多人使用的模式**"——与 A1/A2 同源。**"登了几台机器"不是信号，"一机反复切换多个订阅号/号池特征"才是。**
- **安全红线**：**绝不用 OAuth token 去打 claude.ai 的 active-sessions/账号接口"数设备"**——那正是政策点名的消费级凭证未授权自动化，会让工具自己变 sketchy。账号级设备清单**一律引导用户去官方 dashboard 自查**，CLI 只给深链。

### 6.2 时区（三段式，见 mechanism.md）

网传"中国时区被针对"**并非纯空穴来风，也不是"一开中国时区就秒封"**。准确定性：`Asia/Shanghai` + 非官方中转 hostname 命中中国域名/AI 实验室清单 这个**组合**，曾被 Anthropic 用作**反滥用/反蒸馏的画像标记**（官方承认，2.1.91→，已于 2026-07 移除）。→ "时区作为风险画像相关因子"有官方背书；具体隐写实现已移除且我们复检证实。**时区仍只作氛围/画像因子展示，不归入政策风险。**

### 6.3 自动化 / 超人类用量（reported，官方点名此类模式）

官方当前提供两条明确的非交互路径：**API key**，或 `claude setup-token` 生成并放在 `CLAUDE_CODE_OAUTH_TOKEN` 的长效 token。→ 本地只对 `CI=true` 且复用交互式登录文件的情况提示迁移，不对官方 setup-token 制造风险结论。

### 6.4 本地可落地的新检测项（安全、不越界、可开药）

| ID | 检测项 | 本地安全获取 | 分类 | 状态 |
|---|---|---|---|---|
| **A5-device-transparency** | 读 `~/.claude.json`/statsig/telemetry，透明展示"本地 vs 出站"身份；提示"同机长期多订阅号=号池画像之一" | ✅ 只读、不外传、不读 token 明文 | reported 提示 | 已实现 |
| **A6-automation** | `CI` + 交互式登录 → 提示改用 `CLAUDE_CODE_OAUTH_TOKEN` / API key | ✅ | 提示 | 已实现 |
| **A7-register-consistency** | 用户可选填注册国，与当前出口 geo 对比（触达"注册地=confirmed 封号因"） | ✅ 纯本地对比 | reported | 可选 |
| **B4+ ASN 富化** | 展示原始 ASN/org/rDNS，判断"服务端看像住宅还是机房/中转" | ✅（已有 probe 字段） | 信息增强 | 快速可做 |
| **设备清单深链** | 引导去官方 Active Sessions 自查 | ✅ 只给链接 | —— | 建议实现 |

### 6.5 明确不做（做了就从"医生"变"黑产工具"）

生成/清除/伪造 machineID·installation-id·JA3/TLS·`x-stainless-*` 以规避指纹；请求节奏塑形"装人类"；号池/多开/拼车的检测规避辅助；任何"帮已违规账号逃避封禁"的功能。**判据**：修复动作是让用户**更接近官方预期的正常用量（合规）**，还是让他**更难被系统识别（作弊）**——只做前者。
