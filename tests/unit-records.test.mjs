import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitTurns, unitTranscript, unitArchive } from '../public/unit-records.mjs';
import { unzipSync, strFromU8 } from 'fflate';

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

test('unit ZIP includes exact current editor code and only the selected unit transcript', () => {
  const student = { id: 'S_TEST', group: 'D', name: '同学伙伴' }, task = { id: 'intro', title: '第1单元' };
  const code = 'print("当前代码，尚未提交")\n';
  const turns = [{ task: 'intro', question: '本单元', code: 'old-code', answer: '回答', status: 'completed', mode: 'live', created: 1000 }, { task: 'variables', question: '其他单元不导出', status: 'pending', mode: 'live', created: 2000 }];
  const files = unzipSync(unitArchive({ student, task, code, turns, exportedAt: 'fixed' }));
  assert.deepEqual(Object.keys(files).sort(), ['intro-对话记录.md', 'intro.py']);
  assert.equal(strFromU8(files['intro.py']), code);
  assert.ok(strFromU8(files['intro-对话记录.md']).includes('本单元'));
  assert.ok(!strFromU8(files['intro-对话记录.md']).includes('其他单元不导出'));
  const empty = unzipSync(unitArchive({ student, task, code: '', turns: [] }));
  assert.equal(strFromU8(empty['intro.py']), '');
  assert.ok(strFromU8(empty['intro-对话记录.md']).includes('对话轮数：0'));
});
