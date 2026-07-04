/**
 * @claudedoctor/core — shared types
 *
 * The core package is pure and isomorphic: it takes a *sanitized* snapshot of
 * the environment (never raw secrets — the CLI classifies credentials into
 * enums first) and returns a diagnosis. See ../../../docs/ban-signals.md for the
 * evidence behind every signal, and CLAUDE.md §7 for the causal/ambiance rules.
 */

/** How sure we are, per CLAUDE.md §7. Never claim more than the evidence supports. */
export type Confidence = 'confirmed' | 'reported' | 'speculative';

/**
 * Finding status:
 * - `ok`   — checked, healthy (no risk on this axis).
 * - `info` — informational / ambiance signal that does NOT affect Claude Code
 *            (shown, never scored). E.g. system timezone, local proxy.
 * - `warn` — a reported concern with plausible server-side causality.
 * - `risk` — a confirmed red line (ToS violation / known ban vector).
 */
export type FindingStatus = 'ok' | 'info' | 'warn' | 'risk';

/** Stable signal identifiers — mirror the IDs in docs/ban-signals.md §1. */
export type SignalId =
  | 'A1-relay-oauth'      // subscription OAuth routed through a non-official relay
  | 'A1-relay-apikey'     // API key through a relay (allowed — informational)
  | 'A2-credential-share' // credential type / sharing hygiene
  | 'A2-stale-apikey'     // stray ANTHROPIC_API_KEY overriding subscription login
  | 'A3-client-integrity' // non-official / spoofed client
  | 'A3-custom-headers'   // custom headers that can look like harness spoofing
  | 'A5-device'           // device / telemetry transparency (local identity)
  | 'A6-automation'       // non-interactive / CI + subscription credential
  | 'B4-region'           // egress IP in an unsupported region
  | 'B4-datacenter'       // datacenter ASN → claude.ai OAuth reachability
  | 'B4-proxy'            // egress IP flagged as proxy / VPN / Tor
  | 'M0-date-stego'       // the (falsified) date-line steganography, re-checked
  | 'AMB-timezone';       // system timezone — ambiance only

/**
 * What credential Claude Code will actually authenticate with, after the CLI
 * resolves precedence. Core reasons on this enum; it never sees the raw secret.
 */
export type CredentialKind =
  | 'none'                // no usable credential found
  | 'subscription-oauth'  // official claude.ai login (Keychain / .credentials.json)
  | 'api-key'             // sk-ant-api* — pay-as-you-go API key
  | 'oauth-token-env'     // sk-ant-oat* placed in an env var (setup-token) — brittle
  | 'auth-token'          // ANTHROPIC_AUTH_TOKEN set — typical relay/third-party style
  | 'unknown';            // set, but shape unrecognized

/** What is sitting specifically in the ANTHROPIC_API_KEY env var. */
export type ApiKeyEnvKind = 'none' | 'api-key' | 'oauth-token' | 'other';

/** Optional network probe result (B4). Only present when the user opts into `--net`. */
export interface NetworkInfo {
  /** which provider produced this, e.g. 'ip-api' | 'ipdata'. */
  provider: string;
  egressIp: string | null;
  /** ISO 3166-1 alpha-2, uppercased. */
  countryCode: string | null;
  countryName: string | null;
  /** null = unknown (couldn't classify against the region list). */
  isSupportedRegion: boolean | null;
  asnType: 'residential' | 'datacenter' | 'unknown' | null;
  asnOrg: string | null;
  /** proxy / VPN flag (null = provider didn't say). */
  isProxy: boolean | null;
  /** Tor exit node (ipdata & co.; null when unknown). */
  isTor: boolean | null;
  /** hosting / datacenter ASN flag. */
  isHosting: boolean | null;
  /** mobile carrier IP. */
  isMobile: boolean | null;
  /** reputation / threat level when the provider supplies it. */
  threatLevel: 'low' | 'medium' | 'high' | null;
  /** human-readable risk/abuse score label, e.g. "0.0153 (Elevated)" (optional). */
  riskScore?: string | null;
}

/** The sanitized environment snapshot the CLI hands to core. All fields optional/partial-safe. */
export interface DoctorInput {
  platform: string;
  baseUrl: {
    value: string | null;
    /** where the base URL came from, for accurate fix instructions */
    source: 'process-env' | 'settings-json' | null;
    /** true when the host is one of Anthropic's official endpoints */
    isOfficial: boolean;
    /** heuristic: looks like an aggregating relay/mirror (multi-account pool) */
    looksLikeRelay: boolean;
  };
  credential: {
    /** the credential Claude Code will actually use, after precedence resolution */
    primaryKind: CredentialKind;
    /** what's in ANTHROPIC_API_KEY specifically (drives the stale-override check) */
    apiKeyEnvKind: ApiKeyEnvKind;
    authTokenEnvSet: boolean;
    /** official subscription login exists on disk / keychain */
    subscriptionPresent: boolean;
    apiKeyHelperSet: boolean;
    customHeadersSet: boolean;
  };
  client: {
    version: string | null;
    /** running the official @anthropic-ai/claude-code binary */
    isOfficialBinary: boolean;
    installMethod: string | null;
  };
  proxy: { http: string | null; https: string | null };
  /**
   * Local identity surface — read-only transparency, never uploaded. machineID
   * is a local random install id that (per binary forensics) does NOT go
   * outbound; what actually leaves is account/org uuid + session id.
   */
  identity: {
    machineIdPresent: boolean;
    userIdPresent: boolean;
    statsigStableIdPresent: boolean;
    telemetryPresent: boolean;
    /** oauthAccount.organizationType, e.g. "claude_max" (or null). */
    orgType: string | null;
  };
  /** Runtime shape — used to spot automation/CI using a subscription credential. */
  runtime: { isCI: boolean; isInteractive: boolean };
  timezone: string | null;
  /** M0 re-check: the actual bytes of the `Today's date is …` line, if probed. */
  dateLine?: { text: string; apostropheHex: string; separatorHex: string } | null;
  network?: NetworkInfo | null;
}

/** An executable prescription attached to a finding. Dry-run by default. */
export interface Fix {
  kind: 'unset-env' | 'switch-credential' | 'remove-override' | 'advisory' | 'network';
  title: string;
  /** shell commands the user can run; empty for advisory-only fixes */
  commands: string[];
  note?: string;
}

/** One diagnosis line. */
export interface Finding {
  id: SignalId;
  title: string;
  status: FindingStatus;
  confidence: Confidence;
  /** true = has a real server-side causal link; false = ambiance (never scored). */
  causal: boolean;
  /**
   * Optional explicit class label (overrides the default 因果/氛围 tag). Use for
   * signals that are neither pure ambiance nor currently-causal — e.g. a
   * profile factor that WAS a marker input and could recur ("画像因子").
   */
  classLabel?: string;
  /** whether this finding contributes to the health summary. */
  scored: boolean;
  summary: string;
  detail?: string;
  /** source URLs / ToS clause references backing this finding. */
  evidence: string[];
  fix?: Fix;
}

export type HealthLevel = 'healthy' | 'attention' | 'at-risk';

export interface Diagnosis {
  findings: Finding[];
  summary: {
    level: HealthLevel;
    riskCount: number;
    warnCount: number;
    okCount: number;
    infoCount: number;
    /** short human headline, e.g. "官方配置，未见已知封号向量". */
    headline: string;
  };
}
