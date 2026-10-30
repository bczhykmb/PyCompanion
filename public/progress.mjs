export function mountProgress({ before, api, icon, iconify }) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const section = document.createElement('section');
  section.className = 'progress-section';
  section.innerHTML = `<div class="progress-heading"><h2>单元完成情况</h2><button class="icon" type="button" title="刷新完成情况" aria-label="刷新完成情况" id="progress-refresh">${icon('refresh-cw')}</button></div><div class="progress-filters"><label>班级<select id="progress-class"><option value="">全部班级</option></select></label><label>组别<select id="progress-group"><option value="">全部组别</option>${['A','B','C','D'].map(g => `<option>${g}</option>`).join('')}</select></label><label>单元<select id="progress-unit"><option value="">全部单元</option></select></label><label>完成状态<select id="progress-state"><option value="">全部状态</option><option value="basic-missing">必做未确认</option><option value="basic-done">必做已确认</option><option value="optional-done">选做已确认</option><option value="both">必做与选做均确认</option></select></label><label>学号或研究编号<input id="progress-search" type="search" autocomplete="off"></label><label class="check"><input id="progress-spares" type="checkbox">含备用测试账号</label></div><p class="muted progress-note">已确认：智能体根据材料核对，非正式评分。选做确认至少一项；未确认不等于未完成。仅统计当前组别的真实模型记录。</p><p class="error progress-error" role="alert"></p><div class="progress-summary" role="status"></div><div class="table-wrap progress-table" tabindex="0" aria-label="各学生每单元必做与选做完成情况"></div><dialog class="progress-dialog" aria-labelledby="progress-detail-title"><div class="progress-heading"><h2 id="progress-detail-title">单元核对记录</h2><button class="icon" type="button" title="关闭核对记录" aria-label="关闭核对记录">${icon('log-out')}</button></div><div class="progress-detail"></div></dialog>`;
  before.before(section);
  const find = selector => section.querySelector(selector);
  const dialog = find('dialog'), table = find('.progress-table');
  let data, loading = false, request = 0;
  const filters = ['class','group','unit','state','search','spares'];
  function render() {
    if (!data) return;
    const values = Object.fromEntries(filters.map(k => [k, k === 'spares' ? find('#progress-spares').checked : find(`#progress-${k}`).value]));
    const tasks = data.tasks.filter(t => !values.unit || t.id === values.unit);
    const students = data.students.filter(s => {
      if ((!values.spares && !s.student_number) || (values.class && s.class_name !== values.class) || (values.group && s.group_id !== values.group)) return false;
      if (values.search && !`${s.student_number || ''} ${s.id}`.toLowerCase().includes(values.search.trim().toLowerCase())) return false;
      return !values.state || s.units.filter(u => tasks.some(t => t.id === u.task)).some(u => values.state === 'basic-missing' ? !u.basic : values.state === 'basic-done' ? u.basic : values.state === 'optional-done' ? u.optional : u.basic && u.optional);
    });
    const units = students.flatMap(s => s.units.filter(u => tasks.some(t => t.id === u.task)));
    find('.progress-summary').textContent = `${students.length}人 · 必做已确认 ${units.filter(u => u.basic).length}/${units.length} · 选做已确认 ${units.filter(u => u.optional).length}/${units.length} · 更新于 ${new Date(data.updatedAt).toLocaleString('zh-CN')}`;
    table.innerHTML = `<table><thead><tr><th scope="col">学号 / 研究编号</th><th scope="col">班级 / 组别</th>${tasks.map(t => `<th scope="col" title="${esc(t.title)}">第${t.unit}单元</th>`).join('')}</tr></thead><tbody>${students.map(s => `<tr><th scope="row"><span class="record-code">${esc(s.student_number || s.id)}</span>${!s.student_number ? '<small>备用测试</small>' : ''}</th><td>${esc(s.class_name || '备用账号')}<br>${esc(s.group_id)}组${s.mode === 'demo' ? ' · 演示' : ''}</td>${tasks.map(t => {
      const u = s.units.find(u => u.task === t.id);
      return `<td><button class="progress-cell" type="button" data-student="${esc(s.id)}" data-unit="${esc(t.id)}" aria-label="查看${esc(s.student_number || s.id)}第${t.unit}单元核对记录">${['basic','optional'].map(k => `<span class="unit-status ${u[k] ? `confirmed ${k}` : ''}">${k === 'basic' ? '必做' : '选做'}：${u[k] ? '已确认' : u.turns ? '未确认' : '暂无记录'}</span>`).join('')}</button></td>`;
    }).join('')}</tr>`).join('') || `<tr><td colspan="${tasks.length + 2}" class="empty">暂无匹配学生</td></tr>`}</tbody></table>`;
  }
  async function load() {
    if (loading) return;
    loading = true; find('#progress-refresh').disabled = true; find('.progress-error').textContent = '';
    if (!data) find('.progress-summary').textContent = '正在读取完成情况…';
    try {
      data = await api('/admin/progress');
      for (const [key, entries] of [['class', [...new Set(data.students.map(s => s.class_name).filter(Boolean))].sort().map(c => [c, c])], ['unit', data.tasks.map(t => [t.id, t.title])]]) {
        const select = find(`#progress-${key}`), previous = select.value;
        select.innerHTML = `<option value="">全部${key === 'class' ? '班级' : '单元'}</option>${entries.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('')}`;
        select.value = previous;
      }
      render();
    } catch (e) { find('.progress-error').textContent = e.message; if (!data) find('.progress-summary').textContent = ''; }
    finally { loading = false; find('#progress-refresh').disabled = false; }
  }
  for (const key of filters) find(`#progress-${key}`).addEventListener(key === 'search' ? 'input' : 'change', render);
  find('#progress-refresh').onclick = load;
  dialog.querySelector('button').innerHTML = icon('x');
  dialog.querySelector('button').onclick = () => { request++; dialog.close(); };
  dialog.addEventListener('cancel', () => request++);
  table.onclick = async e => {
    const button = e.target.closest('[data-student]'); if (!button) return;
    const current = ++request, detail = find('.progress-detail');
    detail.textContent = '正在读取核对记录…'; dialog.showModal();
    try {
      const result = await api(`/admin/progress/detail?student=${encodeURIComponent(button.dataset.student)}&task=${encodeURIComponent(button.dataset.unit)}`);
      if (current !== request || !dialog.open || !section.isConnected) return;
      const task = data.tasks.find(t => t.id === button.dataset.unit);
      find('#progress-detail-title').textContent = `${result.student.student_number || result.student.id} · 第${task.unit}单元`;
      detail.innerHTML = `<p>${esc(task.title)}</p><div class="unit-progress">${['basic','optional'].map(k => `<span class="unit-status ${result.progress[k] ? `confirmed ${k}` : ''}">${k === 'basic' ? '必做' : '选做'}：${result.progress[k] ? '已确认 · ' + esc(new Date(result.progress[k].created).toLocaleString('zh-CN')) : '未确认'}</span>`).join('')}</div>${result.turns.map(t => {
        const confirmed = ['basic','optional'].filter(k => result.progress[k]?.id === t.id).map(k => k === 'basic' ? '必做确认' : '选做确认');
        return `<details ${confirmed.length ? 'open' : ''}><summary>${esc(new Date(t.created).toLocaleString('zh-CN'))} · ${confirmed.join(' / ') || (t.mode === 'demo' ? '演示记录' : t.group_snapshot && t.group_snapshot !== result.student.group_id ? '历史组别记录' : '对话记录')}</summary><h3>学生提问</h3><pre>${esc(t.question)}</pre>${t.code ? `<h3>提交代码</h3><pre class="progress-code">${esc(t.code)}</pre>` : ''}<h3>智能体回复</h3><pre>${esc(t.answer || t.error || (t.status === 'pending' ? '正在回复' : '无回复'))}</pre></details>`;
      }).join('') || '<p class="muted">本单元暂无对话记录。</p>'}`;
    } catch (error) { if (current === request) detail.textContent = error.message; }
  };
  iconify(); load();
}
