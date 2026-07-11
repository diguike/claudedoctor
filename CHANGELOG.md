# Changelog

All notable changes are documented here. The project follows semantic versioning for the published CLI.

## Unreleased

### Added

- Regression tests for credential precedence, region policy, health summaries, date-line verification, CLI flags, and shell quoting
- Production Web build with Core-generated region data and a confined preview server
- Community health files, CI, and npm package-content auditing

### Changed

- Model current Claude Code authentication precedence, including cloud providers, `apiKeyHelper`, and the official `CLAUDE_CODE_OAUTH_TOKEN` flow
- Recognize active native, Homebrew, WinGet, and npm Claude Code installations without claiming cryptographic integrity verification
- Replace the partial unsupported-region deny-list with the official supported-region allow-list
- Replace the browser's pseudo-precise 0-100 score with explainable `CLEAR`, `ATTENTION`, `UNSUPPORTED`, and `UNKNOWN` states
- Treat every warning as attention in summaries and exit codes, including path and access hygiene warnings

### Fixed

- Reject unknown CLI flags instead of silently ignoring them
- Return consistent warning exit codes for JSON and verify modes
- Never substitute sample IP data when the live browser check fails
- Avoid false dual-stack divergence caused only by IPv4 and IPv6 having different addresses
- Check both date separators during byte-level verification
- Escape third-party IP intelligence before rendering it in the Web UI
- Prevent preview-server path traversal and add baseline browser security headers
- Include the MIT license in the npm tarball
- Redact credentials, paths, and query parameters embedded in gateway or proxy URLs
- Label IPv4/IPv6 results from the returned address instead of the requested curl mode
- Execute the production bundle during package auditing to catch ESM/runtime failures
