import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { blockLines } from '../dist/apply.js';
import { parseFlags } from '../dist/cli.js';
import { collect, detectClashConfig, resolvePrimaryKind } from '../dist/collect.js';
import { actualFamily, aggregateFamilyResults } from '../dist/probe.js';
import { extractDateLine } from '../dist/verify.js';

test('rejects unknown CLI options instead of silently ignoring them', () => {
  const parsed = parseFlags(['check', '--definitely-invalid']);
  assert.equal(parsed.error, '未知选项: --definitely-invalid');
});

test('extracts and checks both date separators', () => {
  const line = extractDateLine('{"system":"Today\'s date is 2026-07/10."}');
  assert.deepEqual(line, {
    text: "Today's date is 2026-07/10.",
    apostropheHex: '27',
    separatorHex: '2d 2f',
  });
});

test('shell-quotes managed environment values', () => {
  const lines = blockLines([
    {
      kind: 'advisory',
      title: 'test',
      commands: [],
      apply: { set: { EXAMPLE: "value with spaces and 'quotes'" } },
    },
  ]);
  assert.deepEqual(lines, ["export EXAMPLE='value with spaces and '\"'\"'quotes'\"'\"''"]);
});

test('follows documented authentication precedence', () => {
  assert.equal(resolvePrimaryKind('api-key', 'other', true, true, null, true), 'auth-token');
  assert.equal(resolvePrimaryKind('api-key', 'none', true, true, null, true), 'api-key');
  assert.equal(resolvePrimaryKind('none', 'none', true, true, null, true), 'api-key-helper');
  assert.equal(resolvePrimaryKind('api-key', 'other', true, true, 'bedrock', true), 'cloud-provider');
});

test('honors CLAUDE_CONFIG_DIR settings and credential location', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'claudedoctor-config-'));
  const previous = process.env.CLAUDE_CONFIG_DIR;
  try {
    await writeFile(join(dir, 'settings.json'), JSON.stringify({
      env: { ANTHROPIC_BASE_URL: 'https://relay.example.test' },
    }));
    await writeFile(join(dir, '.credentials.json'), '{}');
    process.env.CLAUDE_CONFIG_DIR = dir;
    const snapshot = collect();
    assert.equal(snapshot.baseUrl.value, 'https://relay.example.test');
    assert.equal(snapshot.baseUrl.source, 'settings-json');
    assert.equal(snapshot.credential.subscriptionPresent, true);
  } finally {
    if (previous == null) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test('never exposes credentials embedded in gateway or proxy URLs', () => {
  const keys = ['ANTHROPIC_BASE_URL', 'HTTP_PROXY', 'HTTPS_PROXY'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.ANTHROPIC_BASE_URL = 'https://gateway-user:gateway-secret@relay.example.test/v1?token=hidden#fragment';
    process.env.HTTP_PROXY = 'http://proxy-user:proxy-secret@127.0.0.1:7890/private?key=hidden';
    process.env.HTTPS_PROXY = 'https://proxy-user:proxy-secret@proxy.example.test:8443/private';

    const snapshot = collect();
    assert.equal(snapshot.baseUrl.value, 'https://relay.example.test');
    assert.equal(snapshot.proxy.http, 'http://127.0.0.1:7890');
    assert.equal(snapshot.proxy.https, 'https://proxy.example.test:8443');

    const output = JSON.stringify(snapshot);
    for (const secret of ['gateway-user', 'gateway-secret', 'proxy-user', 'proxy-secret', 'token=', 'key=']) {
      assert.equal(output.includes(secret), false, `snapshot leaked ${secret}`);
    }
  } finally {
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('parses structured Clash YAML and follows the actual rule target', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'claudedoctor-clash-'));
  const configPath = join(dir, 'custom config.yaml');
  try {
    await writeFile(configPath, [
      'mode: rule',
      'mixed-port: 7890',
      'ipv6: true',
      'dns: { enable: true, enhanced-mode: fake-ip, respect-rules: true }',
      'tun: { enable: true, stack: mixed, auto-route: true }',
      'proxy-groups:',
      '  - name: AI Route',
      '    type: select',
      '    proxies: [Singapore-1, Auto Select]',
      'rules:',
      '  - DOMAIN-SUFFIX,anthropic.com,AI Route',
      '  - MATCH,Default',
      '',
    ].join('\n'));
    const result = detectClashConfig(`123 /usr/local/bin/mihomo -d /tmp -f "${configPath}"`);
    assert.equal(result?.configPath, configPath);
    assert.equal(result?.hasClaudeRules, true);
    assert.equal(result?.hasClaudeCodeGroup, true);
    assert.equal(result?.claudeRuleTarget, 'AI Route');
    assert.deepEqual(result?.aiGroupMembers, ['Singapore-1', 'Auto Select']);
    assert.equal(result?.finalMatchTarget, 'Default');
    assert.equal(result?.dnsEnhancedMode, 'fake-ip');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('labels address families from the returned IP instead of the requested curl mode', () => {
  assert.equal(actualFamily('203.0.113.7', 'ipv6'), 'ipv4');
  assert.equal(actualFamily('2001:db8::7', 'ipv4'), 'ipv6');

  const path = (family) => ({
    family,
    provider: 'test',
    egressIp: '203.0.113.7',
    countryCode: 'SG',
    countryName: 'Singapore',
    isSupportedRegion: true,
    asnType: 'residential',
    asnOrg: 'Example ISP',
    isProxy: false,
    isTor: false,
    isHosting: false,
    isMobile: false,
    threatLevel: 'low',
    riskScore: null,
  });

  const result = aggregateFamilyResults(path('ipv4'), path('ipv4'));
  assert.equal(result?.selectedFamily, 'ipv4');
  assert.equal(result?.families?.ipv4?.egressIp, '203.0.113.7');
  assert.equal(result?.families?.ipv6, null);
});
