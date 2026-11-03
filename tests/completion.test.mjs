import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completionSignals, unitCompletion, COMPLETION_HEADERS as H } from '../lib/completion.mjs';

const turn = (answer, extra = {}) => ({ id: 'one', task: 'variables', status: 'completed', mode: 'live', group_snapshot: 'A', created: 1000, answer, ...extra });
test('completion protocol recognizes standalone headers but excludes examples and quotations', () => {
  assert.equal(completionSignals(turn(H.basic + '\n依据')).basic, true);
  assert.equal(completionSignals(turn(H.optional + '\n依据')).optional, true);
  assert.equal(completionSignals(turn(H.optional)).basic, false);
  for (const text of [H.basic + '\n' + H.optional, H.optional + '\n\n' + H.basic]) {
    const result = completionSignals(turn((text + '\n依据').replace(/\n/g, '\r\n')));
    assert.equal(result.basic, true); assert.equal(result.optional, true); assert.equal(result.body, '依据');
  }
  for (const t of [turn('示例\n' + H.basic), turn('```\n' + H.optional), turn('选做练习已完成'), turn(H.basic, { mode: 'demo' }), turn(H.basic, { status: 'pending' }), turn(H.optional, { task: 'free' }), turn(H.basic + '后面紧接文字')]) {
    const result = completionSignals(t); assert.equal(result.basic || result.optional, false);
  }
});

test('completion after explanatory prose counts and removes only the marker pair from display', () => {
  const answer = '数字相加是计算，文字相加是拼接。\n\n' + H.optional + '\n\n核对依据：代码与运行结果一致。';
  const flags = completionSignals(turn(answer));
  assert.equal(flags.optional, true); assert.equal(flags.basic, false);
  assert.ok(flags.body.includes('数字相加')); assert.ok(flags.body.includes('核对依据')); assert.ok(!flags.body.includes('【选做任务完成】'));
  assert.equal(completionSignals(turn(H.basic + '\n解释基础依据。\n\n' + H.optional + '\n解释选做依据。')).optional, true);
  for (const answer of ['```text\n' + H.optional + '\n```', '~~~\n' + H.basic + '\n~~~', '> 【选做任务完成】\n> 本单元选做任务已完成。', '以下是格式示例：\n' + H.optional, '如果完成，你会看到：\n' + H.optional]) {
    const result = completionSignals(turn(answer)); assert.equal(result.basic || result.optional, false);
  }
});
test('unit progress retains confirmations across later attempts but separates units and groups', () => {
  const turns = [turn(H.basic), turn(H.optional, { id: 'two', created: 2000 }), turn('选做的新尝试失败', { created: 3000 }), turn(H.basic, { group_snapshot: 'D', task: 'intro' })];
  const progress = unitCompletion(turns, 'variables', 'A');
  assert.equal(progress.turns, 3); assert.equal(progress.basic.id, 'one'); assert.equal(progress.optional.id, 'two');
  assert.equal(unitCompletion(turns, 'intro', 'A').basic, null);
  assert.equal(unitCompletion([], 'variables', 'A').basic, null);
});
