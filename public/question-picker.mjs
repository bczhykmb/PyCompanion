import { QUESTION_TEMPLATES } from '../lib/questions.mjs';

export function mountQuestionPicker({ button, icon, iconify, choose }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'question-picker';
  dialog.setAttribute('aria-labelledby', 'question-picker-title');
  dialog.innerHTML = `<div class="progress-heading"><h2 id="question-picker-title">提问方式</h2><button class="icon" type="button" aria-label="关闭提问方式" title="关闭提问方式">${icon('x')}</button></div><div class="question-options">${QUESTION_TEMPLATES.map(t => `<button type="button" data-question-template="${t.id}">${icon('message-square')}<span>${t.title}</span></button>`).join('')}</div>`;
  button.after(dialog);
  button.setAttribute('aria-haspopup', 'dialog');
  dialog.querySelector('.icon').onclick = () => dialog.close();
  dialog.querySelectorAll('[data-question-template]').forEach(option => option.onclick = () => {
    const template = QUESTION_TEMPLATES.find(t => t.id === option.dataset.questionTemplate);
    dialog.close(); choose(template.text);
  });
  iconify();
  return () => dialog.showModal();
}
