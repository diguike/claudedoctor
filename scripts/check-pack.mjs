import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: new URL('../packages/cli/', import.meta.url),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
if (result.status !== 0) process.exit(result.status ?? 1);

const [pack] = JSON.parse(result.stdout);
const paths = new Set(pack.files.map((file) => file.path));
for (const required of ['LICENSE', 'README.md', 'bin/claudedoctor.mjs', 'dist/cli.js', 'package.json']) {
  assert(paths.has(required), `npm package is missing ${required}`);
}
assert(![...paths].some((path) => path.startsWith('src/')), 'npm package must not include TypeScript sources');
assert(pack.unpackedSize < 300_000, `npm package unexpectedly large: ${pack.unpackedSize} bytes`);

const [rootLicense, packageLicense] = await Promise.all([
  readFile(new URL('../LICENSE', import.meta.url), 'utf8'),
  readFile(new URL('../packages/cli/LICENSE', import.meta.url), 'utf8'),
]);
assert.equal(packageLicense, rootLicense, 'root and npm package LICENSE files must match');

const runtime = spawnSync(process.execPath, ['bin/claudedoctor.mjs', '--version'], {
  cwd: new URL('../packages/cli/', import.meta.url),
  encoding: 'utf8',
});
assert.equal(runtime.status, 0, `packed CLI failed to start:\n${runtime.stderr}`);
assert.match(runtime.stdout.trim(), /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/, 'CLI must print a semantic version');

process.stdout.write(`Package audit passed: ${pack.entryCount} files, ${pack.unpackedSize} bytes unpacked\n`);
