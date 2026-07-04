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
    identity,
    runtime,
    timezone,
    network: null,
  };
}
