import { handleApi } from './lib/api.mjs';

const headers = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
};
export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname;
    if (path.startsWith('/api/classroom/')) return handleApi(req, env);
    if (!['GET', 'HEAD'].includes(req.method)) return new Response('Method not allowed', { status: 405 });
    const asset = ASSET_MAP[path === '/' || path === '/manage' ? '/index.html' : path];
    if (!asset) return new Response('Not found', { status: 404, headers });
    const content = req.method === 'HEAD' ? null : asset.encoding === 'base64' ? Uint8Array.from(atob(asset.content), c => c.charCodeAt(0)) : asset.content;
    const assetHeaders = { ...headers, 'Content-Type': asset.type, 'Cache-Control': asset.encoding === 'base64' ? 'public, max-age=3600' : 'no-store' };
    // Student code may fetch runtime files, but not authenticated classroom APIs.
    if (path === '/python-worker.mjs') {
      const runtime = new URL('/python-runtime/v314.0.7/', req.url).href;
      assetHeaders['Content-Security-Policy'] = `default-src 'none'; script-src ${runtime} 'wasm-unsafe-eval'; connect-src ${runtime}; worker-src 'none'`;
    }
    return new Response(content, { headers: assetHeaders });
  },
};
