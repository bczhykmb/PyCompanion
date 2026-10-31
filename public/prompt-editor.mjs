export function mountPromptEditor({ before, api, icon, iconify, toast }) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const section = document.createElement('details');
  section.className = 'prompt-editor';
  section.innerHTML = '<summary>四组智能体规则</summary><div class="prompt-editor-body"></div>';
  before.before(section);
  const body = section.querySelector('.prompt-editor-body');
  let data, selected = 'A', loading = false;
  const drafts = new Map();
  const names = { A: 'A组 · 导师型 / 中性反馈', B: 'B组 · 导师型 / 积极反馈', C: 'C组 · 同伴型 / 中性反馈', D: 'D组 · 同伴型 / 积极反馈' };
  const markDirty = () => { section.dataset.promptDirty = [...drafts].some(([group, text]) => text !== data.groups.find(g => g.group_id === group).prompt) ? 'true' : 'false'; };
  async function load() {
    if (loading) return;
    loading = true; body.textContent = '正在读取规则…';
    try { data = await api('/admin/prompts'); render(); }
    catch (e) { body.textContent = e.message; data = undefined; }
    finally { loading = false; }
  }
  function render() {
    const current = data.groups.find(g => g.group_id === selected);
    const sourcePrompts = [...current.variants.map(v => ({ prompt: v.prompt, title: `已有账号：${v.count}人 · ${v.version}` })), ...current.history.map(v => ({ prompt: v.prompt, title: `历史：${new Date(v.created).toLocaleString('zh-CN')} · ${v.revision}` }))];
    body.innerHTML = `<div class="prompt-tabs" role="tablist" aria-label="智能体组别">${Object.entries(names).map(([group, title]) => `<button type="button" role="tab" aria-selected="${group === selected}" data-prompt-group="${group}">${escape(title)}</button>`).join('')}</div>
      <form class="prompt-form"><h2>${escape(names[selected])}</h2><p class="muted">本组${current.accountCount}个账号；${current.differentCount}个账号使用其他规则版本。${current.updated ? `上次保存：${escape(new Date(current.updated).toLocaleString('zh-CN'))}` : '当前为内置默认规则。'}</p>
      <label for="prompt-source">查看已有账号或历史版本</label><select id="prompt-source"><option value="">选择要载入编辑区的版本</option>${sourcePrompts.map((p, i) => `<option value="${i}">${escape(p.title)}</option>`).join('')}</select>
      <label for="prompt-text">角色、教学与情绪反馈规则</label><textarea id="prompt-text" maxlength="10000" spellcheck="false">${escape(drafts.get(selected) ?? current.prompt)}</textarea>
      <div class="prompt-actions"><label class="check"><input id="prompt-existing" type="checkbox" checked>同步本组已有账号</label><button id="prompt-reload" class="icon" type="button" title="重新加载已保存规则" aria-label="重新加载已保存规则">${icon('refresh-cw')}</button><button id="prompt-default" type="button" title="载入内置默认规则">${icon('rotate-ccw')}恢复默认</button><button id="prompt-save" class="primary" type="submit">${icon('save')}保存规则</button></div>
      <p class="muted prompt-scope">保存始终适用于本组新建账号；勾选后也同步现有学生和备用码，后续提问生效。演示模式仍使用固定回复。</p><p class="error prompt-error" role="alert"></p>
      </form><details class="completion-rules"><summary>统一引导与完成核对规则（四组共用）</summary><pre>${escape(data.completionPrompt)}</pre></details>`;
    const textarea = body.querySelector('#prompt-text');
    const update = value => { textarea.value = value; drafts.set(selected, value); markDirty(); };
    textarea.oninput = () => { drafts.set(selected, textarea.value); markDirty(); };
    body.querySelectorAll('[data-prompt-group]').forEach(button => button.onclick = () => { selected = button.dataset.promptGroup; render(); });
    body.querySelector('#prompt-source').onchange = e => { if (e.target.value !== '') update(sourcePrompts[Number(e.target.value)].prompt); };
    body.querySelector('#prompt-default').onclick = () => update(current.defaultPrompt);
    body.querySelector('#prompt-reload').onclick = () => {
      if (section.dataset.promptDirty === 'true' && !confirm('重新加载将放弃未保存的规则修改。是否继续？')) return;
      drafts.clear(); section.dataset.promptDirty = 'false'; load();
    };
    body.querySelector('.prompt-form').onsubmit = async e => {
      e.preventDefault();
      const group = selected, text = textarea.value, applyExisting = body.querySelector('#prompt-existing').checked;
      const save = body.querySelector('#prompt-save'); save.disabled = true;
      const error = body.querySelector('.prompt-error'); error.textContent = '';
      try {
        const result = await api('/admin/prompts', { group, prompt: text, expectedRevision: current.revision, applyExisting });
        drafts.delete(group);
        data = await api('/admin/prompts'); selected = group; render(); markDirty();
        toast(`规则已保存，同步${result.affected}个已有账号`);
      } catch (err) { error.textContent = err.message; if (save.isConnected) save.disabled = false; }
    };
    iconify();
  }
  section.ontoggle = () => { if (section.open && !data) load(); };
}
