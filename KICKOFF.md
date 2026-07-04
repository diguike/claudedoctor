# 新会话启动提示词（复制到新会话）

在 `claudedoctor/` 目录里开一个新会话，把下面这段作为第一条消息粘进去：

---

这是 **Claude Doctor（克劳德医生，命令 `claudedoctor` / 短别名 `cdoc`）** 项目——一个给
Claude Code 做"体检 → 开药 → 复诊"的真·反侦察工具。**动手前先完整读 `CLAUDE.md`**，它是本项目
最高优先级的设计说明；`docs/mechanism.md` 是取证账本，`README.md` 是对外简介。

请严格按 CLAUDE.md 的立身原则工作：证据优先、只碰有因果的信号、CLI 测终端 / Web 测浏览器不要
张冠李戴、每条结论标注置信度、诊断必须配可复检的修复。

我们从 **M0（取证先行）** 开始，别跳步：

1. 先 `pnpm install`，确认 workspace 能跑（`node packages/cli/bin/claudedoctor.mjs` 应打印占位帮助）。
2. 在 `@claudedoctor/core` 写探针，**实际 dump 出 Claude Code 构造的 system prompt 里
   `Today's date is …` 那一行**，对分隔符和撇号做 hex 取证，在不同 `TZ` / `hostname` 下对比字节。
3. 把验证结论（机制存在 / 已改 / 已移除 / 无法复现，附证据 + 版本 + 出处链接）如实写进
   `docs/mechanism.md`。**在拿到字节级证据之前，不要写任何 `fix` 逻辑。**

M0 完成、机制确认后，再按 CLAUDE.md 的路线图推进 M1（`claudedoctor check`）→ M2（fix/verify 闭环）
→ M3（Web）→ M4（CI 持续追踪）。先跟我确认 M0 的取证方案，再开始写代码。

---
