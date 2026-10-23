export function unitTurns(turns, task) {
  return turns.filter(t => t.task === task);
}

function block(value, language = '') {
  const content = String(value || '');
  const fence = '`'.repeat(Math.max(3, ...[...content.matchAll(/`+/g)].map(m => m[0].length + 1)));
  return `${fence}${language}\n${content}\n${fence}`;
}

export function unitTranscript({ student, task, turns, exportedAt = new Date().toISOString() }) {
  const records = unitTurns(turns, task.id);
  const lines = [`# ${task.title} · 对话记录`, '', `研究编号：${student.id}`, `组别：${student.group}`, `导出时间：${exportedAt}`, `对话轮数：${records.length}`, ''];
  for (const [i, turn] of records.entries()) {
    lines.push(`## 第${i + 1}轮`, '', `提问时间：${new Date(turn.created).toISOString()}`, `模式：${turn.mode === 'live' ? '真实模型' : '演示回复'}`, '', '### 学生提问', '', block(turn.question || '请查看我的代码。'), '');
    if (turn.code) lines.push('### 提交的Python代码', '', block(turn.code, 'python'), '');
    lines.push(`### ${student.name}`, '');
    if (turn.status === 'completed') lines.push(block(turn.answer));
    else if (turn.status === 'failed') lines.push(`状态：回复失败`, '', block(turn.error || '本次回复失败。'));
    else lines.push('状态：正在回复，尚未完成。');
    lines.push('');
  }
  return lines.join('\n');
}
