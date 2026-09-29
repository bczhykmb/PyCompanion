import { build } from 'esbuild';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const client = await build({ entryPoints: ['public/app.mjs'], bundle: true, write: false, minify: true, format: 'esm', target: 'es2022', platform: 'browser' });
const assets = { '/app.js': { content: client.outputFiles[0].text, type: 'text/javascript;charset=utf-8' } };
for (const [name, type] of [['index.html','text/html'],['app.css','text/css'],['favicon.svg','image/svg+xml'],['python-worker.mjs','text/javascript']]) assets['/' + name] = { content: await fs.readFile('public/' + name, 'utf8'), type: type + ';charset=utf-8' };
for (const name of ['engineer.png', 'classmate.png']) assets['/' + name] = { content: (await fs.readFile('public/' + name)).toString('base64'), type: 'image/png', encoding: 'base64' };
assets['/app.css'].content += '\n' + await fs.readFile('public/characters.css', 'utf8');
assets['/app.css'].content += '\n' + await fs.readFile('public/runner.css', 'utf8');
// Content versions prevent open browser tabs from reusing outdated bundles.
for (const name of ['/app.js', '/app.css']) {
  const version = createHash('sha256').update(assets[name].content).digest('hex').slice(0,12);
  assets['/index.html'].content = assets['/index.html'].content.replace(name + '"', name + '?v=' + version + '"');
}
if (process.argv.includes('--vercel')) {
  await fs.mkdir('dist/vercel', { recursive: true });
  for (const [name, asset] of Object.entries(assets)) {
    await fs.writeFile('dist/vercel' + name, asset.encoding === 'base64' ? Buffer.from(asset.content, 'base64') : asset.content);
  }
} else {
  await fs.mkdir('dist/server', { recursive: true });
  await build({ entryPoints: ['worker.mjs'], outfile: 'dist/server/index.js', bundle: true, minify: true, format: 'esm', target: 'es2022', platform: 'browser', define: { ASSET_MAP: JSON.stringify(assets) } });
  await fs.mkdir('dist/.openai', { recursive: true });
  await fs.copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
}
console.log('Classroom web build complete.');
