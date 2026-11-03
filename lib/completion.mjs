export const COMPLETION_HEADERS = {
  basic: '【基础任务完成】\n本单元基础任务已完成。',
  optional: '【选做任务完成】\n本单元选做任务已完成。',
};

export function completionSignals(turn) {
  const result = { basic: false, optional: false, body: String(turn.answer ?? '') };
  if (turn.mode !== 'live' || turn.status !== 'completed' || turn.task === 'free') return result;
  const lines = result.body.replace(/\r\n/g, '\n').split('\n'), removed = new Set();
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const delimiter = lines[i].match(/^ {0,3}(`{3,}|~{3,})/);
    if (delimiter) {
      const token = delimiter[1];
      if (!fence) fence = token;
      else if (token[0] === fence[0] && token.length >= fence.length) fence = null;
      continue;
    }
    if (fence || /^(?: {4}|\t)/.test(lines[i])) continue;
    // Accept standalone protocol pairs after prose, but not quoted/sample markers.
    const kind = Object.keys(COMPLETION_HEADERS).find(k => lines[i].trim() === COMPLETION_HEADERS[k].split('\n')[0]);
    if (!kind) continue;
    let next = i + 1;
    while (next < lines.length && !lines[next].trim()) next++;
    if (lines[next]?.trim() !== COMPLETION_HEADERS[kind].split('\n')[1] || /^(?: {4}|\t)/.test(lines[next])) continue;
    const preceding = lines.slice(0, i).filter(line => line.trim()).at(-1) || '';
    if (/(示例|例如|格式|引用|假设|如果|不要|不能|不得)/.test(preceding)) continue;
    result[kind] = true;
    for (let j = i; j <= next; j++) removed.add(j);
  }
  if (result.basic || result.optional) result.body = lines.filter((_, i) => !removed.has(i)).join('\n').trim();
  return result;
}

export function unitCompletion(turns, task, group) {
  const result = { task, turns: 0, basic: null, optional: null };
  for (const turn of turns) {
    if (turn.task !== task || turn.mode !== 'live' || (turn.group_snapshot && turn.group_snapshot !== group)) continue;
    result.turns++;
    const flags = completionSignals(turn);
    for (const kind of ['basic', 'optional']) {
      if (flags[kind] && (!result[kind] || turn.created >= result[kind].created)) result[kind] = { id: turn.id, created: turn.created };
    }
  }
  return result;
}
