import http from 'node:http';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { openLocalDatabase } from './lib/local-db.mjs';
import worker from './dist/server/index.js';

if (!fs.existsSync('.env.local')) fs.writeFileSync('.env.local', `ADMIN_PASSWORD=${randomBytes(24).toString('hex')}\nMODEL_MODE=demo\n`, { mode: 0o600 });
process.loadEnvFile('.env.local');
fs.mkdirSync('data', { recursive: true });
const db = openLocalDatabase('data/classroom.sqlite');
const env = { ...process.env, DB: db };
const server = http.createServer(async (req, res) => {
  try {
    const url = `http://${req.headers.host}${req.url}`;
    const init = { method: req.method, headers: req.headers };
    if (!['GET', 'HEAD'].includes(req.method)) { init.body = req; init.duplex = 'half'; }
    const result = await worker.fetch(new Request(url, init), env);
    res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(Buffer.from(await result.arrayBuffer()));
  } catch { res.writeHead(500); res.end('Service unavailable'); }
});
const port = Number(process.env.PORT || 4191);
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`EduLab: http://127.0.0.1:${port}\nTeacher password is in .env.local (not public).`));
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
