/**
 * Collector — read the *real* local Claude Code environment and hand core a
 * sanitized snapshot. Credentials are classified into enums here; raw secret
 * values never leave this file and are never printed. Node-only (I/O lives here,
 * core stays pure).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import {
  OFFICIAL_API_HOSTS,
  RELAY_HOST_HINTS,
  type ApiKeyEnvKind,
  type CredentialKind,
  type DoctorInput,
} from '@claudedoctor/core';
import { parse as parseYaml } from 'yaml';

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

interface EffectiveSettings {
  env: Record<string, string>;
  managedEnv: Record<string, string>;
  apiKeyHelper: string | null;
}

function projectRoot(): string {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim() || process.cwd();
  } catch {
    return process.cwd();
  }
}

function managedSettingsPaths(): string[] {
  const base =
    platform() === 'darwin'
      ? '/Library/Application Support/ClaudeCode'
      : platform() === 'win32'
        ? join(process.env.ProgramFiles ?? 'C:\\Program Files', 'ClaudeCode')
        : '/etc/claude-code';
  const paths = [join(base, 'managed-settings.json')];
  const dropIn = join(base, 'managed-settings.d');
  try {
    for (const file of readdirSync(dropIn).filter((name) => !name.startsWith('.') && name.endsWith('.json')).sort()) {
      paths.push(join(dropIn, file));
    }
  } catch {
    /* no managed drop-in directory */
  }
  return paths;
}

/** Resolve the settings scopes Claude Code can read locally, low to high. */
function effectiveSettings(configDir: string): EffectiveSettings {
  const root = projectRoot();
  const regularPaths = [
    join(configDir, 'settings.json'),
    join(root, '.claude', 'settings.json'),
    join(root, '.claude', 'settings.local.json'),
  ];
  const managedPaths = managedSettingsPaths();
  const result: EffectiveSettings = { env: {}, managedEnv: {}, apiKeyHelper: null };
  for (const path of [...regularPaths, ...managedPaths]) {
    const settings = readJson(path);
    if (!settings) continue;
    const env = settings.env;
    if (env && typeof env === 'object') {
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === 'string') {
          const target = managedPaths.includes(path) ? result.managedEnv : result.env;
          target[key] = value;
        }
      }
    }
    if (typeof settings.apiKeyHelper === 'string') result.apiKeyHelper = settings.apiKeyHelper;
  }
  return result;
}

/** Effective value: managed settings, then process env, then local/project/user settings. */
function effEnv(
  key: string,
  sEnv: Record<string, string>,
  managedEnv: Record<string, string>,
): { value: string | undefined; source: 'process-env' | 'settings-json' | null } {
  if (managedEnv[key] != null && managedEnv[key] !== '') {
    return { value: managedEnv[key], source: 'settings-json' };
  }
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
function subscriptionPresent(home: string, configDir: string): boolean {
  // Linux / some setups store a credentials file.
  if (existsSync(join(configDir, '.credentials.json'))) return true;
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

export function detectClient(): DoctorInput['client'] {
  let executablePath: string | null = null;
  let resolvedPath: string | null = null;
  let version: string | null = null;

  try {
    const locator = platform() === 'win32' ? 'where.exe' : 'which';
    const output = execFileSync(locator, [platform() === 'win32' ? 'claude.exe' : 'claude'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    });
    executablePath = output.split(/\r?\n/).find(Boolean)?.trim() ?? null;
    if (executablePath) {
      try {
        resolvedPath = realpathSync(executablePath);
      } catch {
        resolvedPath = executablePath;
      }
      const versionOutput = execFileSync(executablePath, ['--version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      });
      version = versionOutput.match(/\b\d+\.\d+\.\d+(?:[-+][\w.-]+)?\b/)?.[0] ?? null;
    }
  } catch {
    /* not installed, not on PATH, or did not answer --version */
  }

  const normalized = (resolvedPath ?? executablePath ?? '').replaceAll('\\', '/');
  const invoked = (executablePath ?? '').replaceAll('\\', '/');
  const home = homedir().replaceAll('\\', '/');
  const native =
    invoked === `${home}/.local/bin/claude` ||
    invoked === `${home}/.local/bin/claude.exe` ||
    normalized.startsWith(`${home}/.local/share/claude/`) ||
    normalized.startsWith(`${home}/.claude/local/`);
  const npm = normalized.includes('/node_modules/@anthropic-ai/claude-code');
  const homebrew = /\/(?:Caskroom|Cellar)\/claude-code(?:@latest)?\//.test(normalized);
  const winget = /\/Microsoft\/WinGet\/Packages\/Anthropic\.ClaudeCode_/i.test(normalized);
  const installMethod = native ? 'native' : homebrew ? 'homebrew' : winget ? 'winget' : npm ? 'npm' : null;

  return {
    version,
    isOfficialBinary: version != null && installMethod != null,
    installMethod,
    executablePath,
  };
}

/**
 * Run a simple no-shell command (space-split argv). Avoids spawning a login
 * shell (`/bin/zsh -lc` sourced rc files, added latency, and broke on non-zsh
 * platforms); these commands (ps/ifconfig/netstat/scutil) need no shell features.
 */
function sh(cmd: string): string {
  const [bin, ...args] = cmd.split(/\s+/);
  if (!bin) return '';
  try {
    return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function readText(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function detectClashConfig(psOut: string): NonNullable<NonNullable<DoctorInput['localProxy']>['clash']> | undefined {
  const clashLine = psOut
    .split('\n')
    .find((line) => /(?:verge-mihomo|clash-verge|mihomo)/i.test(line) && /\s-f\s/.test(line));
  const configPath =
    clashLine?.match(/\s-f\s+(?:"([^"]+\.ya?ml)"|'([^']+\.ya?ml)'|(\S+\.ya?ml))/i)?.slice(1).find(Boolean)?.trim() ?? null;
  if (!configPath) return undefined;
  const text = readText(configPath);
  if (!text) {
    return {
      configPath,
      parseStatus: 'unreadable',
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
    };
  }

  let config: Record<string, unknown>;
  try {
    config = record(parseYaml(text)) ?? {};
  } catch {
    return {
      configPath,
      parseStatus: 'unreadable',
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
    };
  }
  const dns = record(config.dns) ?? {};
  const tun = record(config.tun) ?? {};
  const rules = Array.isArray(config.rules) ? config.rules.filter((item): item is string => typeof item === 'string') : [];
  const groups = Array.isArray(config['proxy-groups'])
    ? config['proxy-groups'].map(record).filter((item): item is Record<string, unknown> => item !== null)
    : [];
  const claudeRule = rules.find((rule) =>
    /^(?:DOMAIN|DOMAIN-SUFFIX|DOMAIN-KEYWORD|GEOSITE),[^,]*(?:anthropic|claude\.(?:ai|com)|claude)[^,]*,/i.test(rule.trim()),
  );
  const claudeRuleTarget = claudeRule?.split(',').at(-1)?.trim() || null;
  const aiGroup =
    groups.find((group) => claudeRuleTarget != null && str(group.name) === claudeRuleTarget) ??
    groups.find((group) => /(?:claude|anthropic)/i.test(str(group.name) ?? '')) ??
    null;
  const aiGroupMembers = Array.isArray(aiGroup?.proxies)
    ? aiGroup.proxies.filter((item): item is string => typeof item === 'string')
    : [];
  const finalMatchTarget = rules
    .filter((rule) => /^MATCH,/i.test(rule.trim()))
    .at(-1)
    ?.split(',')
    .at(-1)
    ?.trim() || null;

  return {
    configPath,
    parseStatus: 'parsed',
    mode: str(config.mode),
    mixedPort: num(config['mixed-port']),
    ipv6: bool(config.ipv6),
    dnsEnabled: bool(dns.enable),
    dnsIpv6: bool(dns.ipv6),
    dnsEnhancedMode: str(dns['enhanced-mode']),
    dnsRespectRules: bool(dns['respect-rules']),
    tunEnabled: bool(tun.enable),
    tunStack: str(tun.stack),
    tunAutoRoute: bool(tun['auto-route']),
    tunStrictRoute: bool(tun['strict-route']),
    hasClaudeCodeGroup: aiGroup !== null,
    hasClaudeRules: claudeRule !== undefined,
    claudeRuleTarget,
    finalMatchTarget,
    aiGroupMembers,
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

  const psOut = sh('ps auxww'); // ww = unlimited width, so long config paths aren't truncated
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

function sanitizedOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === 'null' ? `<${url.protocol.replace(':', '')}-url>` : url.origin;
  } catch {
    return '<invalid-url>';
  }
}

function classifyBaseUrl(value: string | undefined): DoctorInput['baseUrl'] {
  if (!value) return { value: null, source: null, isOfficial: true, looksLikeRelay: false };
  let host = '';
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    /* Invalid input is reported without echoing a potentially secret value. */
  }
  const isOfficial = OFFICIAL_API_HOSTS.has(host);
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local');
  const looksLikeRelay =
    !isOfficial && !isLocal && RELAY_HOST_HINTS.some((h) => host.includes(h));
  return { value: sanitizedOrigin(value), source: null, isOfficial, looksLikeRelay };
}

/**
 * Resolve which credential Claude Code will actually use, following its
 * precedence: explicit env token/key > subscription login.
 */
export function resolvePrimaryKind(
  apiKeyEnvKind: ApiKeyEnvKind,
  authTokenKind: ApiKeyEnvKind,
  oauthTokenEnvSet: boolean,
  apiKeyHelperSet: boolean,
  cloudProvider: DoctorInput['credential']['cloudProvider'],
  hasSubscription: boolean,
): CredentialKind {
  // Mirrors the documented Claude Code precedence. Do not infer from which
  // credentials merely exist; only the first effective source is classified.
  if (cloudProvider) return 'cloud-provider';
  if (authTokenKind === 'oauth-token') return 'oauth-token-env';
  if (authTokenKind !== 'none') return 'auth-token';
  if (apiKeyEnvKind === 'oauth-token') return 'oauth-token-env';
  if (apiKeyEnvKind === 'api-key') return 'api-key';
  if (apiKeyEnvKind === 'other') return 'unknown';
  if (apiKeyHelperSet) return 'api-key-helper';
  if (oauthTokenEnvSet) return 'oauth-token-env';
  if (hasSubscription) return 'subscription-oauth';
  return 'none';
}

export function collect(): DoctorInput {
  const home = homedir();
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(home, '.claude');
  const settings = effectiveSettings(configDir);
  const sEnv = settings.env;
  const env = (key: string) => effEnv(key, sEnv, settings.managedEnv);

  const baseUrlEff = env('ANTHROPIC_BASE_URL');
  const baseUrl = classifyBaseUrl(baseUrlEff.value);
  baseUrl.source = baseUrlEff.source;

  const apiKeyEff = env('ANTHROPIC_API_KEY');
  const apiKeyEnvKind = classifyKeyShape(apiKeyEff.value);
  const authTokenEff = env('ANTHROPIC_AUTH_TOKEN');
  const authTokenKind = classifyKeyShape(authTokenEff.value);
  const authTokenSet = authTokenEff.value != null;
  const oauthTokenEff = env('CLAUDE_CODE_OAUTH_TOKEN');
  const oauthTokenEnvSet = oauthTokenEff.value != null;
  const hasSubscription = subscriptionPresent(home, configDir);
  const customHeadersSet = env('ANTHROPIC_CUSTOM_HEADERS').value != null;
  const apiKeyHelperSet = Boolean(settings.apiKeyHelper);
  const cloudProvider = env('CLAUDE_CODE_USE_BEDROCK').value
    ? 'bedrock'
    : env('CLAUDE_CODE_USE_VERTEX').value
      ? 'vertex'
      : env('CLAUDE_CODE_USE_FOUNDRY').value
        ? 'foundry'
        : null;

  const client = detectClient();

  // Local identity surface (read-only; nothing here is uploaded).
  const top = readJson(join(home, '.claude.json'));
  const oauthAccount = (top?.oauthAccount ?? null) as Record<string, unknown> | null;
  const identity = {
    machineIdPresent: typeof top?.machineID === 'string',
    userIdPresent: typeof top?.userID === 'string',
    statsigStableIdPresent: existsSync(join(configDir, 'statsig')),
    telemetryPresent: existsSync(join(configDir, 'telemetry')),
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
      primaryKind: resolvePrimaryKind(
        apiKeyEnvKind,
        authTokenKind,
        oauthTokenEnvSet,
        apiKeyHelperSet,
        cloudProvider,
        hasSubscription,
      ),
      apiKeyEnvKind,
      apiKeyEnvSource: apiKeyEff.source,
      authTokenEnvSet: authTokenSet,
      authTokenEnvSource: authTokenEff.source,
      oauthTokenEnvSet,
      oauthTokenEnvSource: oauthTokenEff.source,
      cloudProvider,
      subscriptionPresent: hasSubscription,
      apiKeyHelperSet,
      customHeadersSet,
    },
    client,
    proxy: {
      http: sanitizedOrigin(process.env.HTTP_PROXY ?? process.env.http_proxy),
      https: sanitizedOrigin(process.env.HTTPS_PROXY ?? process.env.https_proxy),
    },
    localProxy: detectLocalProxy(),
    identity,
    runtime,
    timezone,
    network: null,
    networkProbe: 'not-requested',
  };
}
