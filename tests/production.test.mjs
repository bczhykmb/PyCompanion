import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createProductionServer } from '../deploy/server.mjs';
import { openLocalDatabase } from '../lib/local-db.mjs';
import { hash } from '../lib/api.mjs';

test('Linux entry supports HTTPS proxy login, trusted client IP and streamed cached assets', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pycompanion-server-'));
  const DB = openLocalDatabase();
  const env = { PUBLIC_ORIGIN: 'https://classroom.example', TRUST_PROXY: 'loopback', ADMIN_PASSWORD: 'FixturePassword123', MODEL_MODE: 'demo' };
  await fs.mkdir(path.join(root, 'python-runtime/v314.0.7'), { recursive: true });
  await fs.writeFile(path.join(root, 'index.html'), '<h1>Classroom</h1>');
  await fs.writeFile(path.join(root, 'python-runtime/v314.0.7/pyodide.asm.wasm'), Buffer.from([0,97,115,109]));
  const server = createProductionServer({ env, DB, assetRoot: root });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(base + '/api/classroom/login', { method: 'POST', headers: { origin: env.PUBLIC_ORIGIN, 'content-type': 'application/json', 'x-real-ip': '198.51.100.11', 'cf-connecting-ip': 'spoofed' }, body: JSON.stringify({ kind: 'admin', password: env.ADMIN_PASSWORD }) });
    assert.equal(login.status, 200); assert.match(login.headers.get('set-cookie'), /Secure/);
    assert.ok(await DB.prepare('SELECT key FROM limits WHERE key LIKE ?').bind(`login:admin:${await hash('198.51.100.11')}:%`).first());
    const wrong = await fetch(base + '/api/classroom/login', { method: 'POST', headers: { origin: 'https://wrong.example', 'content-type': 'application/json' }, body: '{}' });
    assert.equal(wrong.status, 403);
    assert.match(await (await fetch(base + '/manage')).text(), /Classroom/);
    const asset = await fetch(base + '/python-runtime/v314.0.7/pyodide.asm.wasm');
    assert.equal(asset.headers.get('content-type'), 'application/wasm');
    assert.match(asset.headers.get('cache-control'), /immutable/);
    assert.equal((await asset.arrayBuffer()).byteLength, 4);
    const cached = await fetch(base + '/python-runtime/v314.0.7/pyodide.asm.wasm', { headers: { 'if-none-match': asset.headers.get('etag') } });
    assert.equal(cached.status, 304);
    assert.equal((await fetch(base + '/%2e%2e%2f.env.local')).status, 404);
    assert.equal((await fetch(base + '/.env.local')).status, 404);
    const directServer = createProductionServer({ env: { ...env, TRUST_PROXY: '' }, DB, assetRoot: root });
    directServer.listen(0, '127.0.0.1'); await once(directServer, 'listening');
    try {
      await fetch(`http://127.0.0.1:${directServer.address().port}/api/classroom/login`, { method: 'POST', headers: { origin: env.PUBLIC_ORIGIN, 'content-type': 'application/json', 'x-real-ip': 'spoofed', 'cf-connecting-ip': 'spoofed' }, body: JSON.stringify({ kind: 'admin', password: env.ADMIN_PASSWORD }) });
      assert.ok(await DB.prepare('SELECT key FROM limits WHERE key LIKE ?').bind(`login:admin:${await hash('127.0.0.1')}:%`).first());
    } finally { directServer.closeAllConnections(); await new Promise(resolve => directServer.close(resolve)); }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); DB.close(); await fs.rm(root, { recursive: true, force: true }); }
});
