import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function findFiles(dir, exts, list = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      findFiles(full, exts, list);
    } else {
      if (exts.some((ext) => entry.endsWith(ext))) {
        list.push(full);
      }
    }
  }
  return list;
}

test('Check NO em-dashes or en-dashes in any project file', () => {
  const root = join(import.meta.dirname, '..');
  const files = findFiles(root, ['.js', '.mjs', '.css', '.html', '.md', '.json', '.xml']);

  const forbiddenDashes = ['\u2014', '\u2013'];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const dash of forbiddenDashes) {
      const idx = content.indexOf(dash);
      assert.equal(
        idx,
        -1,
        `File ${file} contains forbidden dash character '${dash}' at character index ${idx}`
      );
    }
  }
});

test('All JS modules in src/ pass node --check syntax validation and resolve static imports', async () => {
  const root = join(import.meta.dirname, '..');
  const srcFiles = findFiles(join(root, 'src'), ['.js']);

  for (const file of srcFiles) {
    execFileSync(process.execPath, ['--check', file]);
  }

  const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  for (const file of srcFiles) {
    const content = readFileSync(file, 'utf8');
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const specifiers = match[1]
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
      const relPath = match[2];
      if (!relPath.startsWith('.')) continue;
      const targetPath = resolve(dirname(file), relPath);
      const mod = await import(pathToFileURL(targetPath).href);
      for (const spec of specifiers) {
        assert.ok(
          spec in mod,
          `File ${file} imports '${spec}' from '${relPath}', but '${targetPath}' does not export '${spec}'`
        );
      }
    }
  }
});
