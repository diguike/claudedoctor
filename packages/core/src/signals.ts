/**
 * Signal detectors — one pure function per signal, `(input) => Finding | null`.
 * A null return means "not applicable / nothing to say". Evidence and causal
 * labels come straight from docs/ban-signals.md. Nothing here does I/O.
 */
import { SOURCES, regionSupport } from './catalog.js';
import type { DoctorInput, Finding } from './types.js';

type Detector = (input: DoctorInput) => Finding | null;

function networkSource(i: NonNullable<DoctorInput['network']>): string {
  const family = i.selectedFamily ? `/${i.selectedFamily}` : '';
  return `${i.provider}${family}${i.egressIp ? ` · ${i.egressIp}` : ''}`;
}

function familyBreakdown(i: NonNullable<DoctorInput['network']>): string {
  const entries = Object.entries(i.families ?? {})
    .filter(([, v]) => v)
    .map(([family, v]) => `${family.toUpperCase()}=${v!.countryName ?? v!.countryCode ?? '—'}${v!.egressIp ? ` · ${v!.egressIp}` : ''}`);
  return entries.length >= 2 ? `；双栈：${entries.join('；')}` : '';
}

function splitAiGroupMembers(members: string[]): { generic: string[]; dedicated: string[] } {
  const generic = members.filter((x) => /(自动选择|故障转移|自动回退|fallback|url-test|load-balance|select|直连|拒绝|DIRECT|REJECT)/i.test(x));
  const dedicated = members.filter((x) => !generic.includes(x));
  return { generic, dedicated };
}

/** L0 — local proxy client presence. Informational only; helps explain later path findings. */
const proxyClient: Detector = (i) => {
  const lp = i.localProxy;
  if (!lp || lp.apps.length === 0) return null;
  return {
    id: 'L0-proxy-client',
    title: '本地代理客户端',
    status: 'info',
    confidence: 'reported',
    causal: false,
    scored: false,
    summary: `检测到常见代理软件：${lp.apps.join(' / ')}`,
    detail:
      `本机存在代理客户端进程。仅有客户端本身不说明路径一定正确，真正关键的是：` +
      `命令行工具是否也被代理接管、IPv6 是否被接管、系统代理/TUN/环境变量三者是否一致。`,
    evidence: [SOURCES.networkLedger],
  };
};

/** L1 — local proxy hijack mode for Node/CLI tools. */
const proxyHijack: Detector = (i) => {
  const lp = i.localProxy;
  if (!lp) return null;
  const sys = lp.systemProxy;
  const tun = lp.tun;
  const proxyTarget = sys.host && sys.port ? `${sys.host}:${sys.port}` : sys.host ?? '已启用';
  const tunOk = tun.defaultIpv4ViaTun || tun.splitDefaultIpv4;

  if (sys.enabled && !lp.envProxySet && !tunOk) {
    return {
      id: 'L1-proxy-hijack',
      title: '命令行代理接管',
      status: 'warn',
      confidence: 'reported',
      causal: true,
      scored: false,
      classLabel: '路径卫生',
      summary: `检测到系统代理（${proxyTarget}），但未见 TUN 或命令行代理环境变量 — Node/CLI 可能绕过代理直连`,
      detail:
        `很多用户只开了系统代理，浏览器能出海，但 Node/CLI 进程未必会自动继承。当前本机未见 ` +
        `HTTP(S)_PROXY/ALL_PROXY，也未见 IPv4 被 TUN/分流默认路由接管；对 Claude Code 这类终端工具来说，` +
        `这属于高频踩坑的路径卫生问题。`,
      evidence: [SOURCES.networkLedger],
      fix: {
        kind: 'network',
        title: '优先开 TUN；否则给命令行显式设置代理环境变量',
        commands: [
          'export HTTP_PROXY=http://127.0.0.1:<port>',
          'export HTTPS_PROXY=http://127.0.0.1:<port>',
          'export ALL_PROXY=socks5h://127.0.0.1:<port>',
        ],
        note: '系统代理只保证一部分 GUI 流量；对 Node/CLI 更稳的是 TUN，或者给目标 shell 显式设置代理环境变量。',
      },
    };
  }

  if (sys.enabled || lp.envProxySet || tun.present) {
    const parts = [
      sys.enabled ? `system proxy=${proxyTarget}` : null,
      lp.envProxySet ? 'env proxy=on' : 'env proxy=off',
      tun.present ? `TUN=${tun.utunInterfaces.join(',')}` : 'TUN=off',
    ].filter(Boolean);
    return {
      id: 'L1-proxy-hijack',
      title: '命令行代理接管',
      status: 'ok',
      confidence: 'reported',
      causal: true,
      scored: false,
      classLabel: '路径卫生',
      summary: `本地代理接管形态：${parts.join(' · ')}`,
      detail:
        '这条是路径卫生自检，不代表地区一定合规；真正出口结果仍以 `--net` 的双栈与运行时探测为准。',
      evidence: [SOURCES.networkLedger],
    };
  }
  return null;
};

/** L2 — IPv6 capture hygiene. */
const ipv6Hijack: Detector = (i) => {
  const lp = i.localProxy;
  if (!lp) return null;
  const sys = lp.systemProxy;
  const tun = lp.tun;
  if (!tun.hasIpv6DefaultRoute) return null;

  const v6Ok = lp.envProxySet || tun.defaultIpv6ViaTun || tun.splitDefaultIpv6;
  if ((sys.enabled || tun.present) && !v6Ok) {
    return {
      id: 'L2-ipv6-hijack',
      title: 'IPv6 接管',
      status: 'warn',
      confidence: 'reported',
      causal: true,
      scored: false,
      classLabel: '路径卫生',
      summary: '本机有 IPv6 默认路由，但未见 IPv6 被 TUN/ALL_PROXY 接管 — 双栈环境可能出现 IPv6 直连',
      detail:
        '很多代理配置只照顾 IPv4，或者只开系统代理不接管 IPv6。这样浏览器/CLI 在双栈环境里可能出现：IPv4 走代理、IPv6 直连，' +
        '最终导致地区判断、可达性或出口信誉与预期不一致。',
      evidence: [SOURCES.networkLedger],
      fix: {
        kind: 'network',
        title: '确保 IPv6 也被代理接管',
        commands: [],
        note: '优先使用支持 IPv6 接管的 TUN 模式；若不用 TUN，至少确认目标命令通过 HTTP(S)_PROXY/ALL_PROXY 走代理。',
      },
    };
  }

  if (sys.enabled || tun.present) {
    return {
      id: 'L2-ipv6-hijack',
      title: 'IPv6 接管',
      status: 'info',
      confidence: 'reported',
      causal: true,
      scored: false,
      classLabel: '路径卫生',
      summary: v6Ok ? '检测到 IPv6 已被 TUN 或代理环境变量接管' : '未发现 IPv6 默认路由',
      evidence: [SOURCES.networkLedger],
    };
  }
  return null;
};

/** L3 — Clash/Mihomo core mode/TUN/DNS hygiene. */
const clashMode: Detector = (i) => {
  const c = i.localProxy?.clash;
  if (!c) return null;
  if (c.parseStatus === 'unreadable') {
    return {
      id: 'L3-clash-mode',
      title: 'Clash 配置可观测性',
      status: 'warn',
      confidence: 'confirmed',
      causal: false,
      scored: false,
      classLabel: '可观测性',
      summary: `检测到 Clash/Mihomo 配置路径，但文件无法读取或 YAML 无法解析：${c.configPath ?? '—'}`,
      detail: '后续规则组和出口稳定性检查已跳过；无结果不能解释为配置正常。',
      evidence: [SOURCES.networkLedger],
      fix: {
        kind: 'network',
        title: '确认配置文件可读且 YAML 有效',
        commands: [],
        note: '先在 Clash/Mihomo 客户端完成配置校验，再重新运行 claudedoctor。',
      },
    };
  }

  const issues: string[] = [];
  if (c.mode && c.mode !== 'rule') issues.push(`mode=${c.mode}`);
  if (c.tunEnabled === false) issues.push('tun=off');
  if (c.ipv6 === false) issues.push('ipv6=off');
  if (c.dnsEnabled === false) issues.push('dns=off');
  if (c.dnsEnhancedMode && c.dnsEnhancedMode !== 'fake-ip') issues.push(`dns=${c.dnsEnhancedMode}`);
  if (c.dnsRespectRules === false) issues.push('dns.respect-rules=off');

  if (issues.length > 0) {
    return {
      id: 'L3-clash-mode',
      title: 'Clash 配置建议',
      status: 'info',
      confidence: 'reported',
      causal: false,
      scored: false,
      classLabel: '路径卫生',
      summary: `Clash/Mihomo 与推荐模板不同：${issues.join(' · ')}（仅建议，不代表当前路径异常）`,
      detail:
        `这是通用路径卫生建议，不是 Claude 官方要求，也不影响健康退出码。通常更稳的组合是 ` +
        `mode=rule、tun.enable=true、ipv6=true、dns.enable=true、enhanced-mode=fake-ip、respect-rules=true。` +
        `${c.configPath ? `当前配置文件：${c.configPath}` : ''}`,
      evidence: [SOURCES.networkLedger],
      fix: {
        kind: 'network',
        title: '把 Clash/Mihomo 调成适合命令行工具的模式',
        commands: [],
        note: '优先检查 mode=rule、tun.enable=true、ipv6=true、dns.enhanced-mode=fake-ip、dns.respect-rules=true。',
      },
    };
  }

  return {
    id: 'L3-clash-mode',
    title: 'Clash 配置建议',
    status: 'ok',
    confidence: 'reported',
    causal: true,
    scored: false,
    classLabel: '路径卫生',
    summary: `Clash/Mihomo 关键项看起来正常：mode=${c.mode ?? '—'} · tun=${String(c.tunEnabled)} · ipv6=${String(c.ipv6)} · dns=${c.dnsEnhancedMode ?? '—'}`,
    detail: c.configPath ? `当前配置文件：${c.configPath}` : undefined,
    evidence: [SOURCES.networkLedger],
  };
};

/** L4 — explicit Claude/Anthropic routing in Clash/Mihomo rules. */
const clashClaudeRules: Detector = (i) => {
  const c = i.localProxy?.clash;
  if (!c || c.parseStatus !== 'parsed') return null;

  if (!c.hasClaudeCodeGroup || !c.hasClaudeRules) {
    return {
      id: 'L4-clash-claude-rules',
      title: 'Claude 专用规则',
      status: 'info',
      confidence: 'reported',
      causal: false,
      scored: false,
      classLabel: '路径卫生',
      summary: '未配置 Claude/Anthropic 专用规则与分组（可选优化，不代表当前出口异常）',
      detail:
        '专用规则便于单独控制 AI 出口，但不是 Claude 官方要求。真实地区与信誉结论仍以 --net 探测为准；' +
        '不应仅因缺少专用分组就判定风险。',
      evidence: [SOURCES.networkLedger],
      fix: {
        kind: 'network',
        title: '给 Claude/Anthropic 单独建规则组',
        commands: [],
        note: '至少单独匹配 anthropic.com、claude.ai、claude.com，并让它们落到一个可单独选节点的专用组。',
      },
    };
  }

  const target = c.claudeRuleTarget ?? 'ClaudeCode';
  const members = c.aiGroupMembers.slice(0, 4).join(' / ');
  return {
    id: 'L4-clash-claude-rules',
    title: 'Claude 专用规则',
    status: 'ok',
    confidence: 'reported',
    causal: true,
    scored: false,
    classLabel: '路径卫生',
    summary: `已检测到 Claude 专用规则：AI 域名 → ${target}${members ? ` · 候选节点: ${members}` : ''}`,
    detail:
      c.finalMatchTarget && c.finalMatchTarget !== target
        ? `Claude 流量不会直接掉到最终 MATCH=${c.finalMatchTarget}，而是先走专用组 ${target}。`
        : undefined,
    evidence: [SOURCES.networkLedger],
  };
};

/** L5 — ClaudeCode group exit stability. */
const clashAiExit: Detector = (i) => {
  const c = i.localProxy?.clash;
  if (!c || c.parseStatus !== 'parsed' || !c.hasClaudeCodeGroup) return null;

  const { generic, dedicated } = splitAiGroupMembers(c.aiGroupMembers);
  if (generic.length > 0 && dedicated.length <= 1) {
    return {
      id: 'L5-clash-ai-exit',
      title: 'Claude 出口稳定性',
      status: 'warn',
      confidence: 'reported',
      causal: true,
      scored: false,
      classLabel: '路径卫生',
      summary: `ClaudeCode 组混入通用出口：${generic.join(' / ')}；专用候选过少，AI 流量容易漂移`,
      detail:
        `虽然已经有 Claude 专用规则，但如果专用组里主要还是“自动选择 / 故障转移 / 通用大组”，` +
        `那么真实出口仍会随着测速、故障切换或全局选择漂移。对 Claude Code 来说，更稳的是把 AI 流量固定到少量可控候选。`,
      evidence: [SOURCES.networkLedger],
      fix: {
        kind: 'network',
        title: '把 ClaudeCode 组收窄成少量可控候选',
        commands: [],
        note: '建议 ClaudeCode 组只放 1-3 个明确候选节点，少依赖自动选择/故障转移/通用大组。',
      },
    };
  }

  return {
    id: 'L5-clash-ai-exit',
    title: 'Claude 出口稳定性',
    status: 'info',
    confidence: 'reported',
    causal: true,
    scored: false,
    classLabel: '路径卫生',
    summary:
      dedicated.length > 0
        ? `ClaudeCode 组含专用候选：${dedicated.slice(0, 3).join(' / ')}${generic.length ? `；另含通用候选 ${generic.join(' / ')}` : ''}`
        : 'ClaudeCode 组未发现明确专用候选',
    evidence: [SOURCES.networkLedger],
  };
};

/**
 * A1 — base URL + credential type. The single confirmed causal axis: a
 * *subscription OAuth* credential leaving the official client (via a relay) is
 * a ToS red line. An *API key* through a relay is explicitly allowed → info.
 */
const baseUrl: Detector = (i) => {
  const { baseUrl: b, credential: c } = i;

  // Official / unset base URL: healthy.
  if (!b.value || b.isOfficial) {
    return {
      id: 'A1-relay-oauth',
      title: '中转 / ANTHROPIC_BASE_URL',
      status: 'ok',
      confidence: 'confirmed',
      causal: true,
      scored: true,
      summary: b.value ? '指向官方 API 端点' : '未设置，走官方端点',
      evidence: [SOURCES.ccLegal],
    };
  }

  const usingSubscription =
    c.primaryKind === 'subscription-oauth' || c.primaryKind === 'oauth-token-env';

  if (usingSubscription) {
    // The red line.
    return {
      id: 'A1-relay-oauth',
      title: '中转 / ANTHROPIC_BASE_URL',
      status: 'risk',
      confidence: 'confirmed',
      causal: true,
      scored: true,
      summary: '订阅 OAuth 凭证正通过非官方中转使用 — 违反官方条款的已知封号向量',
      detail:
        '官方 Claude Code 法律文档明确：订阅 OAuth 认证仅供官方客户端使用，不允许第三方' +
        '通过 Free/Pro/Max 凭证转发请求，且保留无预警执行（封号）的权利。裸 API key 过' +
        '中转是允许的，但订阅凭证不是。汇聚型中转还会造成同池交叉传染。',
      evidence: [SOURCES.ccLegal, SOURCES.harnessCrackdownHN, SOURCES.relayArch],
      fix: {
        kind: 'unset-env',
        title: '停用中转，让订阅凭证回到官方端点',
        commands:
          b.source === 'settings-json'
            ? ['# 从 /status 列出的生效 settings.json 的 "env" 块移除 ANTHROPIC_BASE_URL']
            : ['unset ANTHROPIC_BASE_URL', '# 或从你的 shell profile 中删除该 export'],
        note: '若你确实需要自建网关做审计，请改用官方 API key（sk-ant-api*），而非订阅 OAuth。',
        // Only auto-appliable when the var came from the shell env; a settings.json
        // value is applied by Claude Code itself and a shell block can't override it.
        apply: b.source === 'settings-json' ? undefined : { unset: ['ANTHROPIC_BASE_URL'] },
      },
    };
  }

  // API key (or auth-token) through a relay — allowed, but worth surfacing.
  const isRelay = b.looksLikeRelay;
  return {
    id: 'A1-relay-apikey',
    title: '中转 / ANTHROPIC_BASE_URL',
    status: isRelay ? 'warn' : 'info',
    confidence: 'reported',
    causal: isRelay,
    scored: isRelay,
    summary: isRelay
      ? '经由疑似汇聚型中转使用（API key 本身合规，但共享池有连坐风险）'
      : '指向自定义端点，使用的是 API key（官方允许）',
    detail: isRelay
      ? 'URL 特征疑似多账号汇聚中转（拼车/号池）。裸 API key 过中转官方允许，但共享池里' +
        '一个账号触发风控可能牵连同出口的其他账号。'
      : undefined,
    evidence: [SOURCES.ccLegal, SOURCES.relayArch],
    // Scored warns must carry a fix so `claudedoctor fix` never drops them (CLAUDE.md §7.4).
    fix: isRelay
      ? {
          kind: 'advisory',
          title: '尽量脱离汇聚型中转，降低连坐风险',
          commands: [],
          note: '裸 API key 过中转官方允许，但共享号池有交叉传染风险；能直连官方端点或用独立网关更安全。',
        }
      : undefined,
  };
};

/**
 * A2-stale-apikey — a stray ANTHROPIC_API_KEY (esp. from a disabled org) silently
 * overrides a working subscription login. Confirmed bug, trivially fixable.
 */
const staleApiKey: Detector = (i) => {
  const { credential: c } = i;
  const keyOverridesLogin = c.primaryKind === 'api-key' || c.primaryKind === 'unknown';
  if (keyOverridesLogin && c.subscriptionPresent) {
    return {
      id: 'A2-stale-apikey',
      title: '凭证覆盖 / 假连坐',
      status: 'warn',
      confidence: 'confirmed',
      causal: true,
      scored: true,
      summary: 'ANTHROPIC_API_KEY 覆盖了你的订阅登录 — 若该 key 属被封 org，会表现为"订阅也用不了"',
      detail:
        '你同时存在订阅登录和一个 ANTHROPIC_API_KEY 环境变量。Claude Code 会优先用后者；' +
        '若该 key 所属 org 被停用，会连累订阅登录一起失效（已知 bug）。',
      evidence: [SOURCES.staleKeyBug],
      fix: {
        kind: 'remove-override',
        title: '移除多余的 ANTHROPIC_API_KEY，恢复订阅登录',
        commands:
          c.apiKeyEnvSource === 'settings-json'
            ? ['# 从 /status 列出的生效 settings.json env 中删除 ANTHROPIC_API_KEY']
            : ['unset ANTHROPIC_API_KEY', '# 或从 shell profile 中删除对应 export'],
        note: '仅当你本就想用订阅登录时才移除；若你是有意用 API key，忽略即可。',
        apply: c.apiKeyEnvSource === 'settings-json' ? undefined : { unset: ['ANTHROPIC_API_KEY'] },
      },
    };
  }
  return null;
};

/**
 * A2-credential-share — classify the credential and flag sharing-hygiene. Local
 * detection can only see the credential *kind*, not whether it's being shared
 * (that's server-side via concurrency/IP). So this is honest about its limits.
 */
const credentialKind: Detector = (i) => {
  const { credential: c } = i;
  switch (c.primaryKind) {
    case 'oauth-token-env':
      if (c.oauthTokenEnvSet && c.apiKeyEnvKind === 'none' && !c.authTokenEnvSet) {
        return {
          id: 'A2-credential-share',
          title: '凭证类型',
          status: 'ok',
          confidence: 'confirmed',
          causal: false,
          scored: false,
          summary: '使用 claude setup-token 的长效 OAuth token（官方支持 CI / 脚本）',
          detail:
            'CLAUDE_CODE_OAUTH_TOKEN 是官方记录的非交互认证方式，适用于 CI 和脚本。它仍属于个人订阅凭证，' +
            '不要共享、转售或交给第三方服务代用户调用。',
          evidence: [SOURCES.authentication, SOURCES.consumerTerms],
        };
      }
      return {
        id: 'A2-credential-share',
        title: '凭证类型',
        status: 'warn',
        confidence: 'confirmed',
        causal: true,
        scored: true,
        summary: 'OAuth token 放在了 ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN — 变量用途与官方认证方式不匹配',
        detail:
          'claude setup-token 产出的 token 应放在 CLAUDE_CODE_OAUTH_TOKEN。当前变量会按 API key 或网关 bearer ' +
          'token 发送，可能认证失败，也容易把订阅凭证误交给自定义端点。',
        evidence: [SOURCES.authentication, SOURCES.ccLegal],
        fix: {
          kind: 'switch-credential',
          title: '改用官方记录的 OAuth token 变量',
          commands: [
            'unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN',
            'export CLAUDE_CODE_OAUTH_TOKEN="<claude setup-token 的输出>"',
          ],
          apply:
            c.apiKeyEnvSource === 'settings-json' || c.authTokenEnvSource === 'settings-json'
              ? undefined
              : { unset: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] },
        },
      };
    case 'auth-token':
      return {
        id: 'A2-credential-share',
        title: '凭证类型',
        status: 'info',
        confidence: 'reported',
        causal: false,
        scored: false,
        summary: '设置了 ANTHROPIC_AUTH_TOKEN（常见于第三方中转配置）',
        detail: '若这是官方 API key 之外的第三方 token，请确认其来源合规；本地无法判定是否为共享/转售凭证。',
        evidence: [SOURCES.consumerTerms],
      };
    case 'api-key':
      return {
        id: 'A2-credential-share',
        title: '凭证类型',
        status: 'ok',
        confidence: 'confirmed',
        causal: false,
        scored: false,
        summary: '使用 API key（sk-ant-api*）— 第三方工具中使用官方允许',
        evidence: [SOURCES.ccLegal],
      };
    case 'api-key-helper':
      return {
        id: 'A2-credential-share',
        title: '凭证类型',
        status: 'ok',
        confidence: 'confirmed',
        causal: false,
        scored: false,
        summary: '使用 apiKeyHelper 动态提供 API key（官方支持）',
        evidence: [SOURCES.authentication],
      };
    case 'cloud-provider':
      return {
        id: 'A2-credential-share',
        title: '凭证类型',
        status: 'ok',
        confidence: 'confirmed',
        causal: false,
        scored: false,
        summary: `使用官方支持的云提供商认证（${c.cloudProvider ?? 'cloud'}）`,
        evidence: [SOURCES.authentication],
      };
    case 'subscription-oauth':
      return {
        id: 'A2-credential-share',
        title: '凭证类型',
        status: 'ok',
        confidence: 'confirmed',
        causal: false,
        scored: false,
        summary: '官方订阅登录（claude.ai OAuth）',
        detail: '提醒：共享/转售登录凭证违反 Consumer Terms，多人共用同一订阅有被风控的风险。',
        evidence: [SOURCES.consumerTerms],
      };
    default:
      return null;
  }
};

/**
 * A3 — client integrity. Running a non-official binary that spoofs the Claude
 * Code harness is the confirmed ban vector. Custom headers can look like spoofing.
 */
const clientIntegrity: Detector = (i) => {
  if (i.client.isOfficialBinary) {
    return {
      id: 'A3-client-integrity',
      title: '客户端来源',
      status: 'ok',
      confidence: 'reported',
      causal: true,
      scored: true,
      summary: `当前 PATH 命中官方分发路径（${i.client.installMethod}）${i.client.version ? ` · v${i.client.version}` : ''}`,
      detail:
        `活动命令：${i.client.executablePath ?? '—'}。本检查识别安装来源与版本输出，不做二进制签名或哈希认证，` +
        '因此不把“路径看起来官方”夸大成完整性证明。',
      evidence: [SOURCES.installation, SOURCES.harnessCrackdownHN],
    };
  }
  if (!i.client.executablePath || !i.client.version) {
    return {
      id: 'A3-client-integrity',
      title: '客户端来源',
      status: 'info',
      confidence: 'confirmed',
      causal: false,
      scored: false,
      summary: '当前 PATH 未找到可运行的 claude，无法评估客户端来源',
      evidence: [SOURCES.installation],
      fix: {
        kind: 'advisory',
        title: '按官方安装文档安装 Claude Code',
        commands: [],
        note: '安装后重新运行 claudedoctor；原生安装是官方推荐方式。',
      },
    };
  }
  return {
    id: 'A3-client-integrity',
    title: '客户端来源',
    status: 'warn',
    confidence: 'reported',
    causal: true,
    scored: false,
    summary: `claude 可运行，但活动路径不属于已知官方分发位置：${i.client.executablePath}`,
    detail:
      '这可能只是你自己的 shim、包管理器路径或尚未识别的新官方安装方式，不等于魔改客户端。若它确实是第三方 ' +
      'harness，请勿用订阅凭证伪装官方 Claude Code。',
    evidence: [SOURCES.installation, SOURCES.harnessCrackdownHN, SOURCES.harnessCrackdownVB],
    fix: {
      kind: 'advisory',
      title: '用官方客户端；自动化改用 API key',
      commands: [],
      note: '若你在做自建/自动化，官方立场是改用付费 API（sk-ant-api*），而不是让第三方工具复用订阅凭证。',
    },
  };
};

const customHeaders: Detector = (i) => {
  if (!i.credential.customHeadersSet) return null;
  return {
    id: 'A3-custom-headers',
    title: '自定义请求头',
    status: 'info',
    confidence: 'speculative',
    causal: false,
    scored: false,
    summary: '设置了 ANTHROPIC_CUSTOM_HEADERS',
    detail:
      '自定义 header 本身不违规，但若被用于伪造官方客户端指纹，则落入 A3 的封号向量。具体检测' +
      '哪些 header 官方未披露（speculative），此处仅提示。',
    evidence: [SOURCES.harnessCrackdownHN],
  };
};

/**
 * A5 — device & telemetry transparency. Read-only local identity surface. We
 * show what stays local vs what goes outbound, and point users to the OFFICIAL
 * dashboard for the account-wide device list — we NEVER hit the account API with
 * their token to enumerate devices (that would be the abuse we warn against).
 */
const deviceTransparency: Detector = (i) => {
  const id = i.identity;
  if (!id.machineIdPresent && !id.telemetryPresent && !id.userIdPresent) return null;
  return {
    id: 'A5-device',
    title: '设备与遥测透明度',
    status: 'info',
    confidence: 'reported',
    causal: false,
    scored: false,
    summary: '本地身份:machineID 不出站 · 出站的是 account/org uuid + session',
    detail:
      'Claude Code 登录会向服务端登记本机(trusted-device)，账号-设备是真实绑定能力。本地 machineID 是一次性随机、' +
      '不出站；真正出站的身份是 account_uuid/org_uuid/session。个人 Pro/Max 多设备本身不违规(只共享额度)，' +
      '风险在于"同一凭证被非官方客户端/多人复用"。账号级设备清单请到官方 Active Sessions 自查——本工具绝不用你的' +
      '凭证去打账号接口数设备。',
    evidence: ['https://support.claude.com/en/articles/13124001-managing-your-active-sessions'],
    fix: {
      kind: 'advisory',
      title: '去官方后台核对活跃设备',
      commands: ['# 打开 claude.ai → Settings → Account → Active Sessions，逐个核对/踢下线'],
      note: '若看到不认识的设备/位置，那才是账号共享或凭证外泄的信号。',
    },
  };
};

/** A6 — CI accidentally reusing an interactive login instead of a documented CI credential. */
const automation: Detector = (i) => {
  const usingSubscription = i.credential.primaryKind === 'subscription-oauth';
  if (!i.runtime.isCI || !usingSubscription) return null;
  return {
    id: 'A6-automation',
    title: '自动化 + 订阅凭证',
    status: 'warn',
    confidence: 'reported',
    causal: true,
    scored: true,
    summary: '检测到 CI 环境在复用交互式登录；官方为 CI / 脚本提供了 setup-token 专用方式',
    detail:
      '不要把整个 ~/.claude 凭证目录或 Keychain 登录复制进 CI。官方支持两种明确方式：按量 API key，或通过 ' +
      'claude setup-token 生成并放入 CLAUDE_CODE_OAUTH_TOKEN 的长效 token。',
    evidence: [SOURCES.authentication, SOURCES.ccLegal],
    fix: {
      kind: 'switch-credential',
      title: '改用官方 CI 认证方式',
      commands: [
        'claude setup-token  # 交互生成一次',
        'export CLAUDE_CODE_OAUTH_TOKEN="<secret>"  # 存到 CI secret；或改用 ANTHROPIC_API_KEY',
      ],
      note: 'setup-token 是官方支持的 CI/脚本路径；不要复制交互式登录文件。',
    },
  };
};

/** B4-probe — make an explicitly requested but failed network check visible. */
const networkProbe: Detector = (i) => {
  if (i.networkProbe !== 'failed') return null;
  return {
    id: 'B4-probe',
    title: '联网探测',
    status: 'warn',
    confidence: 'confirmed',
    causal: false,
    scored: false,
    summary: '已请求 --net，但未能取得网络画像；本次报告不包含地区/IP 结论',
    detail: '可能原因包括网络不可达、curl 缺失、DNS/代理配置或情报服务超时。不要把“无结果”解读为“安全”。',
    evidence: [SOURCES.networkLedger],
    fix: {
      kind: 'network',
      title: '检查基础联网后重试',
      commands: ['curl -fsS https://api.ipapi.is/'],
      note: '确认命令返回 JSON 后，再运行 claudedoctor check --net。',
    },
  };
};

/** B4-region — egress country vs supported regions. Only runs when probed (opt-in). */
const region: Detector = (i) => {
  const n = i.network;
  if (!n) return null;
  const src = networkSource(n);
  const dual = familyBreakdown(n);

  if (n.isSupportedRegion === false) {
    return {
      id: 'B4-region',
      title: '出口地区',
      status: 'risk',
      confidence: 'confirmed',
      causal: true,
      scored: true,
      summary: `出口 IP 位于不支持地区：${n.countryName ?? n.countryCode}${n.selectedFamily ? `（命中 ${n.selectedFamily}）` : ''} — 官方明列为封号原因之一`,
      detail:
        `（${src}）官方帮助中心把"在不支持地区创建账号"列为账号被禁用原因；不支持地区的请求也会被直接 400 拒绝。` +
        `VPN 只是访问手段，被禁止的是"从不支持地区访问/注册"这一结果。${dual}`,
      evidence: [SOURCES.appeals, SOURCES.regionBlock, SOURCES.supportedCountries],
      fix: {
        kind: 'network',
        title: '从受支持地区访问',
        commands: [],
        note: '确认你的账号注册地与常用出口地区一致且受支持；跨不支持地区使用有真实封号风险。',
      },
    };
  }

  return {
    id: 'B4-region',
    title: '出口地区',
    status: 'ok',
    confidence: 'reported',
    causal: true,
    scored: true,
    summary:
      n.countryCode && n.isSupportedRegion === true
        ? `${n.countryName ?? n.countryCode}（受支持）· ${src}${dual}`
        : `地区支持状态未知 · ${src}${dual}`,
    evidence: [SOURCES.supportedCountries],
  };
};

/** B4-proxy — proxy / VPN / Tor flag from the IP-intel provider. */
const proxy: Detector = (i) => {
  const n = i.network;
  if (!n) return null;
  const flagged = n.isProxy === true || n.isTor === true || n.threatLevel === 'high';
  const risk = n.riskScore ? `｜第三方信誉标签 ${n.riskScore}` : '';
  const dual = familyBreakdown(n);
  if (!flagged) {
    if (n.isProxy === null && n.isTor === null) return null; // provider gave nothing
    return {
      id: 'B4-proxy',
      title: '出口 IP 信誉',
      status: 'ok',
      confidence: 'reported',
      causal: false,
      scored: false,
      summary: `未被标记为代理/VPN/Tor · ${networkSource(n)}${risk}${dual}`,
      evidence: [SOURCES.appeals],
    };
  }
  const kinds = [n.isTor && 'Tor', n.isProxy && '代理/VPN', n.threatLevel === 'high' && '高威胁'].filter(
    Boolean,
  );
  return {
    id: 'B4-proxy',
    title: '出口 IP 信誉',
    status: 'warn',
    confidence: 'reported',
    causal: false,
    scored: false,
    summary: `出口 IP 被标记为 ${kinds.join(' / ')}（${networkSource(n)}${risk}）— 与登录被拦、社区风控报告相关`,
    detail:
      '被标记的代理/VPN/Tor 出口在 claude.ai 登录时更易被 Cloudflare 拦，也见于社区封号自述（reported，' +
      `非官方确认）。这是 IP 信誉信号，不等于确定封号；不归入政策风险，仅提示。${dual}`,
    evidence: [SOURCES.appeals, SOURCES.datacenterOAuth],
    fix: {
      kind: 'network',
      title: '换一个干净的住宅出口',
      commands: [],
      note: '若你在用共享/公共 VPN 节点，换成干净住宅 IP 可降低登录被拦与被风控的概率。',
    },
  };
};

/** B4-datacenter — hosting/datacenter ASN → Cloudflare OAuth reachability. */
const datacenter: Detector = (i) => {
  const n = i.network;
  if (!n || n.asnType !== 'datacenter') return null;
  return {
    id: 'B4-datacenter',
    title: '出口 IP 类型',
    status: 'warn',
    confidence: 'confirmed',
    causal: true,
    scored: false, // access issue, not a ban — don't inflate the risk summary
    summary: `出口为机房 IP${n.asnOrg ? `（${n.asnOrg}）` : ''}${n.selectedFamily ? ` · ${n.selectedFamily}` : ''} — 可能被 Cloudflare 拦 claude.ai OAuth 登录`,
    detail:
      '机房/数据中心 ASN 的出口 IP 常被 Cloudflare 在 claude.ai OAuth 端点出质询而登录失败（这是"访问被拒"，' +
      `不是账号被封，Anthropic 将其标为 external）。API 端点通常不受影响。${familyBreakdown(n)}`,
    evidence: [SOURCES.datacenterOAuth],
    fix: {
      kind: 'network',
      title: '登录用住宅出口',
      commands: [],
      note: '若 OAuth 登录卡在 Cloudflare 质询，换一个住宅网络出口再登录。',
    },
  };
};

/** B4-route-divergence — Node runtime sees a different egress path than curl/dual-stack probing. */
const routeDivergence: Detector = (i) => {
  const n = i.network;
  const runtime = n?.runtimePath;
  if (!n || !runtime) return null;

  const sameCountry = runtime.countryCode != null && runtime.countryCode === n.countryCode;
  const sameIp = runtime.egressIp != null && runtime.egressIp === n.egressIp;
  if (sameCountry && sameIp) return null;

  const runtimeSrc = `${runtime.provider}${runtime.egressIp ? ` · ${runtime.egressIp}` : ''}`;
  const dual = familyBreakdown(n);
  const runtimeUnsupported = regionSupport(runtime.countryCode) === false;
  const selectedSupported = regionSupport(n.countryCode) === true;

  return {
    id: 'B4-route-divergence',
    title: '代理路径一致性',
    status: runtimeUnsupported && selectedSupported ? 'warn' : 'info',
    confidence: 'reported',
    causal: true,
    classLabel: '路径卫生',
    scored: false,
    summary:
      runtimeUnsupported && selectedSupported
        ? `当前 Node 网络栈仍看到不支持地区：${runtime.countryName ?? runtime.countryCode}（${runtimeSrc}）`
        : `当前 Node 网络栈与双栈/curl 出口不一致：Node=${runtime.countryName ?? runtime.countryCode ?? '—'} · 探测=${n.countryName ?? n.countryCode ?? '—'}`,
    detail:
      `双栈/curl 探测当前选中的出口是 ${n.countryName ?? n.countryCode ?? '—'}（${networkSource(n)}），` +
      `但当前 Node 进程默认网络栈看到的是 ${runtime.countryName ?? runtime.countryCode ?? '—'}（${runtimeSrc}）。` +
      `这通常出现在"只开系统代理、没开 TUN"或命令行工具未显式设置 HTTP(S)_PROXY/ALL_PROXY 的场景：` +
      `浏览器/部分 curl 流量已出海，但 Node/CLI 工具仍可能本地直连或命中另一条分流路径。` +
      `对 Node-based 工具（包括很多 AI CLI）来说，这是实际可用性与地区判断都会踩坑的路径卫生问题。${dual}`,
    evidence: [SOURCES.networkLedger],
    fix: {
      kind: 'network',
      title: '优先开启 TUN；否则给命令行工具显式设置代理环境变量',
      commands: [
        'export HTTP_PROXY=http://127.0.0.1:<port>',
        'export HTTPS_PROXY=http://127.0.0.1:<port>',
        'export ALL_PROXY=socks5h://127.0.0.1:<port>',
      ],
      note:
        '系统代理不等于所有 Node/CLI 进程都走代理。若 --net 仍报不支持地区，优先打开代理客户端的 TUN 模式；' +
        '否则至少给目标命令所在 shell 显式设置 HTTP_PROXY/HTTPS_PROXY/ALL_PROXY。',
    },
  };
};

/**
 * M0 re-check — the date-line steganography. Falsified in 2.1.201 (mechanism.md).
 * We show it as "checked, not present"; it never affects the risk summary.
 */
const dateStego: Detector = (i) => {
  const d = i.dateLine;
  if (!d) return null;
  const apostropheAscii = d.apostropheHex === '27';
  const separatorAscii = d.separatorHex === '2d 2d';
  const clean = apostropheAscii && separatorAscii;
  return {
    id: 'M0-date-stego',
    title: '日期行隐写（M0 复检）',
    status: clean ? 'ok' : 'warn',
    confidence: clean ? 'confirmed' : 'reported',
    causal: false,
    scored: false,
    summary: clean
      ? '未命中隐写：撇号为 ASCII 0x27、两个分隔符均为 ASCII "-"'
      : '异常：日期行字节偏离 ASCII 基线，机制可能回归',
    detail: clean
      ? '与 M0 字节级取证一致（该机制在当前版本已证伪）。仅作复检展示，不归入政策风险。'
      : `撇号 hex=${d.apostropheHex} 分隔符 hex=${d.separatorHex} — 请对照 mechanism.md 复核。`,
    evidence: [SOURCES.mechanismLedger],
  };
};

/**
 * System timezone — a PROFILE FACTOR, not cosmetic ambiance. It was a real input
 * to the (now-removed) date-line anti-abuse marker (2.1.91 → removed 2026-07).
 * Current version (2.1.201) does NOT encode it — byte-verified — so it stays
 * unscored, but we label it 画像因子 (could recur), not 氛围.
 */
const timezone: Detector = (i) => {
  if (!i.timezone) return null;
  const cnTz = /Shanghai|Chongqing|Urumqi|Harbin|Hong_Kong|Macau/i.test(i.timezone);
  return {
    id: 'AMB-timezone',
    title: '系统时区',
    status: 'info',
    confidence: 'reported',
    causal: false,
    scored: false,
    classLabel: '画像因子',
    summary: `${i.timezone}${cnTz ? '（中国时区）' : ''} — 画像因子，当前版本不编码，历史上曾被用作标记输入`,
    detail:
      '时区曾是"日期行隐写标记"的输入之一（2.1.91 起真实存在，官方承认是反滥用/反蒸馏实验，2026-07 移除）；' +
      '我们在 2.1.201 字节级复检证实当前不再编码。因此不归入政策风险，但它不是纯氛围——是可能回归的画像因子，' +
      '尤其"中国时区 + 非官方中转"的组合值得留意。',
    evidence: [SOURCES.mechanismLedger],
    // Precautionary only: set TZ for the shell (not the OS clock). Offered when
    // on a China timezone. Currently DORMANT (2.1.201 doesn't encode tz) — will
    // Does not change the policy-risk classification; it is regression insurance.
    ...(cnTz
      ? {
          fix: {
            kind: 'advisory' as const,
            title: '只给 Claude Code 用受支持时区（Asia/Singapore，预防性）',
            commands: [
              'claude() { TZ=Asia/Singapore command claude "$@"; }  # 只有 claude 命令用新时区',
              '# 想让整个终端都用可改为: export TZ=Asia/Singapore',
            ],
            note:
              '预防性画像卫生：当前版本已不编码时区，这一项不会改变政策风险分类，只为机制回归留个保险。' +
              '默认做法是给 claude 命令套一个 shell 函数——只有 Claude Code 看到新时区，' +
              '系统时钟、菜单栏、日历、连终端里其它程序都不受影响，可随时一键撤销。',
            apply: { raw: ['claude() { TZ=Asia/Singapore command claude "$@"; }'] },
            precautionary: true,
          },
        }
      : {}),
  };
};

export const DETECTORS: Detector[] = [
  proxyClient,
  proxyHijack,
  ipv6Hijack,
  clashMode,
  clashClaudeRules,
  clashAiExit,
  baseUrl,
  staleApiKey,
  credentialKind,
  clientIntegrity,
  customHeaders,
  deviceTransparency,
  automation,
  networkProbe,
  region,
  proxy,
  datacenter,
  routeDivergence,
  dateStego,
  timezone,
];
