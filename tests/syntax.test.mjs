import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
