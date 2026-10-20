// Stress test: how the tick grows with the number of creatures and the size of the map.
// Every scenario runs in its own Node process (a clean heap, no JIT warmed by the previous one).
//
// Usage:
//   node tools/stress.mjs                    quick set: the reference «100 objects» and a few around it
//   node tools/stress.mjs --full             the grid: 5 map sizes × 5 crowds in one camp
//   node tools/stress.mjs --only mixed-100   one scenario (ids from the table)
//   node tools/stress.mjs --budget 6         exit 1 if the reference scenario's mean tick is over 6 ms
//   node tools/stress.mjs --profile mixed-300  CPU profile of one scenario: the functions that eat the tick
//   node tools/stress.mjs --ticks 1200 --out runs/stress   tick count per scenario; write stress.csv there
//
// The tick budget: the game steps every TICK_MS (50 ms) at 1×, so a tick must fit in 50 ms at 1×,
// 12 ms at 4× and about 6 ms at 8× — less the drawing (about 1 ms).
//
// Scenarios:
//   camp-N   N colonists in one camp: the worst case, everyone is everyone's neighbour
//   mixed-N  N objects on the map: 30% colonists in the camp, 55% grazers (deer, hares) and
//            15% wolves spread over the map — close to what a living map holds
//   herd-N   8 colonists and N deer spread over the map: many creatures, few neighbours each
import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const SELF = fileURLToPath(import.meta.url);
const SIZES = {small: [96, 72], medium: [128, 96], large: [192, 144], huge: [256, 192], x384: [384, 288], x512: [512, 384]};
const TICK_MS = 50;
const REFERENCE = 'mixed-100';

const sc = (kind, n, size = 'medium') => ({id: `${kind}-${n}${size === 'medium' ? '' : '@' + size}`, kind, n, size});
const QUICK = [sc('mixed', 30), sc('mixed', 100), sc('mixed', 300), sc('camp', 30), sc('camp', 100), sc('camp', 300),
  sc('herd', 1000, 'huge'), sc('mixed', 100, 'x512')];
const FULL = [];
for (const size of ['medium', 'large', 'huge', 'x384', 'x512']) for (const n of [8, 30, 100, 300, 1000]) FULL.push(sc('camp', n, size));

// ---------- one scenario, in this process ----------
async function runOne(s, ticks) {
  const {newGame, step} = await import('../src/sim.js');
  const {createAgent} = await import('../src/agents/agent.js');
  const {walkable} = await import('../src/world/grid.js');
  const {DEFAULT_CFG} = await import('../src/data/presets.js');
  const [W, H] = SIZES[s.size];
  const colonists = s.kind === 'camp' ? s.n : s.kind === 'mixed' ? Math.max(1, Math.round(s.n * 0.3)) : 8;
  // no migrations or raids: the crowd is exactly what the scenario puts down
  const cfg = {...DEFAULT_CFG, seed: 'stress', dims: {w: W, h: H}, colonists, stock: 'rich',
    wildlife: 'none', predators: 'none', monsters: 'none', raids: 'off'};
  const g0 = performance.now();
  const w = newGame(cfg);
  const genMs = performance.now() - g0;
  for (const k of Object.keys(w.stock)) w.stock[k] += colonists * 20;   // a big crowd should not starve inside the window
  // the rest of the crowd, spread over walkable cells on a fixed sequence (the same map every run)
  let r = 12345;
  const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
  const spot = () => {
    for (let tries = 0; tries < 2000; tries++) {
      const x = 1 + rnd() * (W - 2), y = 1 + rnd() * (H - 2);
      if (walkable(w, (y | 0) * W + (x | 0)) && Math.hypot(x - w.camp.x, y - w.camp.y) >= 12) return [x, y];
    }
    return null;
  };
  const put = (species, faction, count) => {
    for (let k = 0; k < count; k++) { const p = spot(); if (p) createAgent(w, species, faction, p[0], p[1]); }
  };
  // wolves come in packs of four that stand together, as data/migrations.js lands them (a.pack = the first one's id)
  const packs = count => {
    for (let k = 0; k < count; k += 4) {
      const p = spot(); if (!p) continue;
      const group = [];
      for (let m = 0; m < Math.min(4, count - k); m++) group.push(createAgent(w, 'wolf', 'predators', p[0] + rnd() - 0.5, p[1] + rnd() - 0.5));
      for (const a of group) a.pack = group[0].id;
    }
  };
  if (s.kind === 'mixed') {
    const rest = s.n - colonists, wolves = Math.round(s.n * 0.15), grazers = rest - wolves;
    put('deer', 'wild', Math.round(grazers / 2)); put('hare', 'wild', grazers - Math.round(grazers / 2));
    packs(wolves);
  }
  if (s.kind === 'herd') put('deer', 'wild', s.n);

  const times = [], parts = {fields: 0, nav: 0, agents: 0};
  let maxAgents = w.agents.length;
  const deadline = performance.now() + 120000;
  for (let t = 0; t < ticks && !w.over && performance.now() < deadline; t++) {
    const before = {...w.perf}, t0 = performance.now();
    step(w);
    times.push(performance.now() - t0);
    for (const k in parts) parts[k] += (w.perf[k] - before[k] * 0.95) / 0.05;   // w.perf is an EMA: this tick's own share
    if (w.agents.length > maxAgents) maxAgents = w.agents.length;
  }
  const sorted = [...times].sort((a, b) => a - b), n = sorted.length;
  const f = v => +v.toFixed(2);
  return {id: s.id, kind: s.kind, n: s.n, map: `${W}×${H}`, agents: maxAgents, ticks: n, genMs: Math.round(genMs),
    mean: f(times.reduce((a, b) => a + b, 0) / n), p50: f(sorted[n >> 1]), p95: f(sorted[Math.floor(n * 0.95)]),
    fields: f(parts.fields / n), nav: f(parts.nav / n), agentsMs: f(parts.agents / n),
    heapMB: Math.round(process.memoryUsage().heapUsed / 1e6), over: w.over?.reason || ''};
}

// ---------- the parent: run, tabulate, judge ----------
function child(s, ticks, extra = []) {
  const res = spawnSync(process.execPath, [...extra, '--max-old-space-size=4000', SELF, '--one', JSON.stringify(s), '--ticks', String(ticks)],
    {encoding: 'utf8', maxBuffer: 1 << 24});
  const line = res.stdout.trim().split('\n').pop();
  try { return JSON.parse(line); } catch { return {id: s.id, error: (res.stderr || res.stdout).trim().split('\n').slice(-3).join(' ')}; }
}

const speedOf = ms => {   // the fastest game speed this tick keeps up with, drawing included
  const tick = ms + 1;
  for (const v of [8, 4, 2, 1]) if (tick <= TICK_MS / v) return `${v}×`;
  return `×${(TICK_MS / tick).toFixed(2)}`;
};

function table(rows) {
  const head = ['сценарий', 'карта', 'объектов', 'мс/тик', 'p95', 'поля', 'навиг.', 'агенты', 'скорость'];
  const body = rows.map(r => r.error ? [r.id, '—', '—', 'ошибка: ' + r.error] :
    [r.id, r.map, r.agents, r.mean, r.p95, r.fields, r.nav, r.agentsMs, speedOf(r.mean)].map(String));
  const wd = head.map((h, k) => Math.max(h.length, ...body.map(b => (b[k] || '').length)));
  const fmt = cells => cells.map((c, k) => (k < 2 ? c.padEnd(wd[k]) : c.padStart(wd[k]))).join('  ');
  return [fmt(head), wd.map(x => '-'.repeat(x)).join('  '), ...body.map(fmt)].join('\n');
}

// the functions with the most own time in a CPU profile
function hotspots(file, top = 25) {
  const p = JSON.parse(readFileSync(file, 'utf8'));
  const byId = new Map(p.nodes.map(n => [n.id, n])), self = new Map();
  let total = 0;
  p.samples.forEach((id, k) => {
    const dt = p.timeDeltas[k] || 0, cf = byId.get(id).callFrame;
    const where = (cf.url.split('/src/')[1] || cf.url.split('/').pop() || '') + (cf.url ? ':' + (cf.lineNumber + 1) : '');
    const key = `${cf.functionName || '(anon)'}  ${where}`;
    self.set(key, (self.get(key) || 0) + dt); total += dt;
  });
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, t]) => `${(t / total * 100).toFixed(1).padStart(5)}%  ${k}`).join('\n');
}

const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const ticks = +(opt('--ticks') || 1200);

if (args.includes('--one')) {
  console.log(JSON.stringify(await runOne(JSON.parse(opt('--one')), ticks)));
} else if (opt('--profile')) {
  const id = opt('--profile'), s = [...QUICK, ...FULL].find(x => x.id === id) || parseId(id);
  const dir = join(tmpdir(), `stress-prof-${process.pid}`);
  mkdirSync(dir, {recursive: true});
  const r = child(s, Math.min(ticks, 600), ['--cpu-prof', `--cpu-prof-dir=${dir}`]);
  console.log(table([r]) + '\n\nсобственное время функций (без вызванных ими):\n' + hotspots(join(dir, readdirSync(dir)[0])));
  rmSync(dir, {recursive: true, force: true});
} else {
  const only = opt('--only');
  const set = only ? only.split(',').map(id => [...QUICK, ...FULL].find(x => x.id === id) || parseId(id)) : args.includes('--full') ? FULL : QUICK;
  const rows = [];
  for (const s of set) { const r = child(s, ticks); rows.push(r); process.stderr.write(`  ${r.id}: ${r.error ? 'ошибка' : r.mean + ' мс/тик'}\n`); }
  console.log(`\n${ticks} тиков на сценарий (день = 1200). Скорость — самая быстрая, за которой тик успевает (с отрисовкой ~1 мс).\n`);
  console.log(table(rows));
  const out = opt('--out');
  if (out) {
    mkdirSync(out, {recursive: true});
    const keys = Object.keys(rows.find(r => !r.error) || {});
    writeFileSync(join(out, 'stress.csv'), [keys.join(','), ...rows.map(r => keys.map(k => r[k] ?? '').join(','))].join('\n') + '\n');
    console.log(`\nзаписано: ${join(out, 'stress.csv')}`);
  }
  const budget = opt('--budget');
  if (budget != null) {
    const ref = rows.find(r => r.id === REFERENCE) || child(QUICK.find(x => x.id === REFERENCE), ticks);
    const pass = !ref.error && ref.mean <= +budget;
    console.log(`\nбюджет: ${REFERENCE} — ${ref.mean ?? '—'} мс/тик при лимите ${budget} мс: ${pass ? 'укладывается' : 'НЕ укладывается'}`);
    if (!pass) process.exitCode = 1;
  }
}

// «camp-50», «mixed-200@huge»: any crowd, not only the ones in the sets
function parseId(id) {
  const m = /^(camp|mixed|herd)-(\d+)(?:@(\w+))?$/.exec(id || '');
  if (!m || (m[3] && !SIZES[m[3]])) throw new Error(`неизвестный сценарий «${id}»: нужно camp|mixed|herd-<число>[@${Object.keys(SIZES).join('|')}]`);
  return sc(m[1], +m[2], m[3] || 'medium');
}
