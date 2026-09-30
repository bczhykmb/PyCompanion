import { GROUPS, TASKS, PROMPT_VERSION, makePrompt, demoAnswer } from './experiment.mjs';

const enc = new TextEncoder();
const NOW = () => Date.now();
export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
export async function hash(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value)))).map(b => b.toString(16).padStart(2, '0')).join(''); }
function token() { return Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join(''); }
function json(data, status = 200, headers = {}) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } }); }
function fail(status, message) { throw new ApiError(status, message); }
function stmt(db, sql, ...params) { return db.prepare(sql).bind(...params); }
async function row(db, sql, ...params) { return stmt(db, sql, ...params).first(); }
async function rows(db, sql, ...params) { return (await stmt(db, sql, ...params).all()).results; }
async function body(req) {
  if (!req.headers.get('content-type')?.includes('application/json')) fail(415, '请使用 JSON 请求。');
  const reader = req.body?.getReader(); if (!reader) fail(400, '请求为空。');
  const parts = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 50000) { await reader.cancel(); fail(413, '内容过长。'); } parts.push(value); }
  const merged = new Uint8Array(size); let offset = 0; for (const part of parts) { merged.set(part, offset); offset += part.length; }
  try { const parsed = JSON.parse(new TextDecoder().decode(merged)); if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') fail(400, '请求格式错误。'); return parsed; }
  catch { fail(400, '请求格式错误。'); }
}
function text(value, max) { if (typeof value !== 'string' || value.length > max) fail(400, '内容格式或长度不符合要求。'); return value.trim(); }
function cookie(req, value, age = 3600 * 8) { return `edulab_classroom=${value}; Path=/api/classroom; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`; }
async function session(req, db, role) {
  const raw = req.headers.get('cookie')?.match(/(?:^|;\s*)edulab_classroom=([a-f0-9]{48})(?:;|$)/)?.[1];
  const found = raw && await row(db, 'SELECT * FROM sessions WHERE token_hash = ? AND expires > ?', await hash(raw), NOW());
  if (!found || (role && found.role !== role)) fail(401, role === 'admin' ? '请先登录教师管理。' : '请先输入个人学习码。');
  return found;
}
async function rate(db, key, maximum, period) {
  const window = Math.floor(NOW() / period), k = `${key}:${window}`;
  const value = await row(db, `INSERT INTO limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`, k, NOW() + period);
  if (value.count > maximum) fail(429, '操作太频繁，请稍后再试。');
}
async function studentSession(req, db) {
  const s = await session(req, db, 'student');
  const student = await row(db, 'SELECT * FROM students WHERE id = ?', s.student);
  if (!student) fail(401, '学习码已失效，请联系教师。');
  return { ...student, config: JSON.parse(student.config) };
}
function publicStudent(student) { return { id: student.id, group: student.group_id, name: GROUPS[student.group_id].name, mode: student.config.mode, promptVersion: student.config.version }; }
async function modelAnswer(env, student, question, code, task) {
  const config = student.config;
  if (config.mode === 'demo') return demoAnswer(student.group_id, question, code, task);
  if (!env.MODEL_API_KEY) fail(503, '模型接口尚未配置，请联系教师。本次不会改用演示回复。');
  const history = await rows(env.DB, "SELECT question,code,answer FROM turns WHERE student = ? AND status = 'completed' ORDER BY created DESC LIMIT 8", student.id);
  const messages = [{ role: 'system', content: config.prompt }];
  for (const t of history.reverse()) messages.push({ role: 'user', content: t.question + (t.code ? `\n\nPython代码：\n${t.code}` : '') }, { role: 'assistant', content: t.answer });
  const lesson = TASKS.find(t => t.id === task);
  messages.push({ role: 'user', content: `当前任务：${lesson?.title || '自主练习'}\n任务要求：${lesson?.text || ''}\n\n学生问题：${question}${code ? `\n\nPython代码：\n${code}` : ''}` });
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', signal: AbortSignal.timeout(45000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.MODEL_API_KEY}` },
      body: JSON.stringify({ model: config.model, messages, temperature: 0.4, max_tokens: 1200, stream: false }),
    });
    if (!response.ok) fail(502, '模型服务暂不可用，请稍后重试或联系教师。');
    const data = await response.json();
    const result = data.choices?.[0]?.message?.content;
    if (typeof result !== 'string' || !result.trim()) fail(502, '模型没有返回有效内容，请重试。');
    return result.slice(0, 16000);
  } catch (error) { if (error instanceof ApiError) throw error; fail(502, '模型请求超时或网络不可达，请稍后重试。'); }
}

export async function handleApi(req, env) {
  try {
    const url = new URL(req.url), path = url.pathname.replace('/api/classroom', '');
    if (!['GET', 'POST'].includes(req.method)) fail(405, '不支持该操作。');
    if (req.method === 'POST' && req.headers.get('origin') !== url.origin) fail(403, '请求来源不匹配，请重新打开网站。');
    if (path === '/health' && req.method === 'GET') {
      if (!env.DB) fail(503, '记录服务尚未就绪。');
      await row(env.DB, 'SELECT COUNT(*) AS count FROM students');
      return json({ ok: true, mode: env.MODEL_MODE === 'live' ? 'live' : 'demo', modelConfigured: !!env.MODEL_API_KEY, adminConfigured: !!env.ADMIN_PASSWORD });
    }
    const db = env.DB; if (!db) fail(503, '记录服务尚未就绪，请联系教师。');
    if (path === '/login' && req.method === 'POST') {
      const input = await body(req);
      const client = req.headers.get('cf-connecting-ip') || 'local';
      const isAdmin = input.kind === 'admin'; let id = null;
      await rate(db, `login:${isAdmin ? 'admin' : 'student'}:${await hash(client)}`, isAdmin ? 10 : 300, 600000);
      if (isAdmin) {
        if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 16) fail(503, '教师密码尚未安全配置。');
        if (await hash(text(input.password, 200)) !== await hash(env.ADMIN_PASSWORD)) fail(401, '教师密码不正确。');
      } else {
        const code = text(input.code, 80).toUpperCase().replace(/\s/g, '');
        const found = await row(db, 'SELECT id FROM students WHERE code_hash = ?', await hash(code));
        if (!found) fail(401, '学习码不正确，请核对教师发给你的个人学习码。');
        id = found.id;
      }
      const value = token();
      await db.batch([
        stmt(db, 'DELETE FROM sessions WHERE expires < ?', NOW()), stmt(db, 'DELETE FROM limits WHERE expires < ?', NOW()),
        stmt(db, 'INSERT INTO sessions (token_hash,student,role,expires) VALUES (?,?,?,?)', await hash(value), id, isAdmin ? 'admin' : 'student', NOW() + 8 * 3600000),
      ]);
      return json({ ok: true }, 200, { 'Set-Cookie': cookie(req, value) });
    }
    if (path === '/logout' && req.method === 'POST') {
      const s = await session(req, db);
      await stmt(db, 'DELETE FROM sessions WHERE token_hash = ?', s.token_hash).run();
      return json({ ok: true }, 200, { 'Set-Cookie': cookie(req, '', 0) });
    }
    if (path.startsWith('/admin')) {
      await session(req, db, 'admin');
      if (path === '/admin/students' && req.method === 'GET') return json({ students: await rows(db, `SELECT s.id,s.group_id,s.created,json_extract(s.config,'$.mode') AS mode,COUNT(t.id) AS turns,MAX(t.created) AS lastActive FROM students s LEFT JOIN turns t ON s.id=t.student GROUP BY s.id ORDER BY s.created DESC`) });
      if (path === '/admin/students' && req.method === 'POST') {
        const input = await body(req), group = text(input.group, 1), count = Number(input.count);
        if (!GROUPS[group] || !Number.isInteger(count) || count < 1 || count > 80) fail(400, '请选择组别和1—80人的数量。');
        const total = await row(db, 'SELECT COUNT(*) AS count FROM students');
        if (total.count + count > 500) fail(400, '当前轻量版最多保存500个学习编号。');
        const mode = env.MODEL_MODE === 'live' ? 'live' : 'demo';
        if (mode === 'live' && !env.MODEL_API_KEY) fail(503, '真实模式需要先配置模型接口。');
        const config = JSON.stringify({ mode, version: PROMPT_VERSION, model: env.MODEL_NAME || 'deepseek-chat', baseUrl: env.MODEL_BASE_URL || 'https://api.deepseek.com', prompt: makePrompt(group) });
        const generated = [], statements = [];
        for (let i = 0; i < count; i++) {
          const id = `S${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
          const code = token().slice(0, 16).toUpperCase().match(/.{4}/g).join('-');
          statements.push(stmt(db, 'INSERT INTO students (id,code_hash,group_id,config,created) VALUES (?,?,?,?,?)', id, await hash(code), group, config, NOW()));
          generated.push({ id, group, code, mode });
        }
        await db.batch(statements); return json({ students: generated }, 201);
      }
      if (path === '/admin/export' && req.method === 'GET') {
        const students = await rows(db, 'SELECT id,group_id,config,created FROM students ORDER BY created');
        const turns = await rows(db, 'SELECT * FROM turns ORDER BY created,id');
        return json({ version: 1, exportedAt: new Date().toISOString(), notice: 'demo为规则演示，不是正式大模型实验数据。', students: students.map(s => ({ ...s, config: JSON.parse(s.config) })), turns }, 200, { 'Content-Disposition': 'attachment; filename="pycompanion-records.json"' });
      }
      fail(404, '操作不存在。');
    }
    const student = await studentSession(req, db);
    if (path === '/me' && req.method === 'GET') {
      await stmt(db, "UPDATE turns SET status='failed',error='请求中断，请重新发送。',completed=? WHERE student=? AND status='pending' AND created<?", NOW(), student.id, NOW() - 90000).run();
      return json({ student: publicStudent(student), turns: await rows(db, 'SELECT id,request_id,question,code,task,answer,status,error,mode,created,completed FROM turns WHERE student=? ORDER BY created,id', student.id) });
    }
    if (path === '/chat' && req.method === 'POST') {
      const input = await body(req);
      const question = text(input.question, 4000), code = text(input.code || '', 12000), task = text(input.task || 'free', 40), requestId = text(input.requestId, 80);
      if ((!question && !code) || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId) || !TASKS.some(t => t.id === task)) fail(400, '请填写问题或代码，并选择有效任务。');
      const old = await row(db, 'SELECT * FROM turns WHERE student=? AND request_id=?', student.id, requestId);
      if (old) {
        if (old.question !== question || old.code !== code || old.task !== task) fail(409, '重复请求内容不一致。');
        return json({ turn: old }, old.status === 'pending' ? 202 : 200);
      }
      await rate(db, `chat:${student.id}`, 6, 60000);
      await rate(db, `daily:${student.id}`, 120, 86400000);
      const pending = await row(db, "SELECT id FROM turns WHERE student=? AND status='pending'", student.id);
      if (pending) fail(409, '上一条问题正在处理，请等待回复。');
      const id = crypto.randomUUID();
      try { await stmt(db, "INSERT INTO turns(id,student,request_id,question,code,task,status,mode,created) VALUES (?,?,?,?,?,?,'pending',?,?)", id, student.id, requestId, question, code, task, student.config.mode, NOW()).run(); }
      catch { fail(409, '问题已经发送，请刷新查看回复。'); }
      try {
        const answer = await modelAnswer(env, student, question, code, task);
        await stmt(db, "UPDATE turns SET answer=?,status='completed',completed=? WHERE id=?", answer, NOW(), id).run();
      } catch (error) {
        const message = error instanceof ApiError ? error.message : '回复保存失败，请稍后刷新查看。';
        await stmt(db, "UPDATE turns SET status='failed',error=?,completed=? WHERE id=?", message, NOW(), id).run();
      }
      return json({ turn: await row(db, 'SELECT * FROM turns WHERE id=?', id) });
    }
    fail(404, '操作不存在。');
  } catch (error) {
    if (!(error instanceof ApiError)) console.error('classroom_request_failed', error.name);
    return json({ error: error instanceof ApiError ? error.message : '服务暂时不可用，输入内容已保留，请稍后重试。' }, error instanceof ApiError ? error.status : 503);
  }
}
