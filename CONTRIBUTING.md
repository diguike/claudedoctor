# Contributing to Claude Doctor

Thanks for helping improve Claude Doctor. This project treats diagnostic accuracy as a product feature: a new check is not complete until its evidence, limits, remediation, and regression tests are clear.

## Development setup

Requirements:

- Node.js 20 or newer
- pnpm 9 (the version declared in `package.json`)
- macOS or Linux for the full local-proxy probe suite; Windows contributions are welcome, but some shell-profile and route probes need platform-specific work

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm validate
pnpm dev:web
```

The Web UI is then available at `http://localhost:4321`. Run the CLI after a build:

```bash
node packages/cli/bin/claudedoctor.mjs check --why
```

## Before opening a pull request

1. Keep I/O in `packages/cli`; `packages/core` must remain pure and secret-free.
2. Add or update a test for every behavior change, especially false-positive and false-negative boundaries.
3. Cite primary sources for `confirmed` claims. Community reports must remain `reported`; inference must remain `speculative`.
4. State what the detector cannot observe. Do not turn absence of data into a healthy verdict.
5. Every actionable warning needs a safe remediation. Automatic fixes must be reversible and confined to the managed profile block.
6. For Web changes, check at least one desktop and one mobile viewport, both themes (`?theme=light` / `?theme=dark`), reduced motion, network failure, and long translated text.
7. Run `pnpm validate`; it includes type checks, tests, the production Web build, and npm package-content auditing.

## Proposing a detector

Include these fields in the issue or pull request:

- Signal and user harm being detected
- Observable input and why collecting it is safe
- Primary evidence and confidence level
- Expected false positives and false negatives
- Whether it affects account policy, access/reputation, or context only
- Remediation and re-verification method

Checks designed to spoof identity, reshape traffic to evade enforcement, rotate accounts, or bypass safeguards are out of scope. See [the threat model](docs/threat-model.md).

## Pull requests

Keep changes focused. Explain user-visible behavior, evidence changes, privacy impact, and verification performed. Screenshots are useful for visual changes, but they do not replace responsive and interaction checks.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
