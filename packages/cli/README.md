# claudedoctor

给本机的 Claude Code 做体检：查出问题，能自动改的帮你改，改完再查一遍。

[![npm](https://img.shields.io/npm/v/@diguike/claudedoctor?logo=npm&color=CB3837)](https://www.npmjs.com/package/@diguike/claudedoctor)
[![node](https://img.shields.io/node/v/@diguike/claudedoctor?color=339933&logo=node.js&logoColor=white)](https://nodejs.org)

```bash
npm i -g @diguike/claudedoctor
```

需要 Node.js 20 或更新版本。命令是 `claudedoctor`，也可以敲短别名 `cdoc`。

## 用法

```bash
claudedoctor              # 体检本机，不联网
claudedoctor check --net  # 加查终端的出口地区
claudedoctor check --why  # 展开每条结论的依据
claudedoctor fix          # 选择并应用修复（--dry-run 只看 / --all 全部应用 / --revert 撤销）
claudedoctor verify       # 改完复查
claudedoctor reset        # 预览清缓存，加 --apply 才执行
claudedoctor env          # 打印工具看到的环境，已去掉敏感信息
```

通常的顺序是 `check`，然后 `fix`，再开一个新终端跑 `verify`。

## 它会看什么

- **实际生效的凭证。** API key、网关 token、helper 脚本、订阅登录，哪一个真正在用。环境里残留的 `ANTHROPIC_API_KEY` 经常盖过订阅登录。
- **中转。** 订阅登录有没有被发到非官方地址。
- **客户端来源。** 你运行的 `claude` 是官方安装器、Homebrew、WinGet 还是 npm 装的。这里只看路径，不校验签名。
- **出口**（`--net`）。地区是否在官方支持列表里；IPv4、IPv6 和 Node 自己走的路径分开查。
- **代理设置。** 代理环境变量、系统代理、TUN，以及常见的 Clash / Mihomo 配置。

免 key 的情况下，`--net` 只能查到出口地区和运营方。想看 VPN、代理、机房标记，把 `IPDATA_API_KEY` 设成你自己的 [ipdata.co](https://ipdata.co/) key。

## 修复和清缓存

`fix` 只在 shell profile 里写一段带标记的内容，写之前会备份，`claudedoctor fix --revert` 可以撤销。

`reset --apply` 把可以重新生成的缓存移到 `~/.claudedoctor-cleanup-backups/`，不删除。登录状态、配置、skills 和会话记录都不动。执行前先退出 Claude Code 和 Claude Desktop。

## 隐私

不加 `--net` 就完全在本机运行。加了 `--net` 会把你的公网 IP 发给 ipapi.is 和 ipdata，除此之外不发送任何东西。凭证只判断类型，内容不会被打印或记录。

## 退出码

`0` 没有发现问题 · `1` 有需要注意的项 · `2` 有确认的政策风险 · `64` 命令或参数有误。加 `--json` 输出给脚本用的结果。

体检通过只表示没有发现已知问题，不代表账号一定不会受限。本项目与 Anthropic 无关。

MIT © [递归客](https://diguike.dev/) · [源码](https://github.com/diguike/claudedoctor) · [网页版](https://claudedoctor.pages.dev)
