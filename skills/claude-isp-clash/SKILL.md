---
name: claude-isp-clash
description: Build, repair, and verify Clash Verge profiles that send Claude/Anthropic traffic through your own residential or static ISP nodes, including on restrictive office networks. Use for SOCKS5/SS/VLESS/Trojan ISP nodes, stable primary plus on-demand fallback, misleading Timeout indicators, repeated Claude Request failed errors, live egress verification, and combined profiles where Claude uses ISP while all other traffic uses an airport proxy group.
---

# Claude ISP Clash

## Operating principles

- Use the real ISP nodes, never renamed airport placeholders.
- Use `mode: rule`, system proxy, `ipv6: false`, and normally `dns.enable: false`.
- Default Claude to one fixed, verified ISP node. Do not make automatic fallback the default because changing egress IP can break an in-progress streaming response.
- Offer an on-demand fallback group containing only nodes that passed the real target health check.
- Use `https://api.anthropic.com/` as the health-check URL for both the selector and fallback group. Do not use Google or generic DoH endpoints as proof that Claude works.
- Route Claude first-party domains through ISP. Keep unrelated traffic on the user's requested default route.
- Preserve the source profile and generate a clearly named new YAML unless the user explicitly asks to overwrite it.
- Never print proxy servers, usernames, passwords, UUIDs, subscription URLs, tokens, or exact egress IPs in logs or reports.

## Workflow

1. Parse the existing or supplied YAML while redacting credentials.
2. Identify real ISP nodes, airport nodes, proxy groups, DNS mode, and the final `MATCH` rule.
3. Test each ISP candidate against `https://api.anthropic.com/` through the running Mihomo controller when available.
4. Remove failed ports and protocol variants from selectable and fallback groups. A failed definition may remain in `proxies` when preserving the source file, but it must not appear in active Claude groups.
5. Build the stable selector and on-demand fallback topology below.
6. Add current Claude first-party domains and explicit IP-verification domains.
7. Choose the final route from the user's intent:
   - Claude-only ISP profile: `MATCH,DIRECT`
   - Claude via ISP, everything else via airport: `MATCH,<airport-group>`
8. Validate YAML syntax, group references, rule targets, group defaults, and the final `MATCH`.
9. Run the Clash/Mihomo native configuration check when its binary is available.
10. After import, verify live routing with the controller, connection log, and egress comparison.

## Stable multi-node topology

Use a fixed primary by default and expose automatic fallback as an explicit option:

```yaml
proxy-groups:
  - name: Claude-ISP
    type: select
    proxies:
      - ISP-S-primary
      - Claude-Auto-Fallback
      - ISP-S-backup-1
      - ISP-S-backup-2
    url: "https://api.anthropic.com/"
    interval: 120
    lazy: true
    timeout: 6000

  - name: Claude-Auto-Fallback
    type: fallback
    proxies:
      - ISP-S-primary
      - ISP-S-backup-1
      - ISP-S-backup-2
    url: "https://api.anthropic.com/"
    interval: 120
    lazy: true
    timeout: 6000
```

The selector health check only updates displayed latency; it does not switch the selected node. The fallback group switches nodes only when the user selects that group. `lazy: true` means a group is checked only when it is in use, not that only its current node is checked.

For a single reliable ISP node, keep a simple `select` group without inventing fallback nodes.

## Claude routing rules

Use first-party suffix rules so current API, assets, CDN, file, and WebSocket hosts are covered:

```yaml
rules:
  - DOMAIN-SUFFIX,whatismyipaddress.com,Claude-ISP
  - DOMAIN-SUFFIX,ipinfo.io,Claude-ISP
  - DOMAIN-SUFFIX,ipapi.co,Claude-ISP
  - DOMAIN-SUFFIX,claude.ai,Claude-ISP
  - DOMAIN-SUFFIX,claude.com,Claude-ISP
  - DOMAIN-SUFFIX,claudeusercontent.com,Claude-ISP
  - DOMAIN-SUFFIX,anthropic.com,Claude-ISP
  - DOMAIN-SUFFIX,anthropic.services,Claude-ISP
  - MATCH,DIRECT
```

When everything else must use an airport, preserve the user's existing airport proxies and groups and change only the final rule:

```yaml
  - MATCH,Airport-Exit
```

Do not route shared domains such as all of `cloudflare.com`, `hcaptcha.com`, `sentry.io`, `segment.com`, or `launchdarkly.com` through ISP when the requirement is “Claude uses ISP, everything else uses airport.” Those broad rules capture unrelated sites. Add them only when the user explicitly wants all auxiliary services through ISP and accepts that side effect.

## Validation

Perform all applicable checks:

- Parse the generated YAML with Ruby or another local YAML parser.
- Assert every proxy-group member resolves to a real proxy or another group.
- Assert every rule target resolves to a real group.
- Assert the Claude selector defaults to the fixed primary, not fallback.
- Assert fallback contains only verified nodes.
- Assert `dns.enable` is false unless there is a proven reason to enable it.
- Assert the last rule matches the requested default route.
- For combined ISP and airport profiles, compare before and after and confirm airport proxy definitions and airport groups are unchanged.
- Run `verge-mihomo -t -f <profile>` or the equivalent native check.

## Live verification

After the user imports the profile:

1. Confirm the active profile name, Rule mode, system proxy, DNS state, selected Claude group, and selected node.
2. Compare a proxied IP-information request with a forced-direct request. Report only country, ASN/organization, and a short hash of the IP; do not expose exact IPs.
3. Inspect active connections and sidecar logs for hosts ending in:
   - `claude.ai`
   - `claude.com`
   - `claudeusercontent.com`
   - `anthropic.com`
   - `anthropic.services`
4. Count observed routes. A successful result has all observed Claude-domain connections using the ISP group and `direct_count: 0`.
5. Treat domain/rule/chain evidence as authoritative when process detection is disabled.
6. State the scope honestly as “all observed current Claude connections,” not an unverifiable guarantee about every future connection.

The Clash Verge home IP card may still show the local network's IP. Browser verification domains and controller connection chains are the correct evidence.

## Troubleshooting

- **Only fallback shows latency:** The selector lacks its own health-check URL and the UI is using a blocked default target. Add the same Anthropic health-check fields to the selector. This does not enable automatic switching.
- **Fallback shows `alive: false` while unused:** This can be expected with `lazy: true`; select it before judging its health.
- **Claude shows `Request failed`:** Inspect Claude logs for `ERR_NETWORK_CHANGED`, `ERR_INTERNET_DISCONNECTED`, `ECONNRESET`, or `ERR_CONNECTION_CLOSED`. Keep a fixed primary, avoid switching profiles or nodes during generation, and fully restart Claude after proxy changes.
- **A node shows `Timeout`:** Retest it against Anthropic. If the log shows `dial tcp <server>:<port>: i/o timeout`, configuration cannot repair the entrypoint. Ask the provider for another port or a 443/TLS/WebSocket-style entrypoint.
- **All routing is correct but errors continue:** Check the official Claude status page for a current upstream incident before changing the profile again.
