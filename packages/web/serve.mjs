#!/usr/bin/env node
/**
 * Dependency-free static preview server with path confinement and baseline
 * browser security headers. `pnpm dev` builds the site before starting it.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const PORT = Number(process.env.PORT || 4321);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' });
      res.end('405');
      return;
    }
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : `.${pathname}`;
    const path = resolve(ROOT, relative);
    if (path !== ROOT && !path.startsWith(ROOT + sep)) throw new Error('path outside web root');
    const body = await readFile(path);
    res.writeHead(200, {
      'content-type': TYPES[extname(path)] || 'application/octet-stream',
      'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src https://api.ipify.org https://api6.ipify.org https://api.ipapi.is; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'cross-origin-opener-policy': 'same-origin',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404');
  }
}).listen(PORT, () => console.log(`🩺  Claude Doctor web → http://localhost:${PORT}`));
