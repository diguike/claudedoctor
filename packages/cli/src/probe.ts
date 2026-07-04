/**
 * Opt-in IP-intelligence probe (B4). Off by default — honoring "100% local
 * unless the user asks". Pluggable providers, richest-first:
 *
 *  - `ipapi.is` (default) — free, NO key. Returns is_vpn / is_proxy / is_tor /
 *                is_datacenter / is_abuser + country + company. This is the
 *                keyless equivalent of a paid IP-intel API — no signup friction.
 *  - `ipdata`  — used only if you set IPDATA_API_KEY (BYO key). We never ship or
 *                scrape a key; ipdata's site works keyless only because it embeds
 *                its own referer-locked key, which we can't reuse from our origin.
 *  - `ip-api`  — last-resort fallback (free, no key; country + proxy + hosting).
 *
 * Any probe discloses your egress IP to the chosen provider; the caller surfaces that.
 */
import { KNOWN_UNSUPPORTED_REGIONS, type NetworkInfo } from '@claudedoctor/core';

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Only assert `false` for a known-unsupported region; everything else is
 * `null` (unknown) — we don't have Anthropic's full allow-list, so we never
 * claim "supported" from the absence of a blocklist hit (see catalog.ts).
 */
function supported(cc: string | null): boolean | null {
  if (!cc) return null;
  return cc in KNOWN_UNSUPPORTED_REGIONS ? false : null;
}

/* ---- provider: ipapi.is (default, keyless, rich) ---- */
interface IpApiIsResponse {
  ip?: string;
  is_datacenter?: boolean;
  is_vpn?: boolean;
  is_proxy?: boolean;
  is_tor?: boolean;
  is_abuser?: boolean;
  is_mobile?: boolean;
  location?: { country?: string; country_code?: string };
  company?: { name?: string; type?: string; abuser_score?: string };
  asn?: { org?: string; descr?: string; abuser_score?: string };
}

async function probeIpApiIs(timeoutMs: number): Promise<NetworkInfo | null> {
  const d = await fetchJson<IpApiIsResponse>('https://api.ipapi.is/', timeoutMs);
  if (!d || !d.location?.country_code) return null;
  const cc = d.location.country_code.toUpperCase();
  const flaggedProxy = Boolean(d.is_vpn || d.is_proxy);
  const threatLevel = d.is_abuser ? 'high' : flaggedProxy || d.is_tor ? 'medium' : 'low';
  return {
    provider: 'ipapi.is',
    egressIp: d.ip ?? null,
    countryCode: cc,
    countryName: d.location.country ?? null,
    isSupportedRegion: supported(cc),
    asnType: d.is_datacenter ? 'datacenter' : d.company?.type === 'isp' || d.is_mobile ? 'residential' : 'unknown',
    asnOrg: d.company?.name || d.asn?.org || d.asn?.descr || null,
    isProxy: flaggedProxy,
    isTor: d.is_tor ?? null,
    isHosting: d.is_datacenter ?? null,
    isMobile: d.is_mobile ?? null,
    threatLevel,
    riskScore: d.asn?.abuser_score || d.company?.abuser_score || null,
  };
}

/* ---- provider: ipdata (optional, BYO key) ---- */
interface IpDataResponse {
  ip?: string;
  country_code?: string;
  country_name?: string;
  asn?: { name?: string; type?: string };
  threat?: {
    is_tor?: boolean;
    is_proxy?: boolean;
    is_vpn?: boolean;
    is_datacenter?: boolean;
    is_anonymous?: boolean;
    is_threat?: boolean;
  };
  message?: string;
}

async function probeIpData(apiKey: string, timeoutMs: number): Promise<NetworkInfo | null> {
  const d = await fetchJson<IpDataResponse>(
    `https://api.ipdata.co/?api-key=${encodeURIComponent(apiKey)}`,
    timeoutMs,
  );
  if (!d || d.message || !d.country_code) return null;
  const cc = d.country_code.toUpperCase();
  const th = d.threat ?? {};
  const asnType = d.asn?.type === 'hosting' || th.is_datacenter ? 'datacenter' : d.asn?.type === 'isp' ? 'residential' : 'unknown';
  return {
    provider: 'ipdata',
    egressIp: d.ip ?? null,
    countryCode: cc,
    countryName: d.country_name ?? null,
    isSupportedRegion: supported(cc),
    asnType,
    asnOrg: d.asn?.name ?? null,
    isProxy: th.is_proxy || th.is_vpn ? true : th.is_proxy === false && th.is_vpn === false ? false : null,
    isTor: th.is_tor ?? null,
    isHosting: th.is_datacenter ?? null,
    isMobile: null,
    threatLevel: th.is_threat ? 'high' : th.is_anonymous ? 'medium' : 'low',
  };
}

/* ---- provider: ip-api.com (fallback, keyless) ---- */
interface IpApiResponse {
  status?: string;
  country?: string;
  countryCode?: string;
  isp?: string;
  org?: string;
  as?: string;
  proxy?: boolean;
  hosting?: boolean;
  mobile?: boolean;
  query?: string;
}

async function probeIpApi(timeoutMs: number): Promise<NetworkInfo | null> {
  const d = await fetchJson<IpApiResponse>(
    'http://ip-api.com/json/?fields=status,country,countryCode,isp,org,as,proxy,hosting,mobile,query',
    timeoutMs,
  );
  if (!d || d.status !== 'success') return null;
  const cc = d.countryCode ? d.countryCode.toUpperCase() : null;
  return {
    provider: 'ip-api',
    egressIp: d.query ?? null,
    countryCode: cc,
    countryName: d.country ?? null,
    isSupportedRegion: supported(cc),
    asnType: d.hosting ? 'datacenter' : d.proxy ? 'unknown' : 'residential',
    asnOrg: d.org || d.isp || d.as || null,
    isProxy: d.proxy ?? null,
    isTor: null,
    isHosting: d.hosting ?? null,
    isMobile: d.mobile ?? null,
    threatLevel: null,
  };
}

/** Probe with the richest available provider. */
export async function probeNetwork(timeoutMs = 6000): Promise<NetworkInfo | null> {
  const key = process.env.IPDATA_API_KEY;
  if (key) {
    const viaIpData = await probeIpData(key, timeoutMs);
    if (viaIpData) return viaIpData;
  }
  const viaIpApiIs = await probeIpApiIs(timeoutMs);
  if (viaIpApiIs) return viaIpApiIs;
  return probeIpApi(timeoutMs);
}

/** Which provider a probe would use, for honest disclosure before it runs. */
export function activeProviderName(): string {
  return process.env.IPDATA_API_KEY ? 'ipdata.co（你的 key）' : 'ipapi.is（免费·免 key）';
}
