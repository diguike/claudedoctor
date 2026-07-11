import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPPORTED_REGION_CODES } from '@claudedoctor/core';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ROOT, 'public');
const OUTPUT = join(ROOT, 'dist');

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });
await cp(SOURCE, OUTPUT, { recursive: true });

const regionModule =
  '// Generated from @claudedoctor/core. Do not edit.\n' +
  `export const SUPPORTED_REGION_CODES = ${JSON.stringify([...SUPPORTED_REGION_CODES].sort())};\n`;
await writeFile(join(OUTPUT, 'region-data.js'), regionModule);

const html = await readFile(join(OUTPUT, 'index.html'), 'utf8');
if (!html.startsWith('<!doctype html>')) throw new Error('index.html must start with a doctype');
if (!html.includes("from './region-data.js'")) throw new Error('index.html must import generated region data');

process.stdout.write(`Built ${OUTPUT}\n`);
