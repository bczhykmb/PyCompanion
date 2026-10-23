import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';

// Reuse the existing asset builder without changing the Vercel entry point.
const result = spawnSync(process.execPath, ['build.mjs', '--vercel'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
await fs.mkdir('dist/linux', { recursive: true });
await fs.cp('dist/vercel', 'dist/linux/public', { recursive: true });
console.log('Linux assets ready: dist/linux/public');
