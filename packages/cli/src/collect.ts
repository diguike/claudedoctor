/**
 * Collector — read the *real* local Claude Code environment and hand core a
 * sanitized snapshot. Credentials are classified into enums here; raw secret
 * values never leave this file and are never printed. Node-only (I/O lives here,
 * core stays pure).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import {
  OFFICIAL_API_HOSTS,
  RELAY_HOST_HINTS,
  type ApiKeyEnvKind,
  type CredentialKind,
  type DoctorInput,
} from '@claudedoctor/core';

const COMMON_PROXY_APPS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Clash Verge / mihomo', pattern: /(clash-verge|verge-mihomo|mihomo|clashx|clash)/i },
  { label: 'Surge', pattern: /surge/i },
  { label: 'sing-box', pattern: /sing-box/i },
  { label: 'v2ray / xray', pattern: /(v2ray|xray)/i },
  { label: 'NekoRay', pattern: /nekoray/i },
  { label: 'Hiddify', pattern: /hiddify/i },
  { label: 'Tailscale', pattern: /tailscale/i },
  { label: 'WireGuard', pattern: /wireguard/i },
];

function readJson(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** settings.json `env` block is applied by Claude Code at launch, so it counts too. */
function settingsEnv(home: string): Record<string, string> {
  const s = readJson(join(home, '.claude', 'settings.json'));
  const env = s?.env;
  return env && typeof env === 'object' ? (env as Record<string, string>) : {};
}

/** Effective value of an env var: process env wins, then settings.json env. */
function effEnv(
  key: string,
  sEnv: Record<string, string>,
): { value: string | undefined; source: 'process-env' | 'settings-json' | null } {
  if (process.env[key] != null && process.env[key] !== '') {
    return { value: process.env[key], source: 'process-env' };
  }
  if (sEnv[key] != null && sEnv[key] !== '') return { value: sEnv[key], source: 'settings-json' };
  return { value: undefined, source: null };
}

function classifyKeyShape(value: string | undefined): ApiKeyEnvKind {
  if (!value) return 'none';
  if (value.startsWith('sk-ant-api')) return 'api-key';
  if (value.startsWith('sk-ant-oat')) return 'oauth-token';
  return 'other';
}

/** Does an official subscription login exist (keychain on macOS, file on Linux)? */
function subscriptionPresent(home: string): boolean {
  // Linux / some setups store a credentials file.
  if (existsSync(join(home, '.claude', '.credentials.json'))) return true;
  // macOS Keychain entry created by Claude Code.
  if (platform() === 'darwin') {
    try {
      execFileSync('security', ['find-generic-password', '-s', 'Claude Code-credentials'], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      return true;
    } catch {
      /* not found */
    }
  }
  // Fallback: oauthAccount block in ~/.claude.json indicates a subscription login.
  const top = readJson(join(home, '.claude.json'));
  return top?.oauthAccount != null;
}

function detectClient(): { version: string | null; isOfficialBinary: boolean; installMethod: string | null } {
  let version: string | null = null;
  let installMethod: string | null = null;
  // Prefer reading the globally installed package.json (no spawn of the 231MB binary).
  for (const base of npmGlobalRoots()) {
    const pkgPath = join(base, '@anthropic-ai', 'claude-code', 'package.json');
    const pkg = readJson(pkgPath);
    if (pkg?.version) {
      version = String(pkg.version);
      break;
    }
  }
  const top = readJson(join(homedir(), '.claude.json'));
  if (typeof top?.installMethod === 'string') installMethod = top.installMethod;
  return { version, isOfficialBinary: version != null, installMethod };
}

function sh(cmd: string): string {
  try {
    return execFileSync('/bin/zsh', ['-lc', cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function boolYaml(text: string, key: string): boolean | null {
  const m = text.match(new RegExp(`^\\s*${key}:\\s*(true|false)\\s*$`, 'm'));
  if (!m) return null;
  return m[1] === 'true';
}

function strYaml(text: string, key: string): string | null {
  const m = text.match(new RegExp(`^\\s*${key}:\\s*(.+)\\s*$`, 'm'));
  return m ? m[1]!.trim().replace(/^['"]|['"]$/g, '') : null;
}

function numYaml(text: string, key: string): number | null {
  const m = text.match(new RegExp(`^\\s*${key}:\\s*(\\d+)\\s*$`, 'm'));
  return m ? Number(m[1]) : null;
}

function readText(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function detectClashConfig(psOut: string): NonNullable<NonNullable<DoctorInput['localProxy']>['clash']> | undefined {
  const clashLine = psOut
    .split('\n')
    .find((line) => /(?:verge-mihomo|clash-verge|mihomo)/i.test(line) && /\s-f\s/.test(line));
  const configPath =
    clashLine?.match(/\s-f\s(.+?clash-verge\.ya?ml)(?=\s+-\w|\s*$)/)?.[1]?.trim() ?? null;
  if (!configPath) return undefined;
  const text = readText(configPath);
  if (!text) {
    return {
      configPath,
      mode: null,
      mixedPort: null,
      ipv6: null,
      dnsEnabled: null,
      dnsIpv6: null,
      dnsEnhancedMode: null,
      dnsRespectRules: null,
      tunEnabled: null,
      tunStack: null,
      tunAutoRoute: null,
      tunStrictRoute: null,
      hasClaudeCodeGroup: false,
      hasClaudeRules: false,
      claudeRuleTarget: null,
      finalMatchTarget: null,
      aiGroupMembers: [],
      aiGenericMembers: [],
      aiDedicatedMembers: [],
    };
  }

  const groupSection = text.match(/^- name:\s*ClaudeCode[\s\S]*?(?=^- name:|^rules:|\Z)/m)?.[0] ?? '';
  const proxySubsection = groupSection.match(/^\s*proxies:\s*$([\s\S]*)/m)?.[1] ?? '';
  const aiGroupMembers = Array.from(proxySubsection.matchAll(/^\s*-\s+(.+)\s*$/gm))
    .map((x) => x[1]!.trim())
    .filter((x) => x.length > 0);
  const aiGenericMembers = aiGroupMembers.filter((x) => /(自动选择|故障转移|fallback|url-test|select|淘\|加\|速)/i.test(x));
  const aiDedicatedMembers = aiGroupMembers.filter((x) => !aiGenericMembers.includes(x));
  const claudeRuleTarget =
    text.match(/^- DOMAIN-SUFFIX,anthropic\.com,([^\s]+)\s*$/m)?.[1] ??
    text.match(/^- DOMAIN-SUFFIX,claude\.ai,([^\s]+)\s*$/m)?.[1] ??
    null;
  const finalMatchTarget = Array.from(text.matchAll(/^- MATCH,([^\s]+)\s*$/gm)).at(-1)?.[1] ?? null;

  return {
    configPath,
    mode: strYaml(text, 'mode'),
    mixedPort: numYaml(text, 'mixed-port'),
    ipv6: boolYaml(text, 'ipv6'),
    dnsEnabled: boolYaml(text.match(/^dns:[\s\S]*?(?=^[a-z-]+:|\Z)/m)?.[0] ?? '', 'enable'),
    dnsIpv6: boolYaml(text.match(/^dns:[\s\S]*?(?=^[a-z-]+:|\Z)/m)?.[0] ?? '', 'ipv6'),
    dnsEnhancedMode: strYaml(text.match(/^dns:[\s\S]*?(?=^[a-z-]+:|\Z)/m)?.[0] ?? '', 'enhanced-mode'),
    dnsRespectRules: boolYaml(text.match(/^dns:[\s\S]*?(?=^[a-z-]+:|\Z)/m)?.[0] ?? '', 'respect-rules'),
    tunEnabled: boolYaml(text.match(/^tun:[\s\S]*?(?=^[a-z-]+:|\Z)/m)?.[0] ?? '', 'enable'),
    tunStack: strYaml(text.match(/^tun:[\s\S]*?(?=^[a-z-]+:|\Z)/m)?.[0] ?? '', 'stack'),
    tunAutoRoute: boolYaml(text.match(/^tun:[\s\S]*?(?=^[a-z-]+:|\Z)/m)?.[0] ?? '', 'auto-route'),
    tunStrictRoute: boolYaml(text.match(/^tun:[\s\S]*?(?=^[a-z-]+:|\Z)/m)?.[0] ?? '', 'strict-route'),
    hasClaudeCodeGroup: /(^|\n)- name:\s*ClaudeCode\s*$/m.test(text),
    hasClaudeRules: /- DOMAIN-SUFFIX,anthropic\.com,/.test(text) || /- DOMAIN-SUFFIX,claude\.ai,/.test(text),
    claudeRuleTarget,
    finalMatchTarget,
    aiGroupMembers,
    aiGenericMembers,
    aiDedicatedMembers,
  };
}

function detectLocalProxy(): NonNullable<DoctorInput['localProxy']> {
  const envProxySet = [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
  ].some((k) => Boolean(process.env[k]));

  const psOut = sh('ps aux');
  const apps = COMMON_PROXY_APPS.filter(({ pattern }) => pattern.test(psOut)).map(({ label }) => label);
  const clash = detectClashConfig(psOut);

  let systemProxy = {
    enabled: false,
    http: false,
    https: false,
    socks: false,
    pac: false,
    host: null as string | null,
    port: null as number | null,
  };

  if (platform() === 'darwin') {
    const sc = sh('scutil --proxy');
    const http = /\bHTTPEnable\s*:\s*1\b/.test(sc);
    const https = /\bHTTPSEnable\s*:\s*1\b/.test(sc);
    const socks = /\bSOCKSEnable\s*:\s*1\b/.test(sc);
    const pac = /\bProxyAutoConfigEnable\s*:\s*1\b/.test(sc);
    const host =
      sc.match(/\bHTTPSProxy\s*:\s*(.+)/)?.[1]?.trim() ??
      sc.match(/\bHTTPProxy\s*:\s*(.+)/)?.[1]?.trim() ??
      sc.match(/\bSOCKSProxy\s*:\s*(.+)/)?.[1]?.trim() ??
      null;
    const portRaw =
      sc.match(/\bHTTPSPort\s*:\s*(\d+)/)?.[1] ??
      sc.match(/\bHTTPPort\s*:\s*(\d+)/)?.[1] ??
      sc.match(/\bSOCKSPort\s*:\s*(\d+)/)?.[1] ??
      null;
    systemProxy = {
      enabled: http || https || socks || pac,
      http,
      https,
      socks,
      pac,
      host,
      port: portRaw ? Number(portRaw) : null,
    };
  }

  const ifconfigOut = sh('ifconfig');
  const utunInterfaces = Array.from(ifconfigOut.matchAll(/^(utun\d+):/gm)).map((m) => m[1]!);
  const netstatOut = sh('netstat -nr');
  const v4Table = netstatOut.split(/\nInternet6:\n/)[0] ?? '';
  const v6Table = netstatOut.split(/\nInternet6:\n/)[1] ?? '';
  const defaultIpv4ViaTun = /^default\s+\S+\s+\S+\s+utun\d+/m.test(v4Table);
  const defaultIpv6ViaTun = /^default\s+\S+\s+\S+\s+utun\d+/m.test(v6Table);
  const splitDefaultIpv4 =
    /\b128\.0\/1\s+\S+\s+\S+\s+utun\d+/m.test(v4Table) &&
    /\b1\s+\S+\s+\S+\s+utun\d+/m.test(v4Table);
  const splitDefaultIpv6 =
    /\b2000::\/3\s+\S+\s+\S+\s+utun\d+/m.test(v6Table) &&
    /\b8000::\/1\s+\S+\s+\S+\s+utun\d+/m.test(v6Table);
  const hasIpv6DefaultRoute = /^default\s+/m.test(v6Table);

  return {
    apps,
    envProxySet,
    clash,
    systemProxy,
    tun: {
      present: utunInterfaces.length > 0,
      utunInterfaces,
      hasIpv6DefaultRoute,
      defaultIpv4ViaTun,
      defaultIpv6ViaTun,
      splitDefaultIpv4,
      splitDefaultIpv6,
    },
  };
}

function npmGlobalRoots(): string[] {
  const roots: string[] = [];
  try {
    const r = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (r.trim()) roots.push(r.trim());
  } catch {
    /* npm missing */
  }
  // common fallbacks
  roots.push('/usr/local/lib/node_modules', join(homedir(), '.npm-global', 'lib', 'node_modules'));
  return roots;
}

function classifyBaseUrl(value: string | undefined): DoctorInput['baseUrl'] {
  if (!value) return { value: null, source: null, isOfficial: true, looksLikeRelay: false };
  let host = '';
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    host = value.toLowerCase();
  }
  const isOfficial = OFFICIAL_API_HOSTS.has(host);
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  const looksLikeRelay =
    !isOfficial && !isLocal && RELAY_HOST_HINTS.some((h) => host.includes(h));
  return { value, source: null, isOfficial, looksLikeRelay };
}

/**
 * Resolve which credential Claude Code will actually use, following its
 * precedence: explicit env token/key > subscription login.
 */
function resolvePrimaryKind(
  apiKeyEnvKind: ApiKeyEnvKind,
  authTokenKind: ApiKeyEnvKind,
  hasSubscription: boolean,
): CredentialKind {
  // A subscription OAuth token (sk-ant-oat*) is the red-line credential whether
  // it was placed in ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN — classify both.
  if (apiKeyEnvKind === 'oauth-token' || authTokenKind === 'oauth-token') return 'oauth-token-env';
  if (apiKeyEnvKind === 'api-key') return 'api-key';
  if (apiKeyEnvKind === 'other') return 'unknown';
  if (authTokenKind === 'api-key') return 'api-key';
  if (authTokenKind === 'other') return 'auth-token';
  if (hasSubscription) return 'subscription-oauth';
  return 'none';
}

export function collect(): DoctorInput {
  const home = homedir();
  const sEnv = settingsEnv(home);

  const baseUrlEff = effEnv('ANTHROPIC_BASE_URL', sEnv);
  const baseUrl = classifyBaseUrl(baseUrlEff.value);
  baseUrl.source = baseUrlEff.source;

  const apiKeyEff = effEnv('ANTHROPIC_API_KEY', sEnv);
  const apiKeyEnvKind = classifyKeyShape(apiKeyEff.value);
  const authTokenEff = effEnv('ANTHROPIC_AUTH_TOKEN', sEnv);
  const authTokenKind = classifyKeyShape(authTokenEff.value);
  const authTokenSet = authTokenEff.value != null;
  const hasSubscription = subscriptionPresent(home);
  const customHeadersSet = effEnv('ANTHROPIC_CUSTOM_HEADERS', sEnv).value != null;
  const apiKeyHelperSet = (() => {
    const s = readJson(join(home, '.claude', 'settings.json'));
    return typeof s?.apiKeyHelper === 'string' && s.apiKeyHelper.length > 0;
  })();

  const client = detectClient();

  // Local identity surface (read-only; nothing here is uploaded).
  const top = readJson(join(home, '.claude.json'));
  const oauthAccount = (top?.oauthAccount ?? null) as Record<string, unknown> | null;
  const identity = {
    machineIdPresent: typeof top?.machineID === 'string',
    userIdPresent: typeof top?.userID === 'string',
    statsigStableIdPresent: existsSync(join(home, '.claude', 'statsig')),
    telemetryPresent: existsSync(join(home, '.claude', 'telemetry')),
    orgType: typeof oauthAccount?.organizationType === 'string' ? (oauthAccount.organizationType as string) : null,
  };

  const isCI = ['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'BUILDKITE', 'CIRCLECI', 'JENKINS_URL'].some(
    (k) => process.env[k],
  );
  const runtime = { isCI, isInteractive: Boolean(process.stdout.isTTY) };

  let timezone: string | null = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    timezone = process.env.TZ ?? null;
  }

  return {
    platform: platform(),
    baseUrl,
    credential: {
      primaryKind: resolvePrimaryKind(apiKeyEnvKind, authTokenKind, hasSubscription),
      apiKeyEnvKind,
      authTokenEnvSet: authTokenSet,
      subscriptionPresent: hasSubscription,
      apiKeyHelperSet,
      customHeadersSet,
    },
    client,
    proxy: {
      http: process.env.HTTP_PROXY ?? process.env.http_proxy ?? null,
      https: process.env.HTTPS_PROXY ?? process.env.https_proxy ?? null,
    },
    localProxy: detectLocalProxy(),
    identity,
    runtime,
    timezone,
    network: null,
  };
}
