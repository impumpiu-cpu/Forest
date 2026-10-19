// The arena's numbers (tools/arena.mjs): duels → win rates by weapon, kit, armour, race, skill and
// SPECIAL, per tier; and the same as a self-contained report.html and a short text for the console.
// A rate is the share of duels won (a draw counts half) with its 95% Wilson interval: a piece is called
// strong or weak only when the whole interval clears the line (data/balance/rules.js `arena`).
import {RULES} from '../src/data/balance/rules.js';

const Z = 1.96;
function wilson(score, n) {
  if (!n) return [0, 1];
  const p = score / n, d = 1 + Z * Z / n, c = (p + Z * Z / (2 * n)) / d, h = Z * Math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[(s.length - 1) >> 1]; };

// every duel seen from both sides: the fighter, the one it faced, how it went for it
function sides(results) {
  const out = [];
  for (const r of results) for (const [me, foe, k] of [[r.a, r.b, 'a'], [r.b, r.a, 'b']]) {
    out.push({r, me, foe, score: r.winner === k ? 1 : r.winner === 'draw' ? 0.5 : 0, won: r.winner === k, kind: r.kind, tier: r.tier, ticks: r.ticks});
  }
  return out;
}

function group(xs, key, label = k => k) {
  const m = new Map();
  for (const x of xs) { const k = key(x); if (k == null) continue; let g = m.get(k); if (!g) m.set(k, g = {key: k, n: 0, score: 0, ticks: []}); g.n++; g.score += x.score; if (x.won) g.ticks.push(x.ticks); }
  return [...m.values()].map(g => {
    const [lo, hi] = wilson(g.score, g.n), A = RULES.arena;
    const verdict = g.n < A.minN ? '' : lo > A.strong ? 'strong' : hi < A.weak ? 'weak' : '';
    return {key: g.key, label: label(g.key), n: g.n, rate: g.score / g.n, lo, hi, verdict, ticks: median(g.ticks)};
  }).sort((a, b) => b.rate - a.rate);
}

function matrix(xs, key, label) {
  const keys = [...new Set(xs.map(x => key(x.me)))].filter(k => k != null);
  const order = group(xs, x => key(x.me)).map(g => g.key);
  const cells = {};
  for (const x of xs) { const a = key(x.me), b = key(x.foe); if (a == null || b == null) continue; const c = (cells[a + '|' + b] ||= {n: 0, score: 0}); c.n++; c.score += x.score; }
  return {keys: order.filter(k => keys.includes(k)), labels: Object.fromEntries(order.map(k => [k, label(k)])),
    cells: Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, {n: c.n, rate: c.score / c.n}]))};
}

const bucket = (v, edges) => { if (v == null) return null; for (const [lo, hi, name] of edges) if (v >= lo && v < hi) return name; return null; };
const STAT_EDGES = [[0, 4, '1–3'], [4, 7, '4–6'], [7, 10, '7–9'], [10, 13, '10–12'], [13, 99, '13+']];
const SKILL_EDGES = [[0, 0.2, '0–0.2'], [0.2, 0.4, '0.2–0.4'], [0.4, 0.6, '0.4–0.6'], [0.6, 0.8, '0.6–0.8'], [0.8, 1.01, '0.8–1']];
const DIFF_EDGES = [[-2, -0.5, '≤ −0.5'], [-0.5, -0.2, '−0.5…−0.2'], [-0.2, 0.2, 'около 0'], [0.2, 0.5, '+0.2…+0.5'], [0.5, 2, '≥ +0.5']];
const byEdges = edges => g => edges.findIndex(e => e[2] === g.key);

// What each thing is worth with everything else held equal: a logistic regression of the duel's outcome
// on the differences between the two fighters. β is the change in log-odds per unit; at an even fight
// β / 4 is the change in the chance to win. Only melee duels of two armed fighters (a bow's worth
// depends on the distance, not on PL). A feature that does not vary in the run is left out.
const FEATURES = [
  {id: 'atk', label: 'оружие: +1 PL атаки', x: f => f.atk},
  {id: 'def', label: 'броня и щит: +1 PL защиты', x: f => f.def},
  {id: 'S', label: 'Сила +1', x: f => f.S}, {id: 'E', label: 'Выносливость +1', x: f => f.E},
  {id: 'A', label: 'Ловкость +1', x: f => f.A}, {id: 'L', label: 'Удача +1', x: f => f.L}, {id: 'P', label: 'Восприятие +1', x: f => f.P},
  {id: 'skill', label: 'навык боя +0.1', x: f => f.skill * 10},
  {id: 'size', label: 'вид вдвое крепче телом', x: f => Math.log2(f.size)},
];
function solve(A, b) {   // Gaussian elimination with partial pivoting; A is n×n
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const k = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function model(results) {
  const rows = results.filter(r => r.kind !== 'foe' && r.a.weapon && r.b.weapon && !r.a.ranged && !r.b.ranged);
  if (rows.length < 200) return null;
  const vary = FEATURES.filter(f => rows.some(r => Math.abs(f.x(r.a) - f.x(r.b)) > 1e-9));
  const X = rows.map(r => vary.map(f => f.x(r.a) - f.x(r.b))), y = rows.map(r => (r.winner === 'a' ? 1 : r.winner === 'draw' ? 0.5 : 0));
  const k = vary.length; let beta = new Array(k).fill(0), H = null;
  for (let it = 0; it < 30; it++) {
    const g = new Array(k).fill(0); H = Array.from({length: k}, (_, i) => Array.from({length: k}, (_, j) => (i === j ? 1e-3 : 0)));
    for (let n = 0; n < X.length; n++) {
      const z = X[n].reduce((s, v, i) => s + v * beta[i], 0), p = 1 / (1 + Math.exp(-z)), wgt = p * (1 - p);
      for (let i = 0; i < k; i++) { g[i] += X[n][i] * (y[n] - p); for (let j = 0; j < k; j++) H[i][j] += X[n][i] * X[n][j] * wgt; }
    }
    const d = solve(H, g); beta = beta.map((b, i) => b + d[i]);
    if (Math.max(...d.map(Math.abs)) < 1e-7) break;
  }
  const inv = vary.map((_, i) => solve(H, vary.map((_, j) => (i === j ? 1 : 0))));
  const out = vary.map((f, i) => { const se = Math.sqrt(Math.max(0, inv[i][i])); return {id: f.id, label: f.label, beta: beta[i], se, pp: beta[i] / 4, lo: (beta[i] - Z * se) / 4, hi: (beta[i] + Z * se) / 4}; });
  const atk = out.find(f => f.id === 'atk');
  for (const f of out) f.perAtk = atk && Math.abs(atk.beta) > 1e-9 ? f.beta / atk.beta : null;   // how many PL of weapon it is worth
  return {n: rows.length, features: out};
}

export function analyse(results, {opt, names, version, tiers, seconds}) {
  const S = sides(results), item = id => names.items[id] || id, sp = id => names.species[id] || id;
  const kit = f => (f.weapon ? item(f.weapon) + (f.wq ? ` +${f.wq}` : '') + (f.shield ? ' + ' + item(f.shield) : '') : null);
  const same = S.filter(x => x.kind === 'same');
  const out = {version, created: new Date().toISOString(), seconds, opt: {...opt, raceIds: undefined}, rules: RULES.arena,
    fights: results.length, draws: results.filter(r => r.winner === 'draw').length,
    kinds: Object.fromEntries(['same', 'cross', 'foe'].map(k => [k, results.filter(r => r.kind === k).length])),
    ticks: median(results.map(r => r.ticks)), tiers: []};

  for (const T of tiers) {
    const xs = same.filter(x => x.tier === T);
    if (!xs.length) continue;
    const one = xs.filter(x => names.hands[x.me.weapon] === 1);   // a shield is a choice only beside a one-hander
    out.tiers.push({
      tier: T, duels: xs.length / 2, ticks: median(xs.map(x => x.ticks)),
      weapons: group(xs, x => x.me.weapon, item),
      kits: group(xs, x => kit(x.me)),
      armor: group(xs, x => x.me.body || '—', k => (k === '—' ? 'без брони' : item(k))),
      shield: group(one, x => (x.me.shield ? 'со щитом' : 'без щита')),
      quality: opt.quality === 'mix' ? group(xs, x => x.me.wq, q => `оружие +${q}`) : null,
      matrix: matrix(xs, f => f.weapon, item),
    });
  }
  out.races = group(same, x => x.me.species, sp);
  out.raceMatrix = matrix(same, f => f.species, sp);
  out.skill = group(same, x => bucket(x.me.skill, SKILL_EDGES)).sort((a, b) => byEdges(SKILL_EDGES)(a) - byEdges(SKILL_EDGES)(b));
  out.skillDiff = group(same, x => bucket(x.me.skill - x.foe.skill, DIFF_EDGES)).sort((a, b) => byEdges(DIFF_EDGES)(a) - byEdges(DIFF_EDGES)(b));
  out.stats = Object.fromEntries(['S', 'P', 'E', 'A', 'L'].map(k => [k, group(same, x => bucket(x.me[k], STAT_EDGES)).sort((a, b) => byEdges(STAT_EDGES)(a) - byEdges(STAT_EDGES)(b))]));
  out.statsVaried = opt.stats !== 'norm';
  out.model = model(results);
  out.skillVaried = opt.skill === 'random';

  // a lower tier against the next one: how often the weaker gear wins
  const cross = S.filter(x => x.kind === 'cross');
  out.cross = tiers.filter(T => cross.some(x => x.me.tier === T && x.foe.tier === T + 1)).map(T => {
    const lo = cross.filter(x => x.me.tier === T && x.foe.tier === T + 1);
    return {lower: T, upper: T + 1, duels: lo.length, upset: lo.reduce((s, x) => s + x.score, 0) / lo.length,
      weapons: group(lo, x => x.me.weapon, item), races: group(lo, x => x.me.species, sp)};
  });

  // creatures: the armed side against each one
  const foes = S.filter(x => x.kind === 'foe' && x.me.weapon);
  out.foes = [...new Set(foes.map(x => x.foe.species))].map(f => {
    const xs = foes.filter(x => x.foe.species === f);
    return {species: f, label: sp(f), duels: xs.length, rate: xs.reduce((s, x) => s + x.score, 0) / xs.length,
      tiers: group(xs, x => x.tier, t => `тир ${t}`).sort((a, b) => a.key - b.key), weapons: group(xs, x => x.me.weapon, item)};
  });
  return out;
}

// ── console ──────────────────────────────────────────────────────────────────
const pct = x => (x * 100).toFixed(0) + '%';
const ci = g => `${pct(g.rate)} [${pct(g.lo)}…${pct(g.hi)}]`;
const mark = g => (g.verdict === 'strong' ? ' ▲ доминирует' : g.verdict === 'weak' ? ' ▼ отстаёт' : '');

export function consoleSummary(s) {
  const L = [];
  L.push(`\n${s.fights} боёв: в своём тире ${s.kinds.same}, тир против следующего ${s.kinds.cross}, против существ ${s.kinds.foe}; ничьих ${s.draws}; бой длится ~${s.ticks} тиков`);
  for (const t of s.tiers) {
    L.push(`\nТир ${t.tier} (${t.duels} боёв, ~${t.ticks} тиков) — оружие, доля побед [95%]:`);
    for (const g of t.weapons) L.push(`  ${g.label.padEnd(16)} ${ci(g).padEnd(16)} n=${String(g.n).padEnd(5)}${mark(g)}`);
    const sh = t.shield.find(g => g.key === 'со щитом'), no = t.shield.find(g => g.key === 'без щита');
    if (sh && no) L.push(`  щит у одноручного: ${pct(sh.rate)} против ${pct(no.rate)} без него`);
    const ar = t.armor.filter(g => g.verdict);
    if (ar.length) L.push(`  броня: ${ar.map(g => g.label + mark(g)).join(', ')}`);
  }
  if (s.races.length > 1) L.push(`\nРасы (все тиры): ${s.races.map(g => `${g.label} ${pct(g.rate)}`).join(' · ')}`);
  if (s.skillVaried) L.push(`Навык: ${s.skill.map(g => `${g.key} → ${pct(g.rate)}`).join(' · ')}`);
  if (s.statsVaried) for (const k of ['S', 'A', 'E', 'L']) if (s.stats[k].length > 1) L.push(`${k}: ${s.stats[k].map(g => `${g.key} → ${pct(g.rate)}`).join(' · ')}`);
  if (s.model) {
    L.push(`\nПри прочих равных (${s.model.n} ближних боёв): что даёт к шансу победы в равном бою, и сколько это PL оружия`);
    for (const f of s.model.features) L.push(`  ${f.label.padEnd(28)} ${(f.pp >= 0 ? '+' : '') + (f.pp * 100).toFixed(1)} п.п. [${(f.lo * 100).toFixed(1)}…${(f.hi * 100).toFixed(1)}]${f.perAtk != null && f.id !== 'atk' ? `   ≈ ${f.perAtk.toFixed(2)} PL оружия` : ''}`);
  }
  for (const c of s.cross) L.push(`Тир ${c.lower} против тира ${c.upper}: слабое снаряжение побеждает в ${pct(c.upset)} боёв (${c.duels})`);
  for (const f of s.foes) L.push(`Против: ${f.label} — ${pct(f.rate)} (${f.duels}); по тирам ${f.tiers.map(g => `${g.key}: ${pct(g.rate)}`).join(', ')}`);
  return L.join('\n');
}

// ── report.html ──────────────────────────────────────────────────────────────
const esc = x => String(x).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
// a win rate as a cell colour: blue above a half, red below, the further the stronger
const heat = r => { const d = Math.min(1, Math.abs(r - 0.5) * 2.4); return `background:color-mix(in srgb, var(${r >= 0.5 ? '--good' : '--bad'}) ${Math.round(d * 55)}%, transparent)`; };
const verdictTag = g => (g.verdict === 'strong' ? '<span class="tag up">доминирует</span>' : g.verdict === 'weak' ? '<span class="tag down">отстаёт</span>' : '');

function table(rows, {first = 'что', extra = true} = {}) {
  if (!rows?.length) return '<p class="muted">нет данных</p>';
  return `<div class="scroll"><table><thead><tr><th>${esc(first)}</th><th>побед</th><th>95%</th><th>боёв</th>${extra ? '<th>тиков до победы</th>' : ''}<th></th></tr></thead><tbody>${rows.map(g =>
    `<tr><td>${esc(g.label)}</td><td style="${heat(g.rate)}">${pct(g.rate)}</td><td class="muted">${pct(g.lo)}…${pct(g.hi)}</td><td>${g.n}</td>${extra ? `<td>${g.ticks ?? '—'}</td>` : ''}<td>${verdictTag(g)}</td></tr>`).join('')}</tbody></table></div>`;
}

function grid(m, note) {
  if (!m.keys.length) return '';
  return `<div class="scroll"><table class="mx"><thead><tr><th>${esc(note)}</th>${m.keys.map(k => `<th>${esc(m.labels[k])}</th>`).join('')}</tr></thead><tbody>${m.keys.map(a =>
    `<tr><td>${esc(m.labels[a])}</td>${m.keys.map(b => { const c = m.cells[a + '|' + b]; return c ? `<td style="${heat(c.rate)}" title="${c.n} боёв">${a === b ? '·' : pct(c.rate)}</td>` : '<td class="muted">—</td>'; }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function renderArena(s) {
  const o = s.opt;
  const setup = [`боёв ${s.fights}`, `расы: ${o.races === 'all' ? 'все' : o.races}`, `SPECIAL: ${o.stats === 'norm' ? 'все 5' : 'по расе'}`, `навык: ${o.skill === 'random' ? 'случайный 0–1' : o.skill}`,
    `броня: ${{tier: 'своего тира', any: 'любая до тира', none: 'без брони'}[o.armor] || o.armor}`, `щит у одноручного: ${pct(o.shield)}`, `качество: ${o.quality === 'mix' ? 'смесь +0…+3' : 'только +0'}`,
    `старт на ${o.distance} клетках`, `сид «${o.seed}»`].join(' · ');
  const tiers = s.tiers.map(t => `
  <section class="card"><h2>Тир ${t.tier}</h2><p class="muted">${t.duels} боёв в своём тире, бой длится ~${t.ticks} тиков</p>
    <div class="grid2">
      <div><h3>Оружие</h3>${table(t.weapons, {first: 'оружие'})}</div>
      <div><h3>Набор в руках</h3>${table(t.kits, {first: 'в руках'})}</div>
      <div><h3>Броня</h3>${table(t.armor, {first: 'на теле'})}</div>
      <div><h3>Щит при одноручном</h3>${table(t.shield, {first: '', extra: false})}${t.quality ? `<h3>Качество оружия</h3>${table(t.quality, {first: '', extra: false})}` : ''}</div>
    </div>
    <h3>Кто кого: доля побед строки над столбцом</h3>${grid(t.matrix, 'оружие')}
  </section>`).join('');
  const statRows = Object.entries(s.stats).filter(([, g]) => g.length > 1);
  const names = {S: 'Сила', P: 'Восприятие', E: 'Выносливость', A: 'Ловкость', L: 'Удача'};
  const body = `
  <header><h1>Арена</h1><p class="sub">${esc(setup)}</p>
  <p class="muted">${esc(s.version)} · ${new Date(s.created).toLocaleString('ru-RU')} · ${s.seconds.toFixed(0)} с · ничьих ${s.draws}. Доля побед считает ничью за половину; «доминирует» — весь 95% интервал выше ${pct(s.rules.strong)}, «отстаёт» — ниже ${pct(s.rules.weak)} (data/balance/rules.js). Бой — настоящая задача <code>fight</code> из игры, без бегства и помощи.</p></header>
  ${s.model ? `<section class="card"><h2>При прочих равных</h2><p class="muted">Логистическая регрессия исхода по разнице двух бойцов, ${s.model.n} ближних боёв (лук и праща не входят: их сила зависит от дистанции). «К шансу» — насколько вырастает шанс победы в равном бою; «в PL оружия» — сколько уровней оружия стоит эта прибавка. Это и есть курс обмена: сколько Силы орка покрывает ступень материала.</p>
    <div class="scroll"><table><thead><tr><th>что</th><th>к шансу</th><th>95%</th><th>в PL оружия</th></tr></thead><tbody>${s.model.features.map(f => `<tr><td>${esc(f.label)}</td><td>${(f.pp >= 0 ? '+' : '') + (f.pp * 100).toFixed(1)} п.п.</td><td class="muted">${(f.lo * 100).toFixed(1)}…${(f.hi * 100).toFixed(1)}</td><td>${f.perAtk == null ? '—' : f.perAtk.toFixed(2)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
  ${tiers}
  ${s.races.length > 1 ? `<section class="card"><h2>Расы</h2><p class="muted">все тиры вместе, снаряжение у обоих из одного тира</p><div class="grid2"><div>${table(s.races, {first: 'раса'})}</div><div>${grid(s.raceMatrix, 'раса')}</div></div></section>` : ''}
  ${s.skillVaried || statRows.length && s.statsVaried ? `<section class="card"><h2>Навык и SPECIAL</h2><div class="grid2">
    ${s.skillVaried ? `<div><h3>Свой навык боя</h3>${table(s.skill, {first: 'навык', extra: false})}</div><div><h3>Навык против навыка противника</h3>${table(s.skillDiff, {first: 'разница', extra: false})}</div>` : ''}
    ${s.statsVaried ? statRows.map(([k, g]) => `<div><h3>${names[k]}</h3>${table(g, {first: k, extra: false})}</div>`).join('') : ''}
  </div></section>` : ''}
  ${s.cross.length ? `<section class="card"><h2>Тир против следующего</h2><p class="muted">Как часто снаряжение тира ниже побеждает снаряжение тира выше. Раса, SPECIAL и навык у обоих случайные.</p>${s.cross.map(c => `
    <h3>Тир ${c.lower} против тира ${c.upper}: ${pct(c.upset)} побед слабого (${c.duels} боёв)</h3><div class="grid2"><div>${table(c.weapons, {first: 'оружие тира ' + c.lower})}</div><div>${table(c.races, {first: 'раса'})}</div></div>`).join('')}</section>` : ''}
  ${s.foes.length ? `<section class="card"><h2>Против существ</h2>${s.foes.map(f => `<h3>${esc(f.label)}: ${pct(f.rate)} побед вооружённого (${f.duels} боёв)</h3><div class="grid2"><div>${table(f.tiers, {first: 'тир'})}</div><div>${table(f.weapons, {first: 'оружие'})}</div></div>`).join('')}</section>` : ''}`;
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Арена</title>
<style>
:root{color-scheme:light;--bg:#f6f5f1;--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--muted:#8a8984;--grid:#e6e4de;--line:#d6d4cc;--good:#2a78d6;--bad:#e34948}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#121211;--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--muted:#8f8e86;--grid:#2c2c2a;--line:#3a3a37;--good:#3987e5;--bad:#e66767}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#121211;--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--muted:#8f8e86;--grid:#2c2c2a;--line:#3a3a37;--good:#3987e5;--bad:#e66767}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 48px;display:flex;flex-direction:column;gap:18px}
h1{font-size:24px;margin:0 0 4px} h2{font-size:17px;margin:0 0 2px} h3{font-size:13px;margin:14px 0 6px;color:var(--ink2)} p{margin:0 0 4px}
.sub{color:var(--ink2)} .muted{color:var(--muted);font-size:12px} code{font-size:12px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px;min-width:0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px} @media(max-width:820px){.grid2{grid-template-columns:1fr}}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{padding:5px 8px;text-align:right;border-bottom:1px solid var(--grid);white-space:nowrap}
th:first-child,td:first-child{text-align:left} th{color:var(--ink2);font-weight:600;font-size:12px}
.mx td,.mx th{text-align:center} .mx td:first-child,.mx th:first-child{text-align:left}
.tag{font-size:11px;padding:1px 6px;border-radius:8px;border:1px solid currentColor}
.tag.up{color:var(--good)} .tag.down{color:var(--bad)}
</style></head><body><main>${body}</main></body></html>`;
}
