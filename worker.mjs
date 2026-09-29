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
    return new Response(req.method === 'HEAD' ? null : asset.content, { headers: { ...headers, 'Content-Type': asset.type, 'Cache-Control': 'no-cache' } });
  },
};
