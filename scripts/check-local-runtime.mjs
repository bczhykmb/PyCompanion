import http from 'node:http';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import { chromium } from 'file:///C:/Users/Huo%20Hengyuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const server = http.createServer(async (req, res) => {
  const result = await worker.fetch(new Request(`http://${req.headers.host}${req.url}`), {});
  res.writeHead(result.status, Object.fromEntries(result.headers));
  res.end(Buffer.from(await result.arrayBuffer()));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const external = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== base) {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(base);
  async function run(code, stdin = '') {
    return page.evaluate(({ code, stdin }) => new Promise((resolve, reject) => {
      const w = new Worker('/python-worker.mjs?v=2', { type: 'module' });
      let output = '';
      const timer = setTimeout(() => { w.terminate(); reject(new Error('timeout')); }, 60000);
      const finish = value => { clearTimeout(timer); w.terminate(); resolve({ ...value, output }); };
      w.onerror = e => { clearTimeout(timer); w.terminate(); reject(new Error(e.message)); };
      w.onmessage = ({ data }) => {
        if (data.type === 'output') output += data.text;
        if (data.type === 'load-error') finish(data);
        if (data.type === 'done') finish(data);
      };
      w.postMessage({ code, stdin });
    }), { code, stdin });
  }
  let r = await run('count=int(input())\nmass=float(input())\nprint(count*mass)', '12\n2.5');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.output, /30.0/);
  r = await run('print(sum(range(6)))');
  assert.equal(r.output.trim(), '15');
  r = await run('print(1/0)');
  assert.match(r.error, /ZeroDivisionError/);
  r = await run('from js import fetch\nawait fetch("/api/classroom/me")');
  assert.equal(r.ok, false, 'Worker must not access authenticated APIs');
  assert.deepEqual(external, [], 'No external resource requests');
  console.log('PASS cold browser, blocked external network: input, arithmetic, loop, errors, API isolation');
  await context.close();
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
