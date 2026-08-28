import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnose, regionSupport } from '../dist/index.js';

function input(overrides = {}) {
  const base = {
    platform: 'linux',
    baseUrl: { value: null, source: null, isOfficial: true, looksLikeRelay: false },
    credential: {
      primaryKind: 'subscription-oauth',
      apiKeyEnvKind: 'none',
      authTokenEnvSet: false,
      oauthTokenEnvSet: false,
      cloudProvider: null,
      subscriptionPresent: true,
      apiKeyHelperSet: false,
      customHeadersSet: false,
    },
    client: {
      version: '2.1.206',
      isOfficialBinary: true,
      installMethod: 'native',
      executablePath: '/home/test/.local/bin/claude',
    },
    proxy: { http: null, https: null },
    identity: {
      machineIdPresent: false,
      userIdPresent: false,
      statsigStableIdPresent: false,
      telemetryPresent: false,
      orgType: null,
    },
    runtime: { isCI: false, isInteractive: true },
    timezone: 'Asia/Singapore',
    network: null,
    networkProbe: 'not-requested',
  };
  return { ...base, ...overrides };
}

test('uses the official allow-list instead of a partial deny-list', () => {
  assert.equal(regionSupport('SG'), true);
  assert.equal(regionSupport('CN'), false);
  assert.equal(regionSupport('AF'), false);
  assert.equal(regionSupport('not-a-code'), null);
});
test('flags an unsupported region that the old ten-country list missed', () => {
  const network = {
    provider: 'test',
    egressIp: '192.0.2.1',
    countryCode: 'AF',
    countryName: 'Afghanistan',
    isSupportedRegion: false,
    asnType: 'unknown',
    asnOrg: null,
    isProxy: null,
    isTor: null,
    isHosting: null,
    isMobile: null,
    threatLevel: null,
    selectedFamily: 'ipv4',
  };
  const result = diagnose(input({ network, networkProbe: 'complete' }));
  assert.equal(result.findings.find((finding) => finding.id === 'B4-region')?.status, 'risk');
  assert.equal(result.summary.level, 'at-risk');
});

test('treats an official setup-token as supported CI authentication', () => {
  const credential = {
    ...input().credential,
    primaryKind: 'oauth-token-env',
    oauthTokenEnvSet: true,
    subscriptionPresent: false,
  };
  const result = diagnose(input({ credential, runtime: { isCI: true, isInteractive: false } }));
  const auth = result.findings.find((finding) => finding.id === 'A2-credential-share');
  assert.equal(auth?.status, 'ok');
  assert.match(auth?.summary ?? '', /setup-token/);
  assert.equal(result.findings.some((finding) => finding.id === 'A6-automation'), false);
});

test('surfaces unscored path warnings in the health summary', () => {
  const localProxy = {
    apps: [],
    envProxySet: false,
    systemProxy: {
      enabled: true,
      http: true,
      https: true,
      socks: false,
      pac: false,
      host: '127.0.0.1',
      port: 7890,
    },
    tun: {
      present: false,
      utunInterfaces: [],
      hasIpv6DefaultRoute: false,
      defaultIpv4ViaTun: false,
      defaultIpv6ViaTun: false,
      splitDefaultIpv4: false,
      splitDefaultIpv6: false,
    },
  };
  const result = diagnose(input({ localProxy }));
  assert.equal(result.findings.find((finding) => finding.id === 'L1-proxy-hijack')?.scored, false);
  assert.equal(result.summary.warnCount, 1);
  assert.equal(result.summary.level, 'attention');
});

test('requires both date separators to be ASCII hyphens', () => {
  const result = diagnose(input({
    dateLine: {
      text: "Today's date is 2026-07/10.",
      apostropheHex: '27',
      separatorHex: '2d 2f',
    },
  }));
  assert.equal(result.findings.find((finding) => finding.id === 'M0-date-stego')?.status, 'warn');
});
