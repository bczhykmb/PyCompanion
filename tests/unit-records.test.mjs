import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitTurns, unitTranscript } from '../public/unit-records.mjs';

test('unit transcript excludes other units and retains code, errors and pending state', () => {
  const turns = [
    { task: 'intro', question: 'intro-only', answer: 'answer-intro', status: 'completed', created: 1000, mode: 'live', code: 'print("```")' },
    { task: 'variables', question: 'variables-only', answer: 'secret-other-unit', status: 'completed', created: 2000, mode: 'demo' },
    { task: 'intro', question: 'failed-question', status: 'failed', error: 'model-timeout', created: 3000, mode: 'demo' },
    { task: 'intro', question: 'pending-question', status: 'pending', created: 4000, mode: 'live' },
  ];
  assert.equal(unitTurns(turns, 'intro').length, 3);
  const text = unitTranscript({ student: { id: 'S_TEST', group: 'A', name: '工程师导师' }, task: { id: 'intro', title: '第1单元' }, turns, exportedAt: 'fixed-time' });
  for (const fragment of ['intro-only', 'answer-intro', 'failed-question', 'model-timeout', 'pending-question', '正在回复', '对话轮数：3', '````python']) assert.ok(text.includes(fragment));
  assert.ok(!text.includes('variables-only'));
  assert.ok(!text.includes('secret-other-unit'));
  assert.equal(unitTurns(turns, 'free').length, 0);
});
