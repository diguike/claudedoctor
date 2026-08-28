# Threat Model and Product Boundaries

## Assets we protect

- Claude OAuth tokens, API keys, gateway tokens, and credential files
- Shell profiles modified by `claudedoctor fix`
- Local identity and telemetry metadata
- Public IP and network-profile data requested by opt-in CLI checks or the automatic browser check
- Trust in the diagnostic result itself

## Trust boundaries

The Core package receives only a sanitized `DoctorInput`; raw credential values must never cross into Core, JSON output, logs, or Web code. The CLI reads local configuration and may contact the disclosed IP-intelligence provider only with `--net`. The Web check automatically contacts ipify and ipapi.is, which necessarily observe the visitor's public IP.

Third-party IP intelligence is untrusted input. It can be unavailable, stale, incorrect, or maliciously formatted, so the Web UI escapes it and reports failed observation as `UNKNOWN`.

## In scope

- Credential precedence and accidental overrides
- Subscription credentials routed to a non-first-party endpoint
- Recognized Claude Code distribution paths and unknown active shims
- Official supported-region policy
- Access/reputation signals such as datacenter, VPN, proxy, Tor, and abuse labels, clearly separated from ban claims
- Local proxy and route hygiene
- Reversible, user-selected shell-profile fixes

## Out of scope

- Predicting a private enforcement score or a probability of suspension
- Proving a binary is authentic through path/version inspection alone
- Inspecting account-wide sessions with private APIs
- Recovering or appealing an account
- Spoofing device identity, TLS, headers, telemetry, geography, timing, or usage patterns
- Account pools, ban evasion, credential resale, or safeguard bypass

## Failure posture

Missing data is not healthy data. A requested but failed network probe is `WARN`; a failed browser check is `UNKNOWN`. `confirmed` describes the evidence behind a rule, not certainty that a particular account will be restricted.
