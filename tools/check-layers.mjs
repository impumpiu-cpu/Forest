// Keeps the core free of the screen: the simulation (everything except src/ui, src/render and
// src/main.js) must not import those folders or touch browser-only globals. Any other front end —
// a different renderer, the balance runner, a server — can then drive the same core.
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), src = join(root, 'src');
const SHELL = ['ui', 'render', 'main.js'];
const BROWSER = /\b(document|window|localStorage|sessionStorage|indexedDB|requestAnimationFrame|navigator)\s*[.(]/;

const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })(src);

const bad = [];
for (const f of files) {
  const rel = relative(src, f), top = rel.split(/[\\/]/)[0];
  if (SHELL.includes(top)) continue;
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    const m = code.match(/from\s+['"]([^'"]+)['"]/);
    if (m && m[1].startsWith('.')) {
      const target = relative(src, resolve(dirname(f), m[1])).split(/[\\/]/)[0];
      if (SHELL.includes(target)) bad.push(`${rel}:${i + 1} imports ${m[1]}`);
    }
    if (BROWSER.test(code)) bad.push(`${rel}:${i + 1} uses a browser global: ${code.trim().slice(0, 80)}`);
  });
}
if (bad.length) { console.log('Ядро зависит от оболочки:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`ok   ядро (${files.filter(f => !SHELL.includes(relative(src, f).split(/[\\/]/)[0])).length} файлов) не зависит от экрана`);
