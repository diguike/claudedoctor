# Instructions for coding agents

`CLAUDE.md` in this directory is the authoritative project guide for every agent
(Claude Code, Codex, Cursor, and others) and for human contributors. Read it in
full before changing anything.

Rules that are most often broken by accident:

1. **Brand is "Claude Doctor", English only.** Do not add a Chinese brand name
   (the old "克劳德医生" was removed on purpose) to the site, READMEs, or OG image.
2. **The website's visual design is locked.** `packages/web` follows `CLAUDE.md`
   §8: the maintainer's own house style (white paper, ink black, orange
   `#FF6A2B` as the only accent, heavy sans headings, real artifacts on a grey
   "desk"). No emoji, no score gauge, no gradients, no cream-and-serif or
   neon-green palettes. Do not restyle it unless the maintainer asks for a
   redesign. `packages/web/test/design.test.mjs` enforces the hard rules; if it
   fails, fix the page, not the test.
3. **User-facing text is for users.** Never put internal product discussion,
   disclaimers, or hedging agreed between the maintainer and an agent into the
   page or the CLI output. Keep copy short; prefer cards and interaction to
   paragraphs.
4. **Recommendation links live only in `packages/core`.** Do not hardcode,
   alter, or remove the referral link (`ISP_PROXY_REFERRAL`), and never show it
   when the egress region is unsupported.
5. **No fake precision.** No 0–100 scores, no ban probabilities, no sample data
   in place of a failed network check (show `UNKNOWN`).

Run `pnpm validate` before handing work back.
