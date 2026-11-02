import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTION_TEMPLATES, questionError } from '../lib/questions.mjs';

test('question templates need personal details before submission', () => {
  assert.equal(QUESTION_TEMPLATES.length, 6);
  for (const template of QUESTION_TEMPLATES) {
    assert.ok(questionError(template.text));
    assert.equal(questionError(template.text.replaceAll('【请填写】', '我实际遇到的问题')), '');
  }
  for (const empty of ['', ' \n\t', null]) assert.ok(questionError(empty));
  assert.ok(questionError('请结合当前任务、代码和运行结果，帮我定位问题，并提示下一步。\n输出结果'));
  assert.equal(questionError('为什么10被分到偏低？'), '');
});
