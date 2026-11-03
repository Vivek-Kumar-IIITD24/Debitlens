import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
for (const relativePath of ['dist', 'server.js']) {
  const target = path.resolve(root, relativePath);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}
