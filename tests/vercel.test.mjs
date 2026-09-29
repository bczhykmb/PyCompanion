import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createVercelHandler } from '../lib/vercel-api.mjs';
import { migrateRemote, wrapRemoteClient } from '../lib/remote-db.mjs';
import handler from '../api/classroom.mjs';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

async function testClient() {
  await fs.mkdir('data', { recursive: true });
  // libSQL opens separate connections for transactions; file-backed fixtures share state.
  return createClient({ url: pathToFileURL(path.resolve(`data/vercel-test-${crypto.randomUUID()}.sqlite`)).href });
}

test('Vercel entry imports without local environment files or database credentials', async () => {
  assert.equal(typeof handler.fetch, 'function');
  const request = new Request('https://example.com/api/classroom?route=health');
  const response = await createVercelHandler({ env: {} })(request);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).configurationRequired, true);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('libSQL migrations are repeatable and failed batches roll back', async () => {
  const client = await testClient();
  try {
    await migrateRemote(client); await migrateRemote(client);
    const db = wrapRemoteClient(client);
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM students').first()).count, 0);
    await assert.rejects(db.batch([
      db.prepare('INSERT INTO limits VALUES (?, ?, ?)').bind('duplicate', 1, 100),
      db.prepare('INSERT INTO limits VALUES (?, ?, ?)').bind('duplicate', 2, 100),
    ]));
    assert.equal(await db.prepare('SELECT * FROM limits WHERE key=?').bind('duplicate').first(), null);
  } finally { client.close(); }
});

test('Vercel routes use persistent adapter for teacher, student, chat and a new handler instance', async () => {
  const client = await testClient();
  await migrateRemote(client);
  let connections = 0;
  const options = {
    env: { ADMIN_PASSWORD: 'test-admin-password-only', TURSO_DATABASE_URL: 'libsql://test.turso.io', TURSO_AUTH_TOKEN: 'test-token-only', MODEL_MODE: 'demo' },
    openDatabase: async () => { connections++; return wrapRemoteClient(client); },
  };
  let handle = createVercelHandler(options);
  async function call(path, data, cookie) {
    const response = await handle(new Request(`https://example.com/api/classroom?route=${path}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Origin: 'https://example.com', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: data === undefined ? undefined : JSON.stringify(data),
    }));
    return { status: response.status, json: await response.json(), cookie: response.headers.get('set-cookie') };
  }
  try {
    assert.equal((await call('health')).status, 200);
    const admin = await call('login', { kind: 'admin', password: options.env.ADMIN_PASSWORD });
    assert.match(admin.cookie, /Secure/);
    const students = await call('admin/students', { group: 'D', count: 1 }, admin.cookie);
    assert.equal(students.status, 201);
    const login = await call('login', { code: students.json.students[0].code });
    const reply = await call('chat', { question: '变量', code: 'print(1)', task: 'variables', requestId: 'vercel-request-001' }, login.cookie);
    assert.equal(reply.json.turn.status, 'completed');
    assert.equal(connections, 1);
    handle = createVercelHandler(options);
    const me = await call('me', undefined, login.cookie);
    assert.equal(me.json.turns.length, 1); assert.equal(me.json.student.group, 'D');
    assert.equal(connections, 2);
  } finally { client.close(); }
});

test('database connection failures are redacted and retried without temporary fallback', async () => {
  let attempts = 0;
  const handle = createVercelHandler({ env: { ADMIN_PASSWORD: 'long-test-password', TURSO_DATABASE_URL: 'libsql://test.turso.io', TURSO_AUTH_TOKEN: 'secret-test' }, openDatabase: async () => { attempts++; throw new Error('secret-test connection failed'); } });
  for (let i = 0; i < 2; i++) {
    const response = await handle(new Request('https://example.com/api/classroom/health'));
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /secret-test/);
  }
  assert.equal(attempts, 2);
  const blocked = await handle(new Request('https://example.com/api/classroom/login', { method: 'POST', headers: { Origin: 'https://evil.example' } }));
  assert.equal(blocked.status, 403); assert.equal(attempts, 2);
});
