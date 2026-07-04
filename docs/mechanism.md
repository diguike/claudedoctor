# 机制取证记录（M0）

> 本文件是 Claude Doctor 的"证据账本"。**只写亲眼验证过的事实**，传闻必须标注为传闻。
> 在这里的结论没有字节级证据之前，CLI 的任何"开药"都不得上线。

## 待验证的假说（来源：公开逆向，未经 Anthropic 证实）

Claude Code 指向非官方 `ANTHROPIC_BASE_URL`（中转）时，据称会：
- 读取**系统时区**与**中转 hostname**；
- 把结果隐写进 system prompt 的 `Today's date is …` 行：
  - 命中中国时区时，日期分隔符 `-` → `/`；
  - 撇号在 4 种视觉近似的 Unicode 变体间切换，编码命中"域名清单 / AI 实验室关键词"。

## 结论（2026-07-05 验证）

**重要更正（勿把"证伪"误读成"从来是假的"）**：后续社区取证证明，该隐写机制**曾真实存在**——自 Claude Code **2.1.91（2026-04-02）** 起，`Today's date is …` 行会在系统时区为 `Asia/Shanghai` / `Asia/Urumqi` 等时把 `-` 换成 `/`、并在 4 种视觉相同的撇号 Unicode 变体间切换，编码 3 个 bit（时区命中 / 中转 hostname 命中约 147 条中国域名清单 / 命中 AI 实验室关键词）。Claude Code 团队成员 **Thariq Shihipar 公开承认**这是"三月上线的一个**反未授权转售/反蒸馏实验**"，并称**移除 PR 已合并、随 2026-07-01 版本发布**。

因此正确的三段式表述是：**机制曾真实存在（2.1.91→）→ 官方承认是反滥用/反蒸馏实验 → 已于 2026-07 版本移除 → 我们在 2.1.201 字节级复检证实其消失。**
- 出处：thereallo.dev 逆向；[TechTimes 报道](https://www.techtimes.com/articles/319415/20260701/claude-code-hid-proxy-fingerprints-system-prompts-anthropic-promises-fix.htm)、[MLQ.ai](https://mlq.ai/news/anthropic-removes-hidden-code-from-claude-code-that-covertly-flagged-chinese-users/)、[AI Weekly](https://aiweekly.co/alerts/anthropic-to-remove-claude-code-marker-that-flagged-china-users)。
- 因果边界：该隐写是**给请求打标签的画像标记**（用途：标注"来自中国时区+中转+疑似 AI 实验室"），**没有一手证据证明"命中即封号"**。"隐写=封号开关""一开中国时区就秒封"属社区把同期两事件（封号潮＋发现隐写）关联但未证实因果的夸大。

**当前版本（2.1.201）状态：机制不存在（该代码路径）。** 置信度：**high**（静态字节级 + 运行时线上抓包双重证据）。

`Today's date is …` 行被无条件构造为纯 ASCII `Today's date is YYYY-MM-DD.`：
- 撇号恒为 **ASCII U+0027（`0x27`）**，二进制中不存在任何撇号 Unicode 变体（U+2019 `’` / U+02BC `ʼ` / U+FF07 `＇`）的 "Today's date" 串；
- 日期分隔符恒为 **ASCII 连字符 U+002D（`0x2d`）**，无 `-`→`/`（`0x2f`）替换；
- 无基于 `ANTHROPIC_BASE_URL` / hostname / 时区的分支改写这一行。

**唯一真实的因果**：日期*值*由 `_ho()` 用本地 `new Date()` 生成，所以系统时区只影响"打印的是哪一天"（如 UTC+14 与 UTC-5 可能差一天），**不影响分隔符 / 撇号的编码格式**。这是良性行为，不是隐写指纹。

> 原始说法用过去式（"was reported"）。据本次取证，若该机制曾存在，在 2.1.201 已被移除 / 改写。**在没有 fix 依据的前提下，CLI 不得对"日期行"开任何药。**

## 证据 A · 静态取证（反编译二进制 strings）

来源：`@anthropic-ai/claude-code@2.1.201`，`bin/claude.exe`（231,708,784 字节，bun 编译原生二进制，JS 内嵌，可 `strings` 提取）。

唯一的日期构造点（`strings` 原样摘录）：

```js
// 日期格式化函数 —— 固定 "-"，读本地 new Date()，无时区分支
function _ho(){
  let e=new Date,
      t=e.getFullYear(),
      n=String(e.getMonth()+1).padStart(2,"0"),
      r=String(e.getDate()).padStart(2,"0");
  return `${t}-${n}-${r}`
}
var JEe;
var R8e=b(()=>{ ia(); JEe=Rn(_ho) });   // Rn = 记忆化包装；JEe 全二进制唯一定义

// system prompt 里唯一构造点 —— 无条件，不引用 baseURL/hostname/timezone
currentDate:`Today's date is ${JEe()}.`
// 另有一处运行中改日期的提示，同样是 ASCII 撇号：
// `The date has changed. Today's date is now ${e.newDate}. DO NOT ...`
```

二进制中 "Today's date is " 的 hex（撇号即 `27`）：

```
"Today's date is " → 54 6f 64 61 79 27 73 20 64 61 74 65 20 69 73 20
                                  ^^ 0x27 = ASCII U+0027
```

反向验证（均为空）：
- `_ho` 仅一处定义，`JEe=Rn(_ho)` 仅一处；无第二套日期逻辑；
- 无 `-`→`/` 的日期替换逻辑（所有 `replace(...)` 命中均为正则转义 / 路径处理，与日期无关）；
- 二进制中不存在撇号 Unicode 变体版本的 "Today's date" 串。

## 证据 B · 运行时取证（线上真实发送字节）

方法：本地 logging 代理（`ANTHROPIC_BASE_URL=http://localhost:8787`，本身即"非官方中转"，满足假说触发条件），抓取 `claude -p "hi"` 真实发往 `/v1/messages` 的 system prompt body，对 `Today's date is …` 行做 hex。代理不转发请求，`Authorization` / `x-api-key` 头不落盘。

| 条件 | TZ | 真实发送行 | 撇号字节 | 分隔符字节 | 结论 |
|---|---|---|---|---|---|
| A | `Asia/Shanghai`（中国时区 + 中转） | `Today's date is 2026-07-05.` | `27`（ASCII） | `2d 2d`（ASCII `-`） | 无隐写 |
| B | `America/New_York` | `Today's date is 2026-07-05.` | `27` | `2d 2d` | 无隐写 |
| C | `Pacific/Kiritimati`（UTC+14） | `Today's date is 2026-07-04.` | `27` | `2d 2d` | 仅日期数字随本地日变化 |

条件 A（中国时区）完整 hex：

```
Today's date is 2026-07-05.
54 6f 64 61 79 27 73 20 64 61 74 65 20 69 73 20 32 30 32 36 2d 30 37 2d 30 35 2e
             └27┘ 撇号 ASCII            └2d┘  └2d┘ 分隔符 ASCII（非 2f "/"）  └2e┘
```

跨三种时区：撇号恒 `0x27`、分隔符恒 `0x2d`，唯一变化的是日期数字本身 → 与静态分析一致。

> ⚠️ 抓包中另见含中文的 "Today's date is …" 串，那是**本仓库 CLAUDE.md 项目上下文被一并注入 system prompt** 所致，非 Claude Code 生成行，已区分排除。

## 出处链接

- 假说原始出处：CLAUDE.md 引述的"公开逆向分析"（`FuckClaude` 一类项目），**具体链接待补**（复核时补上原帖 / commit）。
- 本次取证由 Claude Doctor M0 完成，环境：macOS（Darwin 25.4.0），Node v20.19.1，`@anthropic-ai/claude-code@2.1.201`，日期 2026-07-05。

## 复现方法（供 M4 CI 追踪）

1. 定位二进制：`$(npm root -g)/@anthropic-ai/claude-code/bin/claude.exe`
2. 静态：`strings -n 6 claude.exe | grep -E "Today.s date is|function _ho|JEe=Rn"`
3. 运行时：起本地 logging 代理，`TZ=Asia/Shanghai ANTHROPIC_BASE_URL=http://localhost:<port> claude -p "hi"`，hex 抓到的 `Today's date is …` 行。
4. 若某天撇号 ≠ `0x27` 或分隔符出现 `0x2f`，说明机制回归 —— 触发告警并更新本账本。
