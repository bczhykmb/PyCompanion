import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completionSignals, unitCompletion, COMPLETION_HEADERS as H } from '../lib/completion.mjs';

const turn = (answer, extra = {}) => ({ id: 'one', task: 'variables', status: 'completed', mode: 'live', group_snapshot: 'A', created: 1000, answer, ...extra });
test('completion protocol recognizes independent and combined leading headers only', () => {
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
test('unit progress retains confirmations across later attempts but separates units and groups', () => {
  const turns = [turn(H.basic), turn(H.optional, { id: 'two', created: 2000 }), turn('选做的新尝试失败', { created: 3000 }), turn(H.basic, { group_snapshot: 'D', task: 'intro' })];
  const progress = unitCompletion(turns, 'variables', 'A');
  assert.equal(progress.turns, 3); assert.equal(progress.basic.id, 'one'); assert.equal(progress.optional.id, 'two');
  assert.equal(unitCompletion(turns, 'intro', 'A').basic, null);
  assert.equal(unitCompletion([], 'variables', 'A').basic, null);
});
