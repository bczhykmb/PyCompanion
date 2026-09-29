const INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';
const send = self.postMessage.bind(self);
let used = false;
self.onmessage = async ({ data }) => {
  if (used || typeof data.code !== 'string' || data.code.length > 12000 || typeof data.stdin !== 'string' || data.stdin.length > 8000) return;
  used = true;
  let output = '', size = 0, truncated = false;
  const flush = () => { if (output) { send({ type: 'output', text: output }); output = ''; } };
  const append = text => {
    const remaining = 16000 - size;
    if (remaining > 0) { const part = text.slice(0, remaining); output += part; size += part.length; }
    if (text.length > remaining && !truncated) { output += '\n[输出已截断：超过 16000 字符]\n'; truncated = true; }
    if (output.length >= 512) flush();
  };
  let pyodide;
  try {
    const { loadPyodide } = await import(INDEX_URL + 'pyodide.mjs');
    pyodide = await loadPyodide({ indexURL: INDEX_URL, stdout: () => {}, stderr: () => {}, jsglobals: {} });
  } catch {
    send({ type: 'load-error', text: 'Python 环境加载失败。请检查网络是否允许访问 cdn.jsdelivr.net，然后重试。' });
    return;
  }
  const lines = data.stdin === '' ? [] : data.stdin.replace(/\r\n?/g, '\n').split('\n');
  // A final newline terminates the last supplied line, rather than adding another input.
  if (lines.length && lines.at(-1) === '') lines.pop();
  let cursor = 0;
  pyodide.setStdin({ stdin: () => {
    if (cursor >= lines.length) return null;
    const line = lines[cursor++]; append(line + '\n'); return line + '\n';
  } });
  const stdout = new TextDecoder(), stderr = new TextDecoder();
  pyodide.setStdout({ write: buffer => { append(stdout.decode(buffer, { stream: true })); return buffer.length; } });
  pyodide.setStderr({ write: buffer => { append(stderr.decode(buffer, { stream: true })); return buffer.length; } });
  send({ type: 'running' });
  try {
    pyodide.runPython(data.code, { filename: 'practice.py' });
    append(stdout.decode() + stderr.decode()); flush();
    send({ type: 'done', ok: true });
  } catch (error) {
    append(stdout.decode() + stderr.decode()); flush();
    const message = String(error.message || error).slice(-6000);
    send({ type: 'done', ok: false, error: message + (message.includes('EOFError') ? '\n输入不足：请在“程序输入”中补齐数据，每次 input() 对应一行。' : '') });
  }
};
