export const QUESTION_TEMPLATES = [
  { id: 'error', title: '运行报错', text: '运行时出现的报错是：【请填写】\n我不理解的地方是：【请填写】\n请提示我先检查哪里，不要直接给出答案。' },
  { id: 'output', title: '输出与预期不同', text: '我希望得到的结果是：【请填写】\n实际运行结果是：【请填写】\n我已经尝试了：【请填写】\n请引导我分析差异。' },
  { id: 'understand', title: '看不懂一处代码', text: '我不理解的代码或语法是：【请填写】\n我目前的理解是：【请填写】\n请帮我分析这处代码的含义。' },
  { id: 'next-step', title: '不知道下一步怎么做', text: '我想实现的功能是：【请填写】\n我已经完成了：【请填写】\n现在卡在：【请填写】\n请给我一个思考方向，让我自己尝试。' },
  { id: 'change', title: '核对自己的修改思路', text: '我发现的问题是：【请填写】\n我做出的修改是：【请填写】\n修改后的运行结果是：【请填写】\n请帮我核对修改思路是否合理。' },
  { id: 'completion', title: '核对任务完成情况', text: '我正在核对本单元的【请填写】任务（必做或选做）。\n我完成的具体内容是：【请填写】\n我测试过的输入和对应结果是：【请填写】\n请根据这些材料核对还有没有遗漏。' },
];

export function questionError(value) {
  const question = typeof value === 'string' ? value.trim() : '';
  if (!question) return '请填写你实际遇到的学习问题，不能仅提交代码。';
  if (question.includes('【请填写】')) return '请把提问框架中的“【请填写】”补充为你的实际情况。';
  if (question.startsWith('请结合当前任务、代码和运行结果，帮我定位问题，并提示下一步。')) return '请具体描述你遇到的问题，不要只提交通用提问。';
  return '';
}
