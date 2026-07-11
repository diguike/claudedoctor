# 🩺 claudedoctor · 克劳德医生

> 给 Claude Code 做政策、访问与环境体检的命令行工具：**检测 → 修复 → 复验**。
> 只碰有因果的信号，每条结论带置信度与出处，诊断都配可复检的修复。不是又一个吓唬人的分数。

[![npm](https://img.shields.io/npm/v/@diguike/claudedoctor?logo=npm&color=CB3837)](https://www.npmjs.com/package/@diguike/claudedoctor)
[![downloads](https://img.shields.io/npm/dm/@diguike/claudedoctor?color=0B9E71)](https://www.npmjs.com/package/@diguike/claudedoctor)
[![node](https://img.shields.io/node/v/@diguike/claudedoctor?color=339933&logo=node.js&logoColor=white)](https://nodejs.org)
[![GitHub](https://img.shields.io/badge/GitHub-diguike%2Fclaudedoctor-24292e?logo=github)](https://github.com/diguike/claudedoctor)

```bash
npm i -g @diguike/claudedoctor      # 命令：claudedoctor（短别名 cdoc）
```

## 用法

```bash
claudedoctor              # 体检本地 Claude Code（默认）
claudedoctor check --why  # 展开每条结论的出处与说明
claudedoctor check --net  # 联网体检出口 IP / 地区 / VPN / 代理 / 机房（免 key）
claudedoctor fix          # 开药：交互勾选并应用修复（--dry-run 只看 / --all 全应用 / --revert 撤销）
claudedoctor verify       # 复诊：字节级复检 + 复跑体检
claudedoctor env          # 打印脱敏环境快照
```

退出码：`0` 健康 · `1` 需注意 · `2` 有确认风险。加 `--json` 输出机器可读结果。

## 它检测什么

- **凭证与中转** — 按官方优先级判断实际认证来源，以及订阅凭证是否被送到非官方端点。
- **客户端来源** — 识别当前活动命令的官方 native / Homebrew / WinGet / npm 分发路径；不把路径识别冒充签名验证。
- **出口网络与 IP 画像** — 地区是否受支持、是否机房/代理/VPN/Tor、第三方信誉标签；双栈环境会按实际返回的 IPv4 / IPv6 路径探测并优先展示更需关注的一条（`--net`，用免 key 的 ipapi.is，可选 ipdata）。
- **设备与遥测透明度、系统时区画像因子** — 如实区分本地 vs 出站，只做可安全获取的部分。

认证优先级覆盖云提供商、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY`、`apiKeyHelper`、官方 `CLAUDE_CODE_OAUTH_TOKEN` 和交互登录。`claude setup-token` 是官方支持的 CI/脚本方式，不会被当成自动化违规。

## 隐私

默认 **100% 本地**，不上传任何环境数据。凭证只做分类，原文永不外泄。出口 IP 体检需 `--net` 显式开启。

## 原则

证据优先、只碰有因果的信号、测对对象（CLI 测终端 / Web 测浏览器）、诊断必配可复检修复。缺失数据不会被当成健康结果。只做合规诊断，不做指纹伪造、号池规避或风控绕过。

MIT © [递归客](https://github.com/diguike) · [源码与文档](https://github.com/diguike/claudedoctor)
