import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTION_TEMPLATES, questionError, visibleQuestion } from '../lib/questions.mjs';

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

test('student bubbles hide attached runtime metadata without changing saved questions', () => {
  const text = '为什么输出 hello world？';
  const context = '\n学生浏览器运行状态：运行完成\n程序输入：\n（无）\n输出或报错（最多1800字符）：\nhello world';
  const turn = { question: text + context, code: 'print("hello world")' };
  assert.equal(visibleQuestion(turn), text);
  assert.equal(turn.question, text + context);
  assert.equal(visibleQuestion({ question: text + '\n当前代码尚无匹配的运行结果。', code: 'print(12)' }), text);
  assert.equal(visibleQuestion({ question: text + context, code: '' }), text + context);
  const ownText = '学生浏览器运行状态是什么意思？\n程序输入：我写了12';
  assert.equal(visibleQuestion({ question: ownText, code: 'print(12)' }), ownText);
});
