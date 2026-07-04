/**
 * Byte-level re-check of the `Today's date is …` line (M0 forensics, on demand).
 * Spins up a throwaway local proxy, points Claude Code at it, and hexes the
 * apostrophe + date separators of the genuinely generated line.
 *
 * Privacy: the proxy does NOT forward the request and never logs Authorization
 * headers. It captures the outbound body locally, then returns an error so
 * Claude Code exits fast.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import zlib from 'node:zlib';

export interface DateLineResult {
  text: string;
  apostropheHex: string;
  separatorHex: string;
}

function hexOf(s: string): string {
  return Buffer.from(s, 'utf8').toString('hex');
}

function decompress(raw: Buffer, enc: string): Buffer {
  try {
    if (enc.includes('gzip')) return zlib.gunzipSync(raw);
    if (enc.includes('br')) return zlib.brotliDecompressSync(raw);
    if (enc.includes('deflate')) return zlib.inflateSync(raw);
  } catch {
    /* fall through */
  }
  return raw;
}

/** Pull the genuine "Today's date is YYYY-MM-DD." (requires the digits to avoid
 *  matching injected project context that also contains the phrase). */
function extractDateLine(body: string): DateLineResult | null {
  const m = body.match(/Today(.{1,3}?)s date is (\d{4})(.)\d{2}(.)\d{2}\./);
  if (!m) return null;
  const apostrophe = m[1] ?? "'";
  const sep1 = m[3] ?? '-';
  return {
    text: m[0],
    apostropheHex: hexOf(apostrophe),
    separatorHex: hexOf(sep1),
  };
}

export function verifyDateLine(timeoutMs = 20000): Promise<DateLineResult | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: DateLineResult | null) => {
      if (done) return;
      done = true;
      try {
        child?.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      server.close();
      clearTimeout(timer);
      resolve(r);
    };

    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = decompress(Buffer.concat(chunks), String(req.headers['content-encoding'] ?? ''));
        const found = extractDateLine(body.toString('utf8'));
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end('{"type":"error","error":{"type":"invalid_request_error","message":"claudedoctor-verify-stop"}}');
        if (found) finish(found);
      });
      req.on('error', () => res.destroy());
    });

    let child: ReturnType<typeof spawn> | undefined;
    server.on('error', () => finish(null));
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      child = spawn('claude', ['-p', 'ping'], {
        env: { ...process.env, ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}` },
        stdio: 'ignore',
      });
      child.on('error', () => finish(null));
      child.on('exit', () => setTimeout(() => finish(null), 500));
    });

    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}
