# 封号信号证据账本（M1 依据）

> 本文件是 Claude Doctor 对"**真实账号封禁 / 风控信号**"的取证账本。与 `mechanism.md`（M0 日期行隐写取证）并列。
> 立身原则同 CLAUDE.md 第 7 节：**只把有服务端因果的信号计入风险分；氛围 / 传闻信号单独展示并标注，绝不制造 FUD。**
> 取证日期 2026-07-05。每条结论标注 **confirmed / reported / speculative**。

---

## 0. 一句话总纲

> **目前唯一被 Anthropic 官方证实的封号因果，是"订阅凭证（claude.ai OAuth token）脱离官方 Claude Code 客户端使用"** —— 无论是第三方 harness（OpenCode / Cline / RooCode…）还是汇聚型中转（relay / 镜像 / 拼车）。其余信号（IP、拼车行为学、时区隐写）要么是"访问被拒而非封号"，要么是社区观测 / 传闻。

因此 CLI 体检的**主轴**是：**你的订阅凭证有没有离开官方客户端？** 而不是浏览器指纹、也不是（M0 已证伪的）日期行隐写。

---

## 1. 信号分层总表（M1 `check` 直接据此实现）

| ID | 信号 | 因果强度 | 可信度 | CLI 本地可测? | 可开药? | 计入风险分? |
|---|---|---|---|---|---|---|
| **A1** | `ANTHROPIC_BASE_URL` 指向非官方中转 + 用订阅 OAuth | 强（服务端凭证-客户端绑定校验） | **confirmed** | ✅ 读 env + 判凭证类型 | ✅ 切回官方 / 改用 API key | ✅ 高 |
| **A1′** | 中转为"汇聚型"（多 token 单出口 relay/拼车） | 强（流量特征） | reported | ⚠️ 只能测 URL 特征 | ✅ 提示脱离中转 | ✅ 中 |
| **A2** | 共享 / 转售订阅凭证、多人共用 token | 强（条款明禁 + 官方点名执法） | **confirmed**（条款）/ reported（拼车秒封案例） | ⚠️ 仅测凭证类型，不测"共享行为" | 部分 | ✅ 中 |
| **A2-bug** | 残留被封 org 的 `ANTHROPIC_API_KEY` 覆盖有效订阅登录（假连坐） | 强（confirmed bug） | **confirmed**（claude-code#8327） | ✅ 读 env + 配置 | ✅ 移除 env | ✅ 高（且易修） |
| **A3** | 非官方 / 魔改客户端伪造官方 Claude Code 身份（UA/header） | 强（官方证实触发 abuse filter） | **confirmed** | ✅ 判运行的是不是官方 binary | ✅ 用官方客户端 / API key | ✅ 高 |
| **A3′** | 异常自动化 / 高频请求触发 abuse filter | 中（机制确证，阈值未公开） | reported | ❌ 本地难量化 | 提示性 | ⚠️ 仅提示 |
| **B4-region** | 出口 IP 属**不支持地区** | 强（官方明列"unsupported location"为封号原因） | **confirmed** | ✅ GeoIP（需联网 opt-in） | 建议性 | ✅ 中 |
| **B4-dc** | 出口 IP 为**机房 ASN** → claude.ai OAuth 被 Cloudflare 拦 | 强（接入层，confirmed；非封号） | **confirmed** | ✅ ASN 查询（需联网） | ✅ 换住宅出口 | ⚠️ 提示（是"连不上"不是"封"） |
| **B4-hop** | geo-hopping / 频繁切换国家节点 | 弱（机制合理但无一手证据） | speculative | ❌ | ❌ | ❌ 仅氛围展示 |
| **M0-stego** | 日期行时区/hostname 隐写 | —— | **已证伪@2.1.201**（见 mechanism.md） | ✅ hex 复检 | —— | ❌ 不计分，仅"已体检未命中" |
| **AMB** | 浏览器时区/语言/字体/canvas 指纹 | 无（终端进程不参与） | 氛围 | Web 侧才相关 | —— | ❌ 明确标注"不影响 Claude Code" |

> 计入风险分的只有：**A1 / A1′ / A2 / A2-bug / A3 / B4-region**。其余为提示 / 氛围，单独展示。

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

**⚠️ 重要 nuance（防 FUD）**：**裸 API key（`sk-ant-api03-*`）通过中转/第三方工具使用是官方明确允许的**（The Register 引官方原话）。红线只对**订阅 OAuth**。所以 A1 检测必须先判凭证类型，再定风险等级。

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
- ⚠️ 其中"prompt 风格熵 / 工作时间熵多人格检测"等机制说法 = **speculative**，不入分。

**A2-bug（confirmed，可测可修的实锤）**：环境里残留**被封 org 的 `ANTHROPIC_API_KEY`** 会**覆盖**有效的订阅登录，表现为"订阅也用不了"的假连坐。
— https://github.com/anthropics/claude-code/issues/8327 → **检测项 + 一键修复（提示移除该 env）**。

**API key vs 订阅 OAuth 风控差异（落地关键）**

| 维度 | 裸 API key `sk-ant-api03-*` | 订阅 OAuth `sk-ant-oat*` / claude.ai 登录 |
|---|---|---|
| 第三方工具/中转中使用 | **官方允许** | **官方禁止**（Consumer Terms "Authentication and credential use"） |
| 转售套利动机 | 弱（按量计费） | 强（月费 vs 按量差价）→ 风控重点 |
| 技术封锁 | 无客户端指纹校验 | 服务端校验官方客户端指纹；`sk-ant-oat*` 已被 API 端点整体拒绝 |
| 封禁粒度 | **org 级**（org 停用则该 org 所有 key 失效） | **账号级**（Web + Claude Code 一起失效） |

---

### A3 · 客户端完整性（confirmed，与 A1 同源）

**结论**：伪造官方 Claude Code 身份（用订阅 token + 伪造 HTTP header 冒充官方 binary）是被官方证实的封号向量，触发 abuse filter 自动封号。**但存在误伤，Anthropic 事后主动解封**——文案严禁写成"用第三方工具必封"。

**一手证据**
- Thariq（Anthropic）公开声明 + VentureBeat 报道（同 A1）。
- 服务端按**工具专属前缀**识别第三方工具：OpenCode PR 把前缀 `oc_`→`mcp_` 以绕过初期检测，反证 Anthropic 在按前缀/header 识别。
  — https://paddo.dev/blog/anthropic-walled-garden-crackdown/ · https://news.ycombinator.com/item?id=46625918
- `sk-ant-oat*`（`claude setup-token` 产物）已被 API 端点整体拒绝：https://github.com/anthropics/claude-code/issues/28091

**因果链（confirmed）**：第三方客户端用订阅 OAuth → 发伪造 header 冒充官方 binary → 无官方遥测 + 异常流量 → 触发 abuse filter → 自动封号（含误伤 → 官方回滚）。

**speculative（不入分）**：具体封哪些 UA 字符串、TLS/JA3 指纹、beta header 精确清单——各来源均称未披露。

**A3′ 自动化滥用（reported）**：abuse filter 确实存在（官方用词），但阈值 / 并发 / 速率触发条件**未公开**。本地无法量化 → 只作提示，不编造数字。

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

**speculative（不入分，防 FUD）**："1 小时切美/日/港节点必封""IP 占封号原因 60%""申诉成功率 3.3%"——全部出自 VPN 厂商 / 中转商 / 防指纹浏览器引流文，无出处、有变现动机。

**落地**：`B4-region`（出口 IP 是否官方支持地区）与 `B4-dc`（是否机房 ASN，影响 OAuth 可达性）有因果、可检测、可开药；`B4-hop` 只作氛围提示。**全部需联网查询 → 默认关闭，显式 opt-in（`--net` / `--online`），符合"默认 100% 本地"隐私原则。**

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

四份独立取证（A1/A2/A3/B4）**一致**把中文社区的"时区/域名黑名单/`Today's date` 撇号隐写"标为 **speculative、未经 Anthropic 证实、且属与凭证机制不同的另一条**。这与本项目 M0 的字节级结论（`mechanism.md`：该机制在 2.1.201 **已证伪**）一致。→ **日期行隐写不计入风险分，仅作"已体检未命中"展示。**

---

## 5. 给 M1 的实现约束

1. **凭证类型判定是一切的前置**：先分清"裸 API key" vs "订阅 OAuth" vs "混用"，A1/A2/A3 的风险等级完全依赖它（裸 key 过中转合规，订阅 OAuth 过中转是红线）。
2. **只对 confirmed/reported 且有本地因果的信号开药**；speculative 只展示不评分。
3. **联网检测（B4）默认关闭**，`--net` 显式开启；不上传任何环境数据。
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

网传"中国时区被针对"**并非纯空穴来风，也不是"一开中国时区就秒封"**。准确定性：`Asia/Shanghai` + 非官方中转 hostname 命中中国域名/AI 实验室清单 这个**组合**，曾被 Anthropic 用作**反滥用/反蒸馏的画像标记**（官方承认，2.1.91→，已于 2026-07 移除）。→ "时区作为风险画像相关因子"有官方背书；具体隐写实现已移除且我们复检证实。**时区仍只作氛围/画像因子展示，不进因果风险分。**

### 6.3 自动化 / 超人类用量（reported，官方点名此类模式）

"非交互 + SDK 入口 + 高频 + 高 token"像 bot 而非人类，易触发 abuse filter；官方立场是这类用法改用 **API key**。→ 本地可检测 `CI=true`/无 TTY 叠加订阅凭证并提示合规迁移。

### 6.4 本地可落地的新检测项（安全、不越界、可开药）

| ID | 检测项 | 本地安全获取 | 计分 | 状态 |
|---|---|---|---|---|
| **A5-device-transparency** | 读 `~/.claude.json`/statsig/telemetry，透明展示"本地 vs 出站"身份；提示"同机长期多订阅号=号池画像之一" | ✅ 只读、不外传、不读 token 明文 | 不计分（reported 提示） | 建议实现 |
| **A6-automation** | `CI`/非交互 + 订阅凭证 → 提示改用 API key | ✅ | 低权重提示 | 建议实现 |
| **A7-register-consistency** | 用户可选填注册国，与当前出口 geo 对比（触达"注册地=confirmed 封号因"） | ✅ 纯本地对比 | reported | 可选 |
| **B4+ ASN 富化** | 展示原始 ASN/org/rDNS，判断"服务端看像住宅还是机房/中转" | ✅（已有 probe 字段） | 信息增强 | 快速可做 |
| **设备清单深链** | 引导去官方 Active Sessions 自查 | ✅ 只给链接 | —— | 建议实现 |

### 6.5 明确不做（做了就从"医生"变"黑产工具"）

生成/清除/伪造 machineID·installation-id·JA3/TLS·`x-stainless-*` 以规避指纹；请求节奏塑形"装人类"；号池/多开/拼车的检测规避辅助；任何"帮已违规账号逃避封禁"的功能。**判据**：修复动作是让用户**更接近官方预期的正常用量（合规）**，还是让他**更难被系统识别（作弊）**——只做前者。
