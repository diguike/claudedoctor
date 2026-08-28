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
  /** Current authentication precedence and setup-token guidance. */
  authentication: 'https://code.claude.com/docs/en/authentication',
  /** Official installation methods and native installer recommendation. */
  installation: 'https://code.claude.com/docs/en/installation',
  /** relay vs per-profile architectures — which gets banned. reported. */
  relayArch:
    'https://dev.to/vainamoinen/two-multi-account-claude-code-architectures-one-anthropic-accepts-one-they-ban-2om7',
  /** Datacenter IP blocked at Cloudflare on claude.ai OAuth. confirmed (access, not ban). */
  datacenterOAuth: 'https://github.com/anthropics/claude-code/issues/36201',
  /** Unsupported-region 400 error. confirmed. */
  regionBlock: 'https://github.com/anthropics/claude-code/issues/2656',
  /** Our own byte-level M0 forensics ledger. */
  mechanismLedger: 'docs/mechanism.md',
  /** Our own ledger for local-only network-path divergence diagnosis. */
  networkLedger: 'docs/ban-signals.md',
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

/**
 * Current Claude.ai/API allow-list, transcribed from the official supported
 * countries page. An allow-list is intentionally used here: absence from the
 * old ten-country deny-list produced false "clean" verdicts for many regions.
 * Keep this list covered by the scheduled evidence audit.
 */
export const SUPPORTED_REGION_CODES = new Set([
  'AL', 'DZ', 'AD', 'AO', 'AG', 'AR', 'AM', 'AU', 'AT', 'AZ', 'BS', 'BH', 'BD', 'BB', 'BE',
  'BZ', 'BJ', 'BT', 'BO', 'BA', 'BW', 'BR', 'BN', 'BG', 'BF', 'BI', 'CV', 'KH', 'CM', 'CA',
  'CF', 'TD', 'CL', 'CO', 'KM', 'CG', 'CR', 'CI', 'HR', 'CY', 'CZ', 'DK', 'DJ', 'DM', 'DO',
  'EC', 'EG', 'SV', 'GQ', 'ER', 'EE', 'SZ', 'ET', 'FJ', 'FI', 'FR', 'GA', 'GM', 'GE', 'DE',
  'GH', 'GR', 'GD', 'GT', 'GN', 'GW', 'GY', 'HT', 'HN', 'HU', 'IS', 'IN', 'ID', 'IQ', 'IE',
  'IL', 'IT', 'JM', 'JP', 'JO', 'KZ', 'KE', 'KI', 'KW', 'KG', 'LA', 'LV', 'LB', 'LS', 'LR',
  'LY', 'LI', 'LT', 'LU', 'MG', 'MW', 'MY', 'MV', 'ML', 'MT', 'MH', 'MR', 'MU', 'MX', 'FM',
  'MD', 'MC', 'MN', 'ME', 'MA', 'MZ', 'NA', 'NR', 'NP', 'NL', 'NZ', 'NI', 'NE', 'NG', 'MK',
  'NO', 'OM', 'PK', 'PW', 'PS', 'PA', 'PG', 'PY', 'PE', 'PH', 'PL', 'PT', 'QA', 'RO', 'RW',
  'KN', 'LC', 'VC', 'WS', 'SM', 'ST', 'SA', 'SN', 'RS', 'SC', 'SL', 'SG', 'SK', 'SI', 'SO',
  'SB', 'ZA', 'KR', 'SS', 'ES', 'LK', 'SD', 'SR', 'SE', 'CH', 'TW', 'TJ', 'TZ', 'TH', 'TL',
  'TG', 'TO', 'TT', 'TN', 'TR', 'TM', 'TV', 'UG', 'UA', 'AE', 'GB', 'US', 'UY', 'UZ', 'VU',
  'VA', 'VN', 'ZM', 'ZW',
]);

/** null means the provider did not return a usable ISO alpha-2 code. */
export function regionSupport(countryCode: string | null | undefined): boolean | null {
  const code = countryCode?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code)) return null;
  return SUPPORTED_REGION_CODES.has(code);
}

/** Official Anthropic API hostnames — a base URL on these is "official". */
export const OFFICIAL_API_HOSTS = new Set([
  'api.anthropic.com',
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
