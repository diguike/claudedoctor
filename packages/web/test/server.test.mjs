import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { after, before, test } from 'node:test';

const port = 44000 + (process.pid % 1000);
let server;

function call(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  server = spawn(process.execPath, ['serve.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('preview server did not start')), 5000);
    server.once('error', reject);
    server.once('exit', (code) => reject(new Error(`preview server exited early with ${code}`)));
    server.stdout.on('data', (chunk) => {
      if (chunk.toString().includes(`localhost:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
});

after(() => {
  server?.kill('SIGTERM');
});

test('serves the production page with baseline browser security headers', async () => {
  const response = await call('/', 'HEAD');
  assert.equal(response.status, 200);
  assert.equal(response.body.length, 0);
  assert.match(response.headers['content-security-policy'], /connect-src https:\/\/api\.ipify\.org/);
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
});

test('confines encoded paths to the Web build root', async () => {
  const response = await call('/%2e%2e%2fpackage.json');
  assert.equal(response.status, 404);
  assert.equal(response.body.toString(), '404');
});

test('allows only read-only HTTP methods', async () => {
  const response = await call('/', 'POST');
  assert.equal(response.status, 405);
  assert.equal(response.headers.allow, 'GET, HEAD');
});
