<div align="center">

<picture>
  <source srcset="https://raw.githubusercontent.com/diguike/claudedoctor/main/packages/web/public/og.svg" type="image/svg+xml" />
  <img src="https://raw.githubusercontent.com/diguike/claudedoctor/main/packages/web/public/og.png" alt="Claude Doctor" width="1200" />
</picture>

# Claude Doctor · 克劳德医生

**Evidence-first diagnostics for Claude Code: check, fix, verify.**<br>
**把政策风险、访问问题与环境信息分开判断，不把不确定性伪装成精确分数。**

[![CI](https://github.com/diguike/claudedoctor/actions/workflows/ci.yml/badge.svg)](https://github.com/diguike/claudedoctor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@diguike/claudedoctor?logo=npm&color=CB3837)](https://www.npmjs.com/package/@diguike/claudedoctor)
[![downloads](https://img.shields.io/npm/dm/@diguike/claudedoctor?color=16885B)](https://www.npmjs.com/package/@diguike/claudedoctor)
[![node](https://img.shields.io/node/v/@diguike/claudedoctor?logo=node.js&logoColor=white)](https://nodejs.org)
[![license](https://img.shields.io/github/license/diguike/claudedoctor)](LICENSE)

[Live browser check](https://claudedoctor.pages.dev) · [Evidence ledger](docs/ban-signals.md) · [Threat model](docs/threat-model.md)

</div>

> [!IMPORTANT]
> A clean result means Claude Doctor found no known issue in the dimensions it could observe. It is not a suspension probability, a guarantee of account safety, or an explanation of Anthropic's private enforcement systems.

## Quick start

```bash
npm install --global @diguike/claudedoctor

claudedoctor                 # local check; no network call
claudedoctor check --why     # include reasoning and sources
claudedoctor check --net     # add egress region and IP intelligence
claudedoctor fix             # preview/select reversible remediations
claudedoctor verify          # byte-level date-line check + full re-check
claudedoctor env --json      # sanitized environment snapshot
```

`cdoc` is a short alias for `claudedoctor`. Exit codes are stable for automation:

| Code | Meaning |
|---:|---|
| `0` | No risk or warning found in completed checks |
| `1` | Attention required, including access/path hygiene or an incomplete requested probe |
| `2` | Confirmed policy-risk vector detected |
| `64` | Invalid command or option |

Use `--json` for schema-versioned machine output.

## What it checks

| Area | Current capability | Boundary |
|---|---|---|
| Authentication | Models documented precedence: cloud provider, bearer gateway token, API key, `apiKeyHelper`, `CLAUDE_CODE_OAUTH_TOKEN`, interactive login | Secret values are classified locally and never enter Core or output |
| Relay policy | Detects subscription credentials routed to a non-first-party `ANTHROPIC_BASE_URL` | API-key gateways are supported; host-name heuristics remain `reported` |
| Client source | Resolves the active `claude` command and recognizes native, Homebrew, WinGet, and npm distribution paths | Path/version recognition is not signature or hash verification |
| Region policy | Compares egress ISO code with the current official supported-region allow-list | Requires `--net`; country-level data cannot evaluate subnational exceptions |
| IP access/reputation | Reports datacenter, VPN/proxy, Tor, abuse, ASN, and IPv4/IPv6 differences | Third-party intelligence can be wrong; these are access/reputation notices, not direct ban claims |
| Local path hygiene | Checks proxy environment, system proxy/TUN routes, and supported Clash/Mihomo configuration shapes | Platform- and client-specific; recommendations do not prove the final route |
| Date-line forensics | Captures the real outbound date line locally and checks both apostrophe and separator bytes | The historical marker is removed in verified versions; a regression causes `ATTENTION` but is not labeled a policy-risk vector |

The evidence class on every finding is one of `confirmed`, `reported`, or `speculative`. `WARN` always affects the health summary; the separate `scored` field indicates whether a finding is an account-policy vector rather than an access/context issue.

## Check → fix → verify

`fix` writes only to a clearly delimited managed block in the selected shell profile. Existing profile content is preserved, every edit receives a timestamped backup, values are shell-quoted, and `fix --revert` removes the block.

```bash
claudedoctor fix --dry-run   # never writes
claudedoctor fix             # interactive selection
claudedoctor fix --all       # apply every safe automatic remediation
claudedoctor fix --session   # print POSIX shell commands; no file write
claudedoctor fix --revert    # remove the managed block
```

Network and advisory findings that cannot be changed safely are shown as manual actions instead of being silently dropped.

## Privacy

- `check`, `fix`, and `env` are local by default.
- Raw credentials are never printed, logged, or passed into `@claudedoctor/core`.
- CLI network checks run only with `--net` and disclose the public egress IP to ipapi.is. If `IPDATA_API_KEY` is set, the in-process runtime-path probe may also use ipdata; the key is never placed in `curl` arguments.
- The public Web UI automatically contacts ipify and ipapi.is to render its browser-side network check. It cannot see local credentials, Claude configuration, or the active terminal route.
- Failed observation is `WARN`/`UNKNOWN`, never a fabricated clean result or sample score.

See the full [threat model and explicit non-goals](docs/threat-model.md).

## Platform status

| Platform | Status |
|---|---|
| macOS | Full credential, client-source, shell-profile, local proxy, and network probes |
| Linux / WSL | Credential, client-source, shell-profile, and network probes; route/client-specific proxy parsing is best effort |
| Windows | Credential, client-source, and network checks; automatic profile fixes are intended for Git Bash/WSL until native PowerShell support lands |

Node.js 20 or newer is required.

## Repository

```text
packages/
├── core/   pure sanitized-input → findings logic; no I/O
├── cli/    local collectors, network/byte probes, rendering, reversible fixes
└── web/    static browser check; region data generated from Core at build time
```

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm validate               # typecheck + tests + Web build + npm tarball audit
pnpm dev:web                # http://localhost:4321
```

The test suite locks down credential precedence, unsupported-region coverage, warning summaries, byte verification, invalid flags, and shell escaping. CI runs on Node 20 and 22. The npm tarball audit verifies required files, license inclusion, source exclusion, and package size.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a detector. Bug reports and feature requests use structured templates so evidence and privacy impact are explicit. Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

Claude Doctor is independent open-source software and is not affiliated with or endorsed by Anthropic. It does not provide ban evasion, identity spoofing, account pooling, traffic shaping, or safeguard bypass features.

## 中文摘要

Claude Doctor 的核心不是“给中国用户打分”，而是把三件事拆开：

1. **政策风险**：例如订阅凭证是否被送到非官方端点。
2. **访问/信誉问题**：例如不支持地区、机房 IP、VPN/代理/Tor 标签与双栈路径差异。
3. **环境信息**：例如当前时区、遥测文件和本地身份是否存在，明确不混入封禁结论。

默认检查不联网；`--net` 才查询出口。网页为了即时传播和体验会自动做浏览器侧联网检测，但它看不到本地凭证和终端真实配置。所有结论都保留证据等级、检测边界和复检方式。

MIT © [递归客](https://github.com/diguike)
