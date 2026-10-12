// Bundles src/ into dist/forest.html: one self-contained file that opens without a server.
// Usage: npm install && npm run build
import {build} from 'esbuild';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {execSync} from 'node:child_process';

let commit = 'без git';
try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch (e) { /* not a git checkout */ }

const res = await build({entryPoints: ['src/main.js'], bundle: true, format: 'iife', write: false, minify: false, target: 'es2020',
  define: {__BUILD__: JSON.stringify('сборка ' + commit)}});
const js = res.outputFiles[0].text;
const css = readFileSync('style.css', 'utf8');
const html = readFileSync('index.html', 'utf8')
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}</style>`)
  .replace('<script type="module" src="src/main.js"></script>', () => `<script>\n${js}</script>`);
mkdirSync('dist', {recursive: true});
writeFileSync('dist/forest.html', html);
console.log(`dist/forest.html: ${(html.length / 1024).toFixed(0)} KB`);
