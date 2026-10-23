import http from 'node:http';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { handleApi } from '../lib/api.mjs';
import { openLocalDatabase } from '../lib/local-db.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.zip': 'application/zip', '.json': 'application/json' };
const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);

export function createProductionServer({ env, DB, assetRoot = path.resolve('dist/linux/public') }) {
  const origin = new URL(env.PUBLIC_ORIGIN);
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('PUBLIC_ORIGIN must be a website origin');
  const root = path.resolve(assetRoot);
  const security = {
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
  };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, origin);
      if (url.origin !== origin.origin) { res.writeHead(400); res.end('Invalid origin'); return; }
      if (url.pathname.startsWith('/api/classroom/')) {
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        // Only the loopback reverse proxy may supply the client address. Never trust browser CF headers.
        const forwarded = env.TRUST_PROXY === 'loopback' && loopback(req.socket.remoteAddress) ? req.headers['x-real-ip'] : undefined;
        headers.set('cf-connecting-ip', typeof forwarded === 'string' ? forwarded : req.socket.remoteAddress || 'unknown');
        headers.set('host', origin.host);
        const init = { method: req.method, headers };
        if (!['GET', 'HEAD'].includes(req.method)) { init.body = Readable.toWeb(req); init.duplex = 'half'; }
        const result = await handleApi(new Request(url, init), { ...env, DB });
        res.writeHead(result.status, { ...security, ...Object.fromEntries(result.headers) });
        res.end(Buffer.from(await result.arrayBuffer()));
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end('Method not allowed'); return; }
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end('Invalid path'); return; }
      if (pathname.includes('\\') || pathname.includes('\0')) { res.writeHead(400); res.end('Invalid path'); return; }
      const filename = path.resolve(root, '.' + (['/', '/manage'].includes(pathname) ? '/index.html' : pathname));
      if (!filename.startsWith(root + path.sep)) { res.writeHead(404); res.end('Not found'); return; }
      let stat;
      try { stat = await fs.stat(filename); } catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) { res.writeHead(404); res.end('Not found'); return; } throw error; }
      if (!stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
      const cache = pathname.startsWith('/python-runtime/v314.0.7/') ? 'public, max-age=31536000, immutable' : /\.(png|svg)$/.test(pathname) ? 'public, max-age=3600' : 'no-cache';
      const etag = `"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
      const responseHeaders = { ...security, 'Cache-Control': cache, ETag: etag, 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' };
      if (pathname === '/python-worker.mjs') responseHeaders['Content-Security-Policy'] = `default-src 'none'; script-src ${origin.origin}/python-runtime/v314.0.7/ 'wasm-unsafe-eval'; connect-src ${origin.origin}/python-runtime/v314.0.7/; worker-src 'none'`;
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, responseHeaders); res.end(); return; }
      res.writeHead(200, { ...responseHeaders, 'Content-Length': stat.size });
      if (req.method === 'HEAD') res.end();
      else await pipeline(createReadStream(filename), res);
    } catch (error) {
      if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.error('production_request_failed', error.name);
      if (!res.headersSent) res.writeHead(500, { 'Cache-Control': 'no-store' });
      res.end('Service unavailable');
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return server;
}

async function main() {
  const env = process.env;
  if (!env.PUBLIC_ORIGIN || !env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 9) throw new Error('Configure PUBLIC_ORIGIN and ADMIN_PASSWORD (at least 9 characters)');
  if (!['demo', 'live'].includes(env.MODEL_MODE)) throw new Error('Set MODEL_MODE explicitly to demo or live');
  if (env.MODEL_MODE === 'live' && !env.MODEL_API_KEY) throw new Error('Live mode requires MODEL_API_KEY');
  if (env.TRUST_PROXY && env.TRUST_PROXY !== 'loopback') throw new Error('Only TRUST_PROXY=loopback is supported');
  const dataDir = path.resolve(env.DATA_DIR || 'data');
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  const DB = openLocalDatabase(path.join(dataDir, 'classroom.sqlite'));
  const server = createProductionServer({ env, DB });
  server.listen(Number(env.PORT || 4191), env.HOST || '127.0.0.1', () => console.log(`PyCompanion listening on ${env.HOST || '127.0.0.1'}:${env.PORT || 4191}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    const deadline = setTimeout(() => { server.closeAllConnections(); DB.close(); process.exit(1); }, 70000);
    deadline.unref();
    server.close(() => { clearTimeout(deadline); DB.close(); });
  });
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
