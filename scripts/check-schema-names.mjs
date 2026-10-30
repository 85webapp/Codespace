import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const ignored = new Set(['node_modules', '.git', 'dist', 'coverage']);
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.sql']);
const forbidden = [
  { pattern: /\\buser_mobilo\\b/gi, message: 'Typo found: use user_mobile, not user_mobilo.' },
];
const errors = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
    } else if (extensions.has(path.extname(entry.name))) {
      const source = await readFile(fullPath, 'utf8');
      for (const rule of forbidden) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(source)) {
          errors.push(`${path.relative(root, fullPath)}: ${rule.message}`);
        }
      }
    }
  }
}

await walk(root);
if (errors.length) {
  console.error(errors.join('\\n'));
  process.exitCode = 1;
} else {
  console.log('Schema-name regression check passed.');
}
