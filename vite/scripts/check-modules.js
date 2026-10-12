import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = [];
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(path);
  }
}
await collect(root);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file}\n${result.stderr}`);
  const text = await readFile(file, 'utf8');
  assert.doesNotMatch(text, /\brequire\s*\(|module\.exports|\bcreateRequire\b/, file);
  for (const match of text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    const target = resolve(dirname(file), specifier);
    assert.ok(target.startsWith(root), `${file}: dependency escapes es6/: ${specifier}`);
    assert.ok(files.includes(target), `${file}: missing module ${specifier}`);
  }
}
console.log(`Checked ${files.length} ES module files: syntax, native imports, isolated dependencies.`);
