// A static server with no dependencies: `node tools/serve.mjs [port] [--page=forest.html] [--no-open]` (forest.html is the default).
// Serves the project folder, picks the next free port if the one asked for is busy, and opens the browser.
import {createServer} from 'node:http';
import {createReadStream, statSync} from 'node:fs';
import {join, normalize, extname, resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildSprites} from './art-build.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.gz': 'application/gzip', '.woff2': 'font/woff2'};

const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'forest.html';
  // the pictures: made again from src/art/**/*.svg whenever the game asks for them, so an edited SVG shows on a reload
  if (path === '/src/art/sprites.js') { try { buildSprites(); } catch (e) { console.log('Картинки: ' + e.message); } }
  const file = join(ROOT, normalize(path));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  let st;
  try { st = statSync(file); } catch (e) { res.writeHead(404); res.end('404'); return; }
  if (st.isDirectory()) { res.writeHead(301, {Location: path + '/'}); res.end(); return; }
  res.writeHead(200, {'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
  createReadStream(file).pipe(res);
});

function open(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], {detached: true, stdio: 'ignore'}).unref(); } catch (e) { /* no browser to open; the URL is printed */ }
}

const PAGE = ((process.argv.find(x => x.startsWith('--page=')) || '').slice(7) || 'forest.html').replace(/^\/+/, '');
let port = +(process.argv.slice(2).find(x => /^\d+$/.test(x)) || 8000);
const listen = () => server.listen(port, '127.0.0.1');
server.on('error', e => { if (e.code === 'EADDRINUSE' && port < 8020) { port++; listen(); } else throw e; });
server.on('listening', () => {
  const url = `http://localhost:${port}/${PAGE}`;
  console.log(`Тёплый Брод: ${url}  (закройте это окно, чтобы остановить сервер)`);
  if (!process.argv.includes('--no-open')) open(url);
});
listen();
