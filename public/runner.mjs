export function mountRunner({ container, getCode, getTask, icon, iconify }) {
  const drafts = new Map(), results = new Map();
  let worker, timer, active = false;
  const panel = document.createElement('section');
  panel.className = 'runner';
  panel.setAttribute('aria-label', 'Python 运行区');
  panel.innerHTML = `<div class="run-toolbar"><div class="run-buttons"><button id="run-python" class="primary" title="运行 Python">${icon('play')}运行</button><button id="stop-python" class="icon" title="停止运行" aria-label="停止运行" disabled>${icon('square')}</button></div><span id="run-status" role="status">尚未运行</span><button id="clear-output" class="icon" title="清空输出" aria-label="清空输出">${icon('trash-2')}</button></div><details class="stdin-panel"><summary>程序输入 · input()</summary><label for="python-stdin">输入数据（每次 input() 一行）</label><textarea id="python-stdin" rows="3" maxlength="8000" placeholder="12&#10;2.5" spellcheck="false"></textarea></details><pre id="python-output" tabindex="0" aria-label="运行输出"></pre>`;
  container.before(panel);
  const find = id => panel.querySelector('#' + id);
  const run = find('run-python'), stop = find('stop-python'), stdin = find('python-stdin'), output = find('python-output'), status = find('run-status');
  const end = () => {
    clearTimeout(timer); worker?.terminate(); worker = null; active = false;
    run.disabled = false; stop.disabled = true; stdin.disabled = false;
  };
  const paint = () => {
    const result = results.get(getTask());
    output.textContent = result?.output || '';
    output.classList.toggle('run-error', Boolean(result && !result.ok && result.finished));
    status.textContent = result ? result.code !== getCode() || result.stdin !== stdin.value ? '代码或输入已修改，待重新运行' : result.status : '尚未运行';
    output.scrollTop = output.scrollHeight;
  };
  const halt = (message = '已停止') => {
    if (!active) return;
    const result = results.get(getTask());
    result.status = message; result.finished = true; result.ok = false;
    end(); paint();
  };
  run.onclick = () => {
    if (active) return;
    const code = getCode();
    if (!code.trim()) { status.textContent = '请先编写代码'; return; }
    const task = getTask();
    const result = { code, stdin: stdin.value, status: '正在加载 Python…', output: '', finished: false, ok: false };
    results.set(task, result); drafts.set(task, stdin.value);
    active = true; run.disabled = true; stop.disabled = false; stdin.disabled = true; paint();
    const fail = text => { result.output += text; result.status = '加载失败，可重试'; result.finished = true; end(); paint(); };
    try {
      worker = new Worker('/python-worker.mjs?v=2', { type: 'module', name: 'classroom-python' });
      timer = setTimeout(() => fail('Python 环境加载超时，请检查网络后重试。'), 90000);
      worker.onerror = event => { event.preventDefault(); fail('Python 运行线程发生错误，请重试；若持续失败，请联系教师检查浏览器控制台和本站运行组件。'); };
      worker.onmessage = ({ data }) => {
        if (!active) return;
        if (data.type === 'running') {
          clearTimeout(timer); result.status = '正在运行…'; paint();
          timer = setTimeout(() => halt('运行超过 10 秒，已停止'), 10000);
        } else if (data.type === 'output') {
          result.output = (result.output + String(data.text)).slice(0, 16200); paint();
        } else if (data.type === 'load-error') fail(data.text);
        else if (data.type === 'done') {
          result.ok = data.ok === true; result.finished = true;
          if (data.error) result.output += '\n' + String(data.error).slice(0, 6500);
          result.status = result.ok ? '运行完成' : '运行出错';
          if (!result.output) result.output = '（无输出）';
          end(); paint();
        }
      };
      worker.postMessage({ code, stdin: stdin.value });
    } catch { fail('无法创建 Python 运行环境，请检查浏览器设置。'); }
  };
  stop.onclick = () => halt();
  find('clear-output').onclick = () => { halt(); results.delete(getTask()); paint(); };
  stdin.oninput = () => { drafts.set(getTask(), stdin.value); paint(); };
  iconify();
  return {
    beforeTaskChange() { halt(); drafts.set(getTask(), stdin.value); },
    showTask() { stdin.value = drafts.get(getTask()) || ''; paint(); },
    codeChanged: paint,
    isRunning: () => active,
    questionContext() {
      const r = results.get(getTask());
      if (!r?.finished || r.code !== getCode() || r.stdin !== stdin.value) return '\n当前代码尚无匹配的运行结果。';
      return `\n学生浏览器运行状态：${r.status}\n程序输入：\n${r.stdin.slice(0,500) || '（无）'}\n输出或报错（最多1800字符）：\n${r.output.slice(-1800)}`;
    },
    dispose() { end(); drafts.clear(); results.clear(); },
  };
}
