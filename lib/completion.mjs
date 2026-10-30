export const COMPLETION_HEADERS = {
  basic: '【基础任务完成】\n本单元基础任务已完成。',
  optional: '【选做任务完成】\n本单元选做任务已完成。',
};

export function completionSignals(turn) {
  const result = { basic: false, optional: false, body: String(turn.answer ?? '') };
  if (turn.mode !== 'live' || turn.status !== 'completed' || turn.task === 'free') return result;
  let rest = result.body.replace(/\r\n/g, '\n');
  // Only protocol headers at the start of an assistant reply count, never quoted text.
  for (let i = 0; i < 2; i++) {
    const kind = Object.keys(COMPLETION_HEADERS).find(k => !result[k] && (rest === COMPLETION_HEADERS[k] || rest.startsWith(COMPLETION_HEADERS[k] + '\n')));
    if (!kind) break;
    result[kind] = true;
    rest = rest.slice(COMPLETION_HEADERS[kind].length).replace(/^\n+/, '');
  }
  if (result.basic || result.optional) result.body = rest;
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
