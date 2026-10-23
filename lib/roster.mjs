export const CLASS_GROUPS = Object.freeze({ '计网2541': 'D', '计网2542': 'C', '计网2543': 'B', '计网2532': 'A' });

export function validateRoster(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 500) throw new Error('请导入1—500名学生。');
  const seen = new Set();
  return input.map((entry, i) => {
    if (!entry || typeof entry !== 'object') throw new Error(`第${i + 1}条记录格式不正确。`);
    const studentNumber = typeof entry.studentNumber === 'string' ? entry.studentNumber.trim() : '';
    const className = typeof entry.className === 'string' ? entry.className.trim() : '';
    if (!/^\d{6,24}$/.test(studentNumber)) throw new Error(`第${i + 1}条学号必须是6—24位数字文本。`);
    if (!Object.hasOwn(CLASS_GROUPS, className)) throw new Error(`第${i + 1}条班级不在指定的四个班中。`);
    if (seen.has(studentNumber)) throw new Error(`第${i + 1}条学号重复。`);
    seen.add(studentNumber);
    // Group is always derived on the server; extra fields, including names, are discarded.
    return { studentNumber, className, group: CLASS_GROUPS[className] };
  });
}
