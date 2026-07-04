/**
 * Evidence catalog — canonical source links and reference data.
 * Every finding cites from here so the CLI's `--why` and the web app share one
 * source of truth. Backing research: ../../../docs/ban-signals.md.
 */

export const SOURCES = {
  /** Official Claude Code legal doc — "Authentication and credential use". confirmed. */
  ccLegal: 'https://code.claude.com/docs/en/legal-and-compliance',
  /** Anthropic Usage Policy (AUP). confirmed. */
  aup: 'https://www.anthropic.com/legal/aup',
  /** Consumer Terms — no credential sharing / reselling. confirmed. */
  consumerTerms: 'https://www.anthropic.com/legal/consumer-terms',
  commercialTerms: 'https://www.anthropic.com/legal/commercial-terms',
  /** Safeguards, warnings & appeals — lists ban reasons incl. unsupported location. confirmed. */
  appeals: 'https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals',
  /** Official supported-countries list. confirmed. */
  supportedCountries: 'https://www.anthropic.com/supported-countries',
  /** Anthropic employee (Thariq) confirming harness-spoofing crackdown. confirmed. */
  harnessCrackdownHN: 'https://news.ycombinator.com/item?id=46549823',
  harnessCrackdownVB:
    'https://venturebeat.com/technology/anthropic-cracks-down-on-unauthorized-claude-usage-by-third-party-harnesses',
  /** Stale ANTHROPIC_API_KEY overrides subscription login (false lockout). confirmed. */
  staleKeyBug: 'https://github.com/anthropics/claude-code/issues/8327',
  /** relay vs per-profile architectures — which gets banned. reported. */
  relayArch:
    'https://dev.to/vainamoinen/two-multi-account-claude-code-architectures-one-anthropic-accepts-one-they-ban-2om7',
  /** Datacenter IP blocked at Cloudflare on claude.ai OAuth. confirmed (access, not ban). */
  datacenterOAuth: 'https://github.com/anthropics/claude-code/issues/36201',
  /** Unsupported-region 400 error. confirmed. */
  regionBlock: 'https://github.com/anthropics/claude-code/issues/2656',
  /** Our own byte-level M0 forensics ledger. */
  mechanismLedger: 'docs/mechanism.md',
} as const;

/**
 * Curated set of regions Anthropic does NOT support (subset — the authoritative
 * source is SOURCES.supportedCountries). ISO 3166-1 alpha-2. Used only to flag
 * a *known-unsupported* egress; anything else is reported as "unknown", never
 * asserted as supported.
 */
export const KNOWN_UNSUPPORTED_REGIONS: Record<string, string> = {
  CN: 'China (mainland)',
  HK: 'Hong Kong',
  MO: 'Macau',
  RU: 'Russia',
  IR: 'Iran',
  KP: 'North Korea',
  SY: 'Syria',
  CU: 'Cuba',
  BY: 'Belarus',
  VE: 'Venezuela',
};

/** Official Anthropic API hostnames — a base URL on these is "official". */
export const OFFICIAL_API_HOSTS = new Set([
  'api.anthropic.com',
  'api.claude.com',
]);

/**
 * Heuristic substrings that suggest an aggregating relay / mirror / "拼车" pool.
 * Matching only raises a *reported*-confidence warning; it never asserts a ban.
 */
export const RELAY_HOST_HINTS = [
  'relay',
  'mirror',
  'proxy',
  'gpt',
  'claude',
  'anyrouter',
  'packycode',
  'pincc',
  'oaipro',
  'aihubmix',
  'router',
  '2api',
  'gaccode',
];
