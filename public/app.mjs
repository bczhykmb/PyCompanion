import { createIcons, BookOpen, MessageSquare, Code2, Download, LogOut, Send, Copy, RefreshCw, Users, ShieldCheck, Plus, FileCode2, Play, Square, Trash2, PanelLeftClose, PanelLeftOpen, CircleCheck, GraduationCap, Save, RotateCcw } from 'lucide';
import { TASKS, GROUPS } from '../lib/experiment.mjs';
import { CLASS_GROUPS, validateRoster } from '../lib/roster.mjs';
import { mountRunner } from './runner.mjs';
import { unitTurns, unitTranscript } from './unit-records.mjs';
import { mountPromptEditor } from './prompt-editor.mjs';
const icons = { BookOpen, MessageSquare, Code2, Download, LogOut, Send, Copy, RefreshCw, Users, ShieldCheck, Plus, FileCode2, Play, Square, Trash2, PanelLeftClose, PanelLeftOpen, CircleCheck, GraduationCap, Save, RotateCcw };
const root = document.querySelector('#app');
const adminPage = location.pathname === '/manage';
const state = { student: null, turns: [], health: {}, task: 'free', busy: false, mobileTab: 'chat', codes: {}, drafts: {}, generated: [], roster: [] };
let toastTimer, polling, runner;
const $ = (id) => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ico = (name) => `<i data-lucide="${name}"></i>`;
function iconify() { createIcons({ icons, attrs: { 'aria-hidden': 'true' } }); }
function toast(message) { $('notice').textContent = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('notice').textContent = '', 4500); }
function error(message) { const el = $('form-error'); if (el) el.textContent = message; else toast(message); }
async function api(path, data) {
  let response;
  try { response = await fetch(`/api/classroom${path}`, { method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(60000) }); }
  catch { throw new Error('网络连接失败，输入已保留，请检查网络后重试。'); }
  const result = await response.json().catch(() => ({ error: '服务响应异常，请稍后重试。' }));
  if (!response.ok) { const e = new Error(result.error); e.status = response.status; throw e; }
  return result;
}
function download(name, content, type = 'application/json') { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function date(time) { return new Date(time).toLocaleString('zh-CN', { hour12: false }); }
function banner(mode = state.health.mode) { return mode !== 'live' ? '<div class="banner"><strong>演示模式</strong> · 当前使用规则回复，未连接大模型，不用于正式实验。</div>' : '<div class="banner">AI 回复可能有误，请结合课程内容核查。不要提交姓名、学号或其他个人信息。</div>'; }
function header(actions = '') { return `<header class="topbar"><a class="brand" href="/"><img src="/favicon.svg" alt="PyCompanion"><strong>PyCompanion</strong><span>Python 学习实验室</span></a><div class="top-actions">${actions}</div></header>`; }
function entry(message = '') {
  runner?.dispose(); runner = null;
  clearInterval(polling); state.student = null;
  root.innerHTML = `<div class="login-page">${header(adminPage ? '<a class="teacher-link" href="/">学生入口</a>' : '<a class="teacher-link" href="/manage">教师管理</a>')}${banner()}<main class="entry"><img class="logo" src="/favicon.svg" alt=""><h1>${adminPage ? '教师管理' : '进入学习实验室'}</h1><p class="muted">${adminPage ? '请输入教师管理密码。' : '请输入自己的完整学号。'}</p><form id="login"><label for="credential">${adminPage ? '管理密码' : '学号'}</label><input id="credential" name="credential" type="${adminPage ? 'password' : 'text'}" autocomplete="${adminPage ? 'current-password' : 'off'}" maxlength="${adminPage ? 200 : 80}" placeholder="${adminPage ? '教师管理密码' : '完整学号'}" required ${adminPage ? '' : 'spellcheck="false"'}><p class="error" id="form-error">${esc(message)}</p><button class="primary" id="login-button" type="submit">${ico(adminPage ? 'shield-check' : 'book-open')}${adminPage ? '登录管理' : '进入学习'}</button></form><p class="consent muted">${adminPage ? '学生名单仅限教师管理，请妥善保管。' : '学号用于匹配个人学习记录；请勿在对话和代码中填写姓名、学号或其他个人信息。演示体验不替代正式研究的知情同意。'}</p><div class="foot muted">${adminPage ? 'PyCompanion · 四组教学实验' : 'Python 基础 · 学习与编程练习'}</div></main></div>`;
  iconify();
  $('login').onsubmit = async e => { e.preventDefault(); const button = $('login-button'); button.disabled = true; error(''); try { await api('/login', adminPage ? { kind: 'admin', password: $('credential').value } : { code: $('credential').value }); await load(); } catch (e) { error(e.message); } finally { if (button.isConnected) button.disabled = false; } };
}
async function logout() {
  if (state.busy) return toast('请等待当前回复完成。');
  try { await api('/logout', {}); clearInterval(polling); state.codes = {}; state.drafts = {}; state.turns = []; state.student = null; entry(); } catch (e) { error(e.message); }
}
function currentCode() { return $('code')?.value ?? state.codes[state.task] ?? TASKS.find(t => t.id === state.task).code; }
function answerContent(turn) {
  const answer = String(turn.answer ?? '');
  const completed = turn.mode === 'live' && turn.task !== 'free' && /^【基础任务完成】\r?\n本单元基础任务已完成。(?:\r?\n|$)/.test(answer);
  if (!completed) return esc(answer);
  const body = answer.replace(/^【基础任务完成】\r?\n本单元基础任务已完成。\s*/, '');
  return `<div class="completion-signal" role="status">${ico('circle-check')}<span>本单元基础任务已完成</span></div><div class="completion-source">智能体根据已提交材料核对</div>${esc(body)}`;
}
function paintMessages() {
  const view = $('messages'); if (!view) return;
  const nearBottom = view.scrollHeight - view.scrollTop - view.clientHeight < 90;
  const turns = unitTurns(state.turns, state.task);
  const task = TASKS.find(t => t.id === state.task);
  if ($('export-unit')) {
    $('export-unit').disabled = !turns.length;
    $('export-unit').title = `导出${task.title}对话记录`;
    $('export-unit').setAttribute('aria-label', $('export-unit').title);
  }
  view.innerHTML = turns.length ? turns.map(t => `<article class="turn">
    <div class="message-row student-message">
      <span class="message-avatar student-avatar" role="img" aria-label="学生头像">${ico('graduation-cap')}</span>
      <div class="message-content"><div class="message-label"><span>我 · ${esc(TASKS.find(x => x.id === t.task)?.title || '自主练习')}</span><time>${esc(date(t.created))}</time></div>
      <div class="question"><div class="message-body">${esc(t.question || '请查看我的代码。')}</div>${t.code ? `<details><summary>已提交的 Python 代码</summary><pre>${esc(t.code)}</pre></details>` : ''}</div></div>
    </div>
    <div class="message-row agent-message">
      <img class="message-avatar" src="${(GROUPS[t.group_snapshot] || GROUPS[state.student.group]).image}" alt="${esc((GROUPS[t.group_snapshot] || GROUPS[state.student.group]).name)}头像" width="32" height="32">
      <div class="message-content"><div class="message-label"><span>${esc((GROUPS[t.group_snapshot] || GROUPS[state.student.group]).name)}</span><span>${t.mode === 'demo' ? '演示回复' : 'AI 回复'}</span></div>
      <div class="answer message-body">${t.status === 'pending' ? '<span class="pending">正在回复，记录已保存…</span>' : t.status === 'failed' ? `<span class="error">${esc(t.error || '本次回复失败，请重新发送。')}</span>` : answerContent(t)}</div></div>
    </div>
  </article>`).join('') : `<div class="welcome"><strong>${esc(state.student.name)}</strong><p>你可以提出 Python 学习问题，也可以附上正在编写的代码。</p></div>`;
  iconify();
  if (nearBottom || state.busy) view.scrollTop = view.scrollHeight;
}
function paintEditor() {
  const task = TASKS.find(t => t.id === state.task);
  $('task-title').textContent = task.title; $('task-description').textContent = task.text;
  $('code').value = state.codes[state.task] ?? task.code; updateLines();
  runner?.showTask();
  document.querySelectorAll('[data-task]').forEach(el => { el.classList.toggle('active', el.dataset.task === state.task); el.setAttribute('aria-current', el.dataset.task === state.task ? 'true' : 'false'); });
}
function updateLines() { $('lines').textContent = Array.from({ length: $('code').value.split('\n').length }, (_, i) => i + 1).join('\n'); $('line-count').textContent = `${$('code').value.split('\n').length} 行`; }
function studentView() {
  const s = state.student;
  root.innerHTML = `${header(`<span class="student-id record-code">${esc(s.id)}</span><button class="icon" id="export-own" title="下载我的记录" aria-label="下载我的记录">${ico('download')}</button><button class="icon" id="logout" title="退出学习" aria-label="退出学习">${ico('log-out')}</button>`)}${banner(s.mode)}<div class="work"><aside class="sidebar"><div><h2>学习任务</h2><nav class="task-list" aria-label="学习任务">${TASKS.map(t => `<button data-task="${t.id}">${ico('file-code-2')}<span>${t.title}</span></button>`).join('')}</nav></div><div class="student-meta">学习编号<strong>${esc(s.id)}</strong><p>Python 基础<br>任务示例 · 待教学定稿</p></div></aside><nav class="mobile-tabs" aria-label="工作区"><button id="show-chat" class="active">${ico('message-square')}学习对话</button><button id="show-code">${ico('code-2')}编程练习</button></nav><main class="panels" id="panels" data-tab="chat"><section class="coding"><div class="section-head"><h2>编程练习</h2><button class="icon" id="download-code" title="下载 Python 文件" aria-label="下载 Python 文件">${ico('download')}</button></div><div class="task-body"><h3 id="task-title"></h3><p id="task-description"></p></div><div class="editor"><div class="filebar">${ico('file-code-2')}<span>practice.py</span><span class="language">Python</span></div><div class="code-wrap"><div class="line-numbers" id="lines" aria-hidden="true"></div><textarea id="code" aria-label="Python 代码" spellcheck="false" maxlength="12000" wrap="off"></textarea></div><div class="editor-status"><span>Python · UTF-8</span><span id="line-count"></span></div></div><div class="editor-controls"><small>代码未执行；提交后由助手查看。</small><button id="ask-code">${ico('message-square')}询问代码</button></div></section><section class="chat"><div class="section-head"><div class="agent"><span class="avatar">${ico('message-square')}</span><div><strong>${esc(s.name)}</strong><small>${s.mode === 'demo' ? '演示模式' : '学习支持'}</small></div></div><button class="icon" id="refresh" title="刷新记录" aria-label="刷新记录">${ico('refresh-cw')}</button></div><div class="messages" id="messages" aria-live="polite" aria-relevant="additions"></div><form class="composer" id="chat-form"><label class="sr-only" for="question">学习问题</label><textarea id="question" maxlength="4000" placeholder="写下你的问题…" aria-label="学习问题"></textarea><div class="compose-actions"><label class="check"><input type="checkbox" id="attach">附上当前代码</label><button class="primary" type="submit" id="send">${ico('send')}发送</button></div><div id="save-state" class="saved">已加载服务器记录</div><p class="error" id="form-error"></p></form></section></main></div>`;
  document.querySelector('.student-meta p').textContent = 'Python 基础 · 8个学习单元';
  const sidebar = document.querySelector('.sidebar');
  const sidebarHeading = sidebar.querySelector('h2');
  const sidebarHead = document.createElement('div');
  sidebarHead.className = 'sidebar-head';
  sidebarHeading.before(sidebarHead);
  sidebarHead.append(sidebarHeading);
  const sidebarToggle = document.createElement('button');
  sidebarToggle.type = 'button';
  sidebarToggle.id = 'sidebar-toggle';
  sidebarToggle.className = 'icon';
  sidebarToggle.setAttribute('aria-controls', 'learning-task-list');
  sidebar.querySelector('.task-list').id = 'learning-task-list';
  sidebarHead.append(sidebarToggle);
  let sidebarCollapsed = false;
  try { sidebarCollapsed = sessionStorage.getItem('pycompanion-sidebar-collapsed') === 'true'; } catch {}
  const paintSidebar = () => {
    document.querySelector('.work').classList.toggle('sidebar-collapsed', sidebarCollapsed);
    sidebarToggle.innerHTML = ico(sidebarCollapsed ? 'panel-left-open' : 'panel-left-close');
    sidebarToggle.title = sidebarCollapsed ? '展开学习任务' : '收起学习任务';
    sidebarToggle.setAttribute('aria-label', sidebarToggle.title);
    sidebarToggle.setAttribute('aria-expanded', String(!sidebarCollapsed));
    iconify();
  };
  sidebarToggle.onclick = () => {
    sidebarCollapsed = !sidebarCollapsed;
    try { sessionStorage.setItem('pycompanion-sidebar-collapsed', String(sidebarCollapsed)); } catch {}
    paintSidebar();
  };
  paintSidebar();
  document.querySelector('.editor-controls small').textContent = 'Python · 浏览器运行';
  runner?.dispose();
  runner = mountRunner({ container: document.querySelector('.editor-controls'), getCode: currentCode, getTask: () => state.task, icon: ico, iconify });
  const character = GROUPS[s.group];
  const portrait = document.createElement('div');
  portrait.className = 'character-panel';
  portrait.innerHTML = `<img src="${character.image}" alt="${esc(character.name)}形象照片" width="160" height="160"><div><strong>${esc(character.name)}</strong></div>`;
  $('messages').before(portrait);
  document.querySelector('.agent .avatar').innerHTML = `<img src="${character.image}" alt="" width="36" height="36">`;
  const chatTools = document.createElement('div');
  chatTools.className = 'chat-tools';
  $('refresh').before(chatTools);
  chatTools.append($('refresh'));
  chatTools.insertAdjacentHTML('beforeend', `<button class="icon" id="export-unit" type="button" title="导出当前单元对话记录" aria-label="导出当前单元对话记录">${ico('download')}</button>`);
  iconify(); paintEditor(); paintMessages();
  $('logout').onclick = logout;
  $('export-own').onclick = () => download(`pycompanion-${s.id}.json`, JSON.stringify({ student: s, turns: state.turns, exportedAt: new Date().toISOString() }, null, 2));
  $('download-code').onclick = () => download('practice.py', currentCode(), 'text/x-python;charset=utf-8');
  $('refresh').onclick = async () => { try { await refresh(); toast('记录已刷新'); } catch (e) { error(e.message); } };
  $('export-unit').onclick = async () => {
    const task = TASKS.find(t => t.id === state.task);
    const button = $('export-unit'); button.disabled = true;
    try {
      const data = await api('/me');
      if (state.student?.id !== s.id) return;
      state.turns = data.turns; paintMessages();
      download(`pycompanion-${s.id}-${task.id}-对话记录.md`, unitTranscript({ student: s, task, turns: data.turns }), 'text/markdown;charset=utf-8');
    } catch (e) { error(e.message); }
    finally { if (button.isConnected) button.disabled = !unitTurns(state.turns, state.task).length; }
  };
  $('code').oninput = () => { state.codes[state.task] = currentCode(); updateLines(); runner.codeChanged(); };
  $('code').onscroll = () => { $('lines').scrollTop = $('code').scrollTop; };
  $('code').onkeydown = e => { if (e.key === 'Tab') { e.preventDefault(); const el = e.target; el.setRangeText('    ', el.selectionStart, el.selectionEnd, 'end'); el.dispatchEvent(new Event('input')); } };
  document.querySelectorAll('[data-task]').forEach(el => el.onclick = () => {
    if (state.busy) return toast('请等待当前回复完成后切换任务。');
    runner.beforeTaskChange(); state.codes[state.task] = currentCode();
    state.drafts[state.task] = { question: $('question').value, attach: $('attach').checked };
    state.task = el.dataset.task;
    $('question').value = state.drafts[state.task]?.question || '';
    $('attach').checked = state.drafts[state.task]?.attach || false;
    $('save-state').textContent = '已加载当前单元记录'; error('');
    paintEditor(); paintMessages(); $('messages').scrollTop = $('messages').scrollHeight;
  });
  const tab = name => { state.mobileTab = name; $('panels').dataset.tab = name; $('show-chat').classList.toggle('active', name === 'chat'); $('show-code').classList.toggle('active', name === 'code'); };
  $('show-chat').onclick = () => tab('chat'); $('show-code').onclick = () => tab('code');
  $('ask-code').onclick = () => {
    if (state.busy) return toast('请等待当前回复完成。');
    if (runner.isRunning()) return toast('请等待运行完成或先停止运行。');
    $('attach').checked = true;
    if (!$('question').value.trim()) $('question').value = '请结合当前任务、代码和运行结果，帮我定位问题，并提示下一步。';
    tab('chat'); $('chat-form').requestSubmit();
  };
  $('chat-form').onsubmit = async e => {
    e.preventDefault(); if (state.busy) return;
    let question = $('question').value.trim();
    const code = $('attach').checked ? currentCode() : '';
    if (!question && !code.trim()) return error('请先填写问题，或附上当前代码。');
    if (code) {
      const context = runner.questionContext();
      if (question.length + context.length > 4000) return error('问题加运行结果超过长度限制，请缩短问题后发送。');
      question += context;
    }
    const requestId = crypto.randomUUID(); state.busy = true; $('send').disabled = true; error(''); $('save-state').textContent = '正在提交…';
    try {
      const result = await api('/chat', { question, code, task: state.task, requestId });
      await refresh();
      if (result.turn.status === 'completed') { $('question').value = ''; $('save-state').textContent = `已保存 · ${date(result.turn.completed)}`; }
      else error(result.turn.error || '回复处理中，请稍后刷新。');
    } catch (e) { error(e.message); $('save-state').textContent = '请检查记录后重试，输入已保留'; }
    finally { state.busy = false; if ($('send')) $('send').disabled = false; }
  };
  clearInterval(polling); polling = setInterval(() => { if (!document.hidden && !state.busy) refresh().catch(() => {}); }, 15000);
}
async function refresh() { const data = await api('/me'); state.student = data.student; state.turns = data.turns; paintMessages(); }
function csvField(s) { const value = String(s ?? ''); return '"' + (/^[=+@\-\t\r]/.test(value) ? "'" : '') + value.replace(/"/g, '""') + '"'; }
function exportCodes() { download('pycompanion-learning-codes.csv', '\uFEFF' + [['研究编号','组别','个人学习码','模式'], ...state.generated.map(s => [s.id,s.group,s.code,s.mode])].map(r => r.map(csvField).join(',')).join('\r\n'), 'text/csv;charset=utf-8'); }
function mountRosterImport() {
  const generatedNotice = document.querySelector('.generated p');
  if (generatedNotice) generatedNotice.textContent = '备用学习码可在教师名单中查看，请勿公开发布或混用。';
  document.querySelector('.manage-head .muted').textContent = '按班级固定组别 · 编号关联记录';
  const form = $('create');
  const advanced = document.createElement('details');
  advanced.className = 'legacy-codes';
  advanced.innerHTML = '<summary>备用学习码</summary>';
  form.before(advanced);
  advanced.append(form);
  advanced.insertAdjacentHTML('beforebegin', `<form id="import-roster" class="roster-import"><h2>学号名单</h2><div class="class-groups">${Object.entries(CLASS_GROUPS).map(([name, group]) => `<span class="badge">${esc(name)} · ${group}组</span>`).join('')}</div><label for="roster-file">名单文件</label><input id="roster-file" type="file" accept=".json,application/json" required><p id="roster-preview" class="muted" role="status"></p><button id="import-button" class="primary" type="submit" disabled>${ico('plus')}导入学号名单</button></form>`);
  const table = document.querySelector('.manage > .table-wrap table');
  const imported = state.roster.filter(s => s.student_number);
  if (imported.length) {
    $('import-roster').insertAdjacentHTML('afterend', `<button id="clear-roster" type="button">${ico('trash-2')}清空已导入名单（${imported.length}人）</button>`);
    $('clear-roster').onclick = async () => {
      if (!confirm(`将清空${imported.length}个学号账号及其对话、代码和登录状态，备用学习码不受影响。系统会先下载全部记录备份。确认清空？`)) return;
      const button = $('clear-roster'); button.disabled = true; error('');
      try {
        const backup = await api('/admin/export');
        download(`pycompanion-before-roster-reset-${Date.now()}.json`, JSON.stringify(backup, null, 2));
        const result = await api('/admin/clear-roster', { confirmation: 'CLEAR_IMPORTED_ROSTER', expectedIds: imported.map(s => s.id) });
        state.roster = (await api('/admin/students')).students;
        adminView(); toast(`已清空${result.removed}个学号账号，备用学习码已保留`);
      } catch (e) { error(e.message); if (button.isConnected) button.disabled = false; }
    };
  }
  table.innerHTML = `<thead><tr><th>学号 / 备用学习码</th><th>班级</th><th>研究编号</th><th>实验条件</th><th>模式</th><th>提问次数</th><th>最近提问</th></tr></thead><tbody>${state.roster.map(s => `<tr><td class="record-code">${s.student_number ? esc(s.student_number) : s.spare_code ? `<strong>${esc(s.spare_code)}</strong>` : `<button type="button" data-reissue="${esc(s.id)}" title="更新登录码以显示；保留历史记录">生成可显示的备用码</button>`}</td><td>${esc(s.class_name || '—')}</td><td class="record-code">${esc(s.id)}</td><td>${esc(s.group_id)} · ${esc(GROUPS[s.group_id].role)} · ${esc(GROUPS[s.group_id].feedback)}</td><td>${s.mode === 'demo' ? '演示' : '真实模型'}</td><td>${s.turns}</td><td>${s.lastActive ? esc(date(s.lastActive)) : '尚未提问'}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">尚未导入学生名单。</td></tr>'}</tbody>`;
  table.querySelectorAll('[data-reissue]').forEach(button => button.onclick = async () => {
    if (!confirm('将更新此账号的备用学习码，旧码失效，历史记录保留。是否继续？')) return;
    button.disabled = true; error('');
    try {
      await api('/admin/spare-code', { id: button.dataset.reissue, action: 'reissue' });
      state.roster = (await api('/admin/students')).students; adminView(); toast('备用学习码已更新');
    } catch (e) { error(e.message); if (button.isConnected) button.disabled = false; }
  });
  let entries;
  $('roster-file').onchange = async () => {
    entries = undefined;
    $('import-button').disabled = true;
    error('');
    try {
      const file = $('roster-file').files[0];
      if (!file) { $('roster-preview').textContent = ''; return; }
      if (file.size > 50000) throw new Error('名单文件不能超过50KB。');
      const parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
      entries = validateRoster(Array.isArray(parsed) ? parsed : parsed.students);
      const counts = Object.fromEntries(Object.keys(GROUPS).map(g => [g, entries.filter(e => e.group === g).length]));
      $('roster-preview').textContent = `共${entries.length}人 · ${Object.entries(counts).map(([g, n]) => `${g}组${n}人`).join(' · ')}`;
      $('import-button').disabled = false;
    } catch (e) { error(e.message); $('roster-preview').textContent = ''; }
  };
  $('import-roster').onsubmit = async e => {
    e.preventDefault();
    if (!entries) return;
    const button = $('import-button'); button.disabled = true; error('');
    try {
      const result = await api('/admin/import', { students: entries.map(({ studentNumber, className }) => ({ studentNumber, className })) });
      state.roster = (await api('/admin/students')).students;
      adminView(); toast(`导入${result.imported}人，已有${result.skipped}人；${result.mode === 'live' ? '真实模型' : '演示'}模式`);
    } catch (err) { error(err.message); if (button.isConnected) button.disabled = false; }
  };
}
function adminView() {
  root.innerHTML = `${header(`<a class="teacher-link" href="/">学生入口</a><button class="icon" id="logout" title="退出管理" aria-label="退出管理">${ico('log-out')}</button>`)}${banner()}<main class="manage"><div class="manage-head"><div><h1>实验参与者 <span class="count">${state.roster.length} 人</span></h1><span class="muted">组别固定 · 匿名记录</span></div><div class="top-actions"><button id="copy-link">${ico('copy')}复制学生网址</button><button id="export-all">${ico('download')}导出全部记录</button></div></div><div class="status-line"><span class="badge">${state.health.mode === 'live' ? '真实模型模式' : '演示模式'}</span><span class="badge">服务器集中保存</span><span class="badge">四组教学实验</span></div><form id="create" class="create-form"><div class="field"><label for="group">指定组别</label><select id="group">${Object.entries(GROUPS).map(([id,g]) => `<option value="${id}">${id}组 · ${g.role} · ${g.feedback}</option>`).join('')}</select></div><div class="field"><label for="count">生成人数</label><input type="number" id="count" min="1" max="80" value="1" required></div><button type="submit" class="primary" id="create-button">${ico('plus')}生成个人学习码</button><small>分组方法由研究者确定，系统不会自动随机分组。</small></form><p id="form-error" class="error"></p>${state.generated.length ? `<section class="generated"><h2>新生成的学习码</h2><p>请先下载并保存。个人学习码只显示一次；不要公开发布或混用。</p><button id="download-codes">${ico('download')}下载学习码表</button><div class="table-wrap"><table><thead><tr><th>研究编号</th><th>组别</th><th>个人学习码</th></tr></thead><tbody>${state.generated.map(s => `<tr><td class="record-code">${esc(s.id)}</td><td>${s.group}</td><td class="record-code">${esc(s.code)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}<div class="table-wrap"><table><thead><tr><th>研究编号</th><th>实验条件</th><th>模式</th><th>提问次数</th><th>最近提问</th></tr></thead><tbody>${state.roster.map(s => `<tr><td class="record-code">${esc(s.id)}</td><td>${esc(s.group_id)} · ${esc(GROUPS[s.group_id].role)} · ${esc(GROUPS[s.group_id].feedback)}</td><td>${s.mode === 'demo' ? '演示' : '真实模型'}</td><td>${s.turns}</td><td>${s.lastActive ? esc(date(s.lastActive)) : '尚未提问'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">还没有参与者。先生成个人学习码。</td></tr>'}</tbody></table></div></main>`;
  mountRosterImport();
  mountPromptEditor({ before: $('import-roster'), api, icon: ico, iconify, toast });
  iconify(); $('logout').onclick = logout;
  $('copy-link').onclick = () => navigator.clipboard.writeText(location.origin + '/').then(() => toast('学生网址已复制')).catch(() => toast('当前浏览器不允许复制，请复制地址栏中的网站首页地址'));
  $('export-all').onclick = async () => { try { const data = await api('/admin/export'); download('pycompanion-records.json', JSON.stringify(data, null, 2)); } catch (e) { error(e.message); } };
  if ($('download-codes')) $('download-codes').onclick = exportCodes;
  $('create').onsubmit = async e => {
    e.preventDefault(); const button = $('create-button'); button.disabled = true; error('');
    if (state.generated.length && !confirm('请确认已保存上一批学习码。继续后将显示新一批学习码。')) { button.disabled = false; return; }
    try { const data = await api('/admin/students', { group: $('group').value, count: Number($('count').value) }); state.generated = data.students; state.roster = (await api('/admin/students')).students; adminView(); exportCodes(); toast('学习码已生成，并已开始下载'); }
    catch (e) { error(e.message); } finally { if (button.isConnected) button.disabled = false; }
  };
}
async function load() {
  try {
    if (adminPage) { state.roster = (await api('/admin/students')).students; adminView(); }
    else { const data = await api('/me'); state.student = data.student; state.turns = data.turns; studentView(); }
  } catch (e) { entry(e.status === 401 ? '' : e.message); }
}
window.addEventListener('beforeunload', e => { if (state.busy || $('question')?.value.trim() || (state.student && Object.keys(state.codes).length) || document.querySelector('[data-prompt-dirty="true"]')) { e.preventDefault(); e.returnValue = ''; } });
try { state.health = await api('/health'); await load(); } catch (e) { entry(e.message); }
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  try {
    Promise.resolve(document.modelContext.registerTool({
      name: 'read_learning_context', title: '查看当前学习状态',
      description: '读取已登录学生的当前任务、演示状态和已保存提问数量，不发送问题或更改组别。',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) { if (!input || typeof input !== 'object' || Object.keys(input).length) throw new Error('不接受参数'); if (!state.student) throw new Error('学生尚未登录'); return { task: state.task, mode: state.student.mode, savedTurns: state.turns.length }; },
    }, { signal: lifecycle.signal })).catch(() => {});
  } catch { /* Browsers without a complete WebMCP implementation keep the normal UI. */ }
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
