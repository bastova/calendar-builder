import { createHash } from 'node:crypto';
import { cpSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Version the entire native module graph, including relative imports. */
export function prepareCalendarAssets(root = process.cwd()) {
  const source = path.join(root, 'public/calendar/src/scripts');
  const hash = createHash('sha256');
  for (const file of readdirSync(source).sort()) {
    hash.update(file).update('\0').update(readFileSync(path.join(source, file)));
  }
  hash.update(readFileSync(path.join(root, 'public/calendar/browser-files.js')));
  const version = hash.digest('hex').slice(0, 16);
  const directory = `scripts-${version}`;
  // Keep the same depth so font and WASM URLs relative to import.meta.url work.
  cpSync(source, path.join(root, 'public/calendar/src', directory), { recursive: true });
  return { version, main: `/calendar/src/${directory}/main.js` };
}
