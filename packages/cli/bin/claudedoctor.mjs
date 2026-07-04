#!/usr/bin/env node
/**
 * claudedoctor / cdoc — launcher. Loads the compiled CLI from ../dist.
 * Run `pnpm -F @claudedoctor/cli build` first (or `pnpm -r build`).
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'dist', 'cli.js');

if (!existsSync(entry)) {
  console.error('🩺  Claude Doctor 尚未构建。请先运行:\n    pnpm -F @claudedoctor/cli build');
  process.exit(70);
}

const { main } = await import(entry);
process.exit(await main(process.argv.slice(2)));
