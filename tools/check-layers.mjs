// Keeps the core free of the screen: the simulation (everything except src/ui, src/render, src/app and
// src/main.js) must not import those folders or touch browser-only globals. Any other front end —
// a different renderer, the balance runner, a server — can then drive the same core.
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), src = join(root, 'src');
const SHELL = ['ui', 'render', 'main.js', 'app'];
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

// Code that runs for every creature every tick must not walk every creature: that grows as the square of
// their number (tools/stress.mjs). Ask an index instead — agents/lookup.js (by id, pack, species, who
// attacks whom) or agents/spatial.js (who is near). A walk that stays cheap because only a few creatures
// ever make it (a spirit, a caravan guard) is marked on its line: `// scan: why it is cheap`.
const PER_AGENT = /^(agents[\\/]brains[\\/]|agents[\\/](tasks|jobRunners|combat|movement)\.js$|data[\\/]jobs\.js$)/;
const SCAN = /\bw\.agents\.(find|filter|some|every|reduce|forEach|map)\(|\bof w\.agents\b/;
const scans = [];
for (const f of files) {
  const rel = relative(src, f);
  if (!PER_AGENT.test(rel)) continue;
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (SCAN.test(line.replace(/\/\/.*$/, '')) && !/scan:/.test(line)) scans.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
  });
}
if (scans.length) {
  console.log('Перебор всех существ в коде, который работает для каждого существа каждый тик (нужен индекс из agents/lookup.js или agents/spatial.js, либо пометка «// scan: почему дёшево»):\n  ' + scans.join('\n  '));
  process.exit(1);
}
console.log('ok   пошаговый код существ не перебирает всех существ (кроме помеченных «scan:»)');

// every source file must at least parse (the shell is not loaded by the other tests)
import {execFileSync} from 'node:child_process';
const broken = [];
for (const f of files) { try { execFileSync(process.execPath, ['--check', f], {stdio: 'pipe'}); } catch (e) { broken.push(`${relative(src, f)}: ${String(e.stderr).split('\n').find(l => /Error/.test(l)) || 'не разбирается'}`); } }
if (broken.length) { console.log('Файлы с синтаксической ошибкой:\n  ' + broken.join('\n  ')); process.exit(1); }
console.log(`ok   все ${files.length} файлов разбираются`);
