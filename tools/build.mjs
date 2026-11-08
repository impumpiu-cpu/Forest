// Bundles src/ into dist/forest.html: one self-contained file that opens without a server. A local build:
// dist/ is not kept in git (.gitignore); the game is run through Forest.bat or tools/serve.mjs.
// Usage: npm install && npm run build
import {build} from 'esbuild';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {execSync} from 'node:child_process';
import {buildSprites} from './art-build.mjs';

let commit = 'без git';
try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch (e) { /* not a git checkout */ }

buildSprites();   // the pictures (src/art/*.svg → src/art/sprites.js) as they are now
const res = await build({entryPoints: ['src/app/main.js'], bundle: true, format: 'iife', write: false, minify: false, target: 'es2020',
  define: {__BUILD__: JSON.stringify('сборка ' + commit)}});
const js = res.outputFiles[0].text;
const css = readFileSync('style.css', 'utf8'), shell = readFileSync('shell.css', 'utf8');
// the fonts go in as data: the one file needs no fonts/ beside it
const fonts = readFileSync('fonts/fonts.css', 'utf8').replace(/url\((fonts\/[^)]+\.woff2)\)/g, (_, f) => `url(data:font/woff2;base64,${readFileSync(f).toString('base64')})`);
const html = readFileSync('forest.html', 'utf8')
  .replace('<link rel="stylesheet" href="fonts/fonts.css">', () => `<style>\n${fonts}</style>`)
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}</style>`)
  .replace('<link rel="stylesheet" href="shell.css">', () => `<style>\n${shell}</style>`)
  .replace('<script type="module" src="src/app/main.js"></script>', () => `<script>\n${js}</script>`);
mkdirSync('dist', {recursive: true});
writeFileSync('dist/forest.html', html);
console.log(`dist/forest.html: ${(html.length / 1024).toFixed(0)} KB`);
