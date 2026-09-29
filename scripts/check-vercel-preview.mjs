import { chromium } from 'file:///C:/Users/Huo%20Hengyuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createVercelHandler } from '../lib/vercel-api.mjs';

const handler = createVercelHandler({ env: {} });
const config = JSON.parse(await fs.readFile('vercel.json', 'utf8'));
assert.equal(config.outputDirectory, 'dist/vercel');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/classroom/')) {
    const response = await handler(new Request(url));
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return;
  }
  const file = ['/', '/manage'].includes(url.pathname) ? '/index.html' : url.pathname;
  if (!['/index.html','/app.js','/app.css','/favicon.svg'].includes(file)) { res.writeHead(404); res.end(); return; }
  const type = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml' }[file.split('.').at(-1)];
  res.writeHead(200, { 'Content-Type': type + ';charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(await fs.readFile('dist/vercel' + file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  for (const route of ['/', '/manage']) {
    await page.goto(`http://127.0.0.1:${server.address().port}${route}`);
    await page.locator('#credential').waitFor();
    assert.match(await page.locator('#form-error').textContent(), /TURSO_DATABASE_URL/);
    assert.equal(await page.locator('h1').textContent(), route === '/' ? '进入学习实验室' : '教师管理');
  }
  await fs.mkdir('data', { recursive: true });
  await page.screenshot({ path: 'data/vercel-configuration-preview.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS Vercel static student/teacher entry with missing-config message, no page crash');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
