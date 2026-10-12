// Turns a balance run's summary.json into one self-contained report.html (no network needed).
// Charts are plain SVG drawn by a small script inside the page; the data is embedded as JSON.

export function renderReport(summary) {
  const data = JSON.stringify(summary).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Балансный прогон</title>
<style>
:root{color-scheme:light;--bg:#f6f5f1;--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--muted:#8a8984;--grid:#e6e4de;--line:#d6d4cc;
--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--s6:#008300;--s7:#6250d6;--s8:#e34948;--bad:#c2410c}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#121211;--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--muted:#8f8e86;--grid:#2c2c2a;--line:#3a3a37;
--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;--s7:#9085e9;--s8:#e66767;--bad:#f0855a}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#121211;--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--muted:#8f8e86;--grid:#2c2c2a;--line:#3a3a37;
--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;--s7:#9085e9;--s8:#e66767;--bad:#f0855a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1080px;margin:0 auto;padding:24px 16px 48px;display:flex;flex-direction:column;gap:18px}
h1{font-size:24px;margin:0} h2{font-size:16px;margin:0 0 4px} p{margin:0}
.sub{color:var(--ink2)} .muted{color:var(--muted);font-size:12px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px;min-width:0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px} @media(max-width:820px){.grid2{grid-template-columns:1fr}}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{padding:6px 8px;text-align:right;border-bottom:1px solid var(--grid);white-space:nowrap}
th:first-child,td:first-child{text-align:left} th{color:var(--ink2);font-weight:600;font-size:12px}
.scroll{overflow-x:auto}
.key{display:inline-block;width:14px;height:3px;border-radius:2px;vertical-align:middle;margin-right:6px}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--ink2);margin:6px 0}
.legend .sw{display:inline-block;width:10px;height:10px;border-radius:2px;vertical-align:-1px;margin-right:5px}
.controls{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin:6px 0 4px}
select{font:inherit;padding:4px 6px;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink)}
svg{display:block;width:100%;height:auto;overflow:visible}
svg text{fill:var(--muted);font-size:11px}
.chart{position:relative}
.tip{position:absolute;pointer-events:none;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:12px;box-shadow:0 4px 14px rgba(0,0,0,.12);display:none;white-space:nowrap;z-index:2}
.tip b{font-variant-numeric:tabular-nums;color:var(--ink)} .tip .h{color:var(--ink2);margin-bottom:2px}
.fall{color:var(--bad)}
details summary{cursor:pointer;color:var(--ink2)}
</style></head><body><main>
<header><h1>Балансный прогон</h1><p class="sub" id="meta"></p></header>
<section class="card"><h2>Итоги по вариантам</h2><p class="muted">Медианы по сидам на конец прогона. «Предел скорости» — во сколько раз игра может обгонять 1× на этом размере карты, если тик занимает не больше половины кадра.</p>
<div class="scroll"><table id="tbl"></table></div><div id="falls"></div></section>
<div class="grid2">
<section class="card"><h2>Сколько поселений живо</h2><p class="muted">Доля сидов, где поселение ещё стоит к этому дню.</p><div class="legend" id="lg1"></div><div class="chart" id="c1"></div></section>
<section class="card"><h2>Причины смертей</h2><p class="muted">Среднее число погибших за прогон на одну игру.</p><div class="legend" id="lg3"></div><div class="chart" id="c3"></div>
<details><summary>Таблица</summary><div class="scroll"><table id="tbl3"></table></div></details></section>
</div>
<section class="card"><h2>Показатель по дням</h2>
<div class="controls"><label>Показатель <select id="metric"></select></label><label>Разброс <select id="band"><option value="iqr">25–75%</option><option value="wide">10–90%</option><option value="none">нет</option></select></label></div>
<p class="muted">Линия — медиана по сидам, полоса — разброс между сидами. Павшее поселение считается с нулём жителей.</p>
<div class="legend" id="lg2"></div><div class="chart" id="c2"></div>
<details><summary>Таблица значений</summary><div class="scroll"><table id="tbl2"></table></div></details></section>
</main>
<script>
const S = ${data};
const COLORS = ['--s1','--s2','--s3','--s4','--s5','--s6','--s7','--s8'].map(v => 'var(' + v + ')');
const col = i => COLORS[i % COLORS.length];
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const h = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const fmt = (x, d = 0) => x == null || Number.isNaN(x) ? '—' : (+x).toLocaleString('ru-RU', {maximumFractionDigits: d, minimumFractionDigits: d});
const V = S.variants, many = V.length > 1;

// ── header
const o = S.options, changed = Object.entries(o.set).map(([k, v]) => k + '=' + v).join(', ');
document.getElementById('meta').textContent = 'Версия ' + S.version + ' · ' + new Date(S.created).toLocaleString('ru-RU') + ' · ' + o.seeds + ' сидов × ' + o.days + ' дней' +
  ' · карта ' + S.base.size + (changed ? ' · настройки: ' + changed : '') + (o.vary.length ? ' · сравниваем: ' + o.vary.map(v => v[0]).join(', ') : '');

// ── summary table
(function () {
  const t = document.getElementById('tbl');
  const cols = [['Вариант'], ['Выжили'], ['Жители'], ['Пик'], ['Смерти'], ['Набеги'], ['Убито налётчиков'], ['Здания'], ['Еда'], ['Настроение'], ['мс/тик'], ['Предел скорости']];
  const tr = h('tr'); for (const [c] of cols) tr.appendChild(h('th', c)); t.appendChild(tr);
  V.forEach((v, i) => {
    const f = v.final, r = h('tr'), first = h('td');
    if (many) { const k = h('span', null, 'key'); k.style.background = col(i); first.appendChild(k); }
    first.appendChild(document.createTextNode(v.label));
    r.appendChild(first);
    const cells = [Math.round(v.survival * 100) + '%', fmt(f.pop), fmt(f.peakPop), fmt(f.deaths), fmt(f.raids), fmt(f.raidersKilled), fmt(f.buildings), fmt(f.food), fmt(f.mood, 2),
      fmt(v.perf.msPerTick, 2) + ' (p90 ' + fmt(v.perf.p90, 2) + ')', '×' + fmt(Math.floor(25 / v.perf.p90))];
    for (const c of cells) r.appendChild(h('td', c));
    t.appendChild(r);
  });
  const box = document.getElementById('falls');
  for (const v of V) if (v.falls.length) {
    const days = v.falls.map(x => +x.day).sort((a, b) => a - b), mid = days[Math.floor((days.length - 1) / 2)];
    const raided = v.falls.filter(x => x.reason === 'raided').length;
    const d = h('details'); d.style.marginTop = '8px';
    const sm = h('summary');
    sm.appendChild(h('span', (many ? v.label + ': ' : '') + 'пало ' + v.falls.length + ' из ' + v.runs, 'fall'));
    sm.appendChild(document.createTextNode(' · медиана ' + fmt(mid, 1) + ' дн., раньше всех — ' + fmt(days[0], 1) + ' дн.' + (raided ? ' · разорено налётчиками: ' + raided : '')));
    d.appendChild(sm);
    d.appendChild(h('p', v.falls.map(x => 'сид ' + x.seed + ': ' + fmt(x.day, 1) + ' дн.' + (x.reason === 'raided' ? '' : ' (никого не осталось)')).join(' · '), 'muted'));
    box.appendChild(d);
  }
})();

function legend(id, items, shape = 'line') {
  const box = document.getElementById(id); box.textContent = '';
  if (items.length < 2) return;
  for (const [label, c] of items) { const s = h('span'); const k = h('span', null, shape === 'line' ? 'key' : 'sw'); k.style.background = c; s.appendChild(k); s.appendChild(document.createTextNode(label)); box.appendChild(s); }
}

const niceMax = m => { if (m <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(m))), n = m / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };

// line chart over days: series = [{label, color, pts: [[day, y, lo, hi]]}]
function lineChart(boxId, series, {yMax, yFmt = y => fmt(y), unit = ''} = {}) {
  const box = document.getElementById(boxId); box.textContent = '';
  const W = Math.max(280, box.clientWidth), H = Math.round(Math.min(300, Math.max(200, W * 0.42))), L = 44, R = 12, T = 10, B = 26;
  const days = S.options.days, all = series.flatMap(s => s.pts.flatMap(p => [p[1], p[3] ?? p[1]]));
  const top = yMax ?? niceMax(Math.max(...all, 0) * 1.05);
  const x = d => L + (d - 1) / Math.max(1, days - 1) * (W - L - R), y = v => T + (1 - v / top) * (H - T - B);
  const svg = el('svg', {viewBox: '0 0 ' + W + ' ' + H, role: 'img'}, box);
  for (let k = 0; k <= 4; k++) { const v = top * k / 4; el('line', {x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: 'var(--grid)', 'stroke-width': 1}, svg); el('text', {x: L - 6, y: y(v) + 4, 'text-anchor': 'end'}, svg).textContent = yFmt(v) + unit; }
  const step = days <= 15 && W > 480 ? 1 : days <= 40 ? 5 : 10;
  for (let d = 1; d <= days; d++) if (d === 1 || d % step === 0) el('text', {x: x(d), y: H - 8, 'text-anchor': 'middle'}, svg).textContent = d;
  for (const s of series) if (s.pts[0]?.[2] != null) {
    const up = s.pts.map(p => x(p[0]) + ',' + y(p[3])).join(' '), dn = s.pts.slice().reverse().map(p => x(p[0]) + ',' + y(p[2])).join(' ');
    el('polygon', {points: up + ' ' + dn, fill: s.color, 'fill-opacity': series.length > 2 ? 0.08 : 0.14}, svg);
  }
  for (const s of series) el('polyline', {points: s.pts.map(p => x(p[0]) + ',' + y(p[1])).join(' '), fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'}, svg);
  // hover: crosshair snaps to the nearest day, the tooltip lists every series
  const cross = el('line', {y1: T, y2: H - B, stroke: 'var(--muted)', 'stroke-width': 1, visibility: 'hidden'}, svg);
  const dots = series.map(s => el('circle', {r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden'}, svg));
  const tip = h('div', null, 'tip'); box.appendChild(tip);
  const hit = el('rect', {x: L, y: T, width: W - L - R, height: H - T - B, fill: 'transparent', tabindex: 0}, svg);
  const show = d => {
    cross.setAttribute('x1', x(d)); cross.setAttribute('x2', x(d)); cross.setAttribute('visibility', 'visible');
    tip.textContent = ''; tip.appendChild(h('div', 'День ' + d, 'h'));
    series.forEach((s, i) => {
      const p = s.pts.find(q => q[0] === d); if (!p) { dots[i].setAttribute('visibility', 'hidden'); return; }
      dots[i].setAttribute('cx', x(d)); dots[i].setAttribute('cy', y(p[1])); dots[i].setAttribute('visibility', 'visible');
      const row = h('div'); const k = h('span', null, 'key'); k.style.background = s.color; row.appendChild(k);
      row.appendChild(h('b', yFmt(p[1]) + unit)); if (p[2] != null) row.appendChild(document.createTextNode(' (' + yFmt(p[2]) + '…' + yFmt(p[3]) + ')'));
      if (series.length > 1) row.appendChild(document.createTextNode(' ' + s.label));
      tip.appendChild(row);
    });
    tip.style.display = 'block';
    const px = x(d);
    tip.style.left = Math.max(0, px + 12 + tip.offsetWidth > W ? px - 12 - tip.offsetWidth : px + 12) + 'px'; tip.style.top = '8px';
  };
  const hide = () => { cross.setAttribute('visibility', 'hidden'); dots.forEach(c => c.setAttribute('visibility', 'hidden')); tip.style.display = 'none'; };
  let cur = 1;
  hit.addEventListener('pointermove', e => { const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W; cur = Math.max(1, Math.min(days, Math.round(1 + (px - L) / (W - L - R) * (days - 1)))); show(cur); });
  hit.addEventListener('pointerleave', hide); hit.addEventListener('blur', hide);
  hit.addEventListener('focus', () => show(cur));
  hit.addEventListener('keydown', e => { if (e.key === 'ArrowRight') cur = Math.min(days, cur + 1); else if (e.key === 'ArrowLeft') cur = Math.max(1, cur - 1); else return; e.preventDefault(); show(cur); });
}

// ── survival
legend('lg1', V.map((v, i) => [v.label, col(i)]));

// ── metric picker
const sel = document.getElementById('metric'), band = document.getElementById('band');
const groups = {};
for (const m of S.metrics) (groups[m.group] ||= []).push(m);
for (const [g, ms] of Object.entries(groups)) { const og = document.createElement('optgroup'); og.label = g; for (const m of ms) { const op = h('option', m.label); op.value = m.id; og.appendChild(op); } sel.appendChild(og); }
sel.value = 'pop';
function drawMetric() {
  const m = S.metrics.find(x => x.id === sel.value), b = band.value, lo = b === 'wide' ? 0 : 1, hi = b === 'wide' ? 4 : 3;
  legend('lg2', V.map((v, i) => [v.label, col(i)]));
  lineChart('c2', V.map((v, i) => ({label: v.label, color: col(i), pts: v.byDay.map(r => { const q = r.m[m.id]; return b === 'none' ? [r.day, q[2]] : [r.day, q[2], q[lo], q[hi]]; })})), {yFmt: y => fmt(y, m.fmt)});
  const t = document.getElementById('tbl2'); t.textContent = '';
  const tr = h('tr'); tr.appendChild(h('th', 'День')); for (const v of V) tr.appendChild(h('th', (many ? v.label + ': ' : '') + 'медиана (25–75%)')); t.appendChild(tr);
  for (let d = 0; d < S.options.days; d++) { const r = h('tr'); r.appendChild(h('td', d + 1)); for (const v of V) { const q = v.byDay[d].m[m.id]; r.appendChild(h('td', fmt(q[2], m.fmt) + ' (' + fmt(q[1], m.fmt) + '…' + fmt(q[3], m.fmt) + ')')); } t.appendChild(r); }
}
sel.addEventListener('change', drawMetric); band.addEventListener('change', drawMetric);

// ── deaths by cause: one horizontal stacked bar per variant
function drawDeaths() {
  // causes take their own slots (red, violet, yellow) so they never look like a variant
  const causes = [['deathsRaid', 'налётчики', 'var(--s8)'], ['deathsWolf', 'волки', 'var(--s7)'], ['deathsOther', 'голод, холод, огонь', 'var(--s4)']];
  legend('lg3', causes.map(([, l, c]) => [l, c]), 'box');
  const box = document.getElementById('c3'); box.textContent = '';
  const W = Math.max(280, box.clientWidth), rowH = 30, L = Math.min(150, W * 0.3), R = 44, H = V.length * rowH + 24;
  const svg = el('svg', {viewBox: '0 0 ' + W + ' ' + H}, box), tip = h('div', null, 'tip'); box.appendChild(tip);
  const max = niceMax(Math.max(0.5, ...V.map(v => causes.reduce((s, [k]) => s + v.deathsMean[k], 0))));
  const x = v => L + v / max * (W - L - R);
  for (let k = 0; k <= 4; k++) { const v = max * k / 4; el('line', {x1: x(v), x2: x(v), y1: 0, y2: H - 20, stroke: 'var(--grid)'}, svg); el('text', {x: x(v), y: H - 6, 'text-anchor': 'middle'}, svg).textContent = fmt(v, 1); }
  V.forEach((v, r) => {
    const y = r * rowH + 6;
    const lab = el('text', {x: L - 8, y: y + 13, 'text-anchor': 'end'}, svg); lab.textContent = v.label.length > 22 ? v.label.slice(0, 21) + '…' : v.label;
    let acc = 0;
    causes.forEach(([k, l, c]) => {
      const val = v.deathsMean[k]; if (!val) return;
      const x0 = x(acc), x1 = x(acc + val); acc += val;
      const rect = el('rect', {x: x0 + (acc - val > 0 ? 1 : 0), y, width: Math.max(1, x1 - x0 - (acc - val > 0 ? 1 : 0)), height: 18, rx: 3, fill: c, tabindex: 0}, svg);
      const show = () => { tip.textContent = ''; tip.appendChild(h('b', fmt(val, 2))); tip.appendChild(document.createTextNode(' ' + l + (many ? ' · ' + v.label : ''))); tip.style.display = 'block'; tip.style.left = Math.max(0, Math.min(W - tip.offsetWidth - 4, x1)) + 'px'; tip.style.top = (y + 22) + 'px'; rect.setAttribute('opacity', 0.8); };
      const hide = () => { tip.style.display = 'none'; rect.setAttribute('opacity', 1); };
      rect.addEventListener('pointerenter', show); rect.addEventListener('pointerleave', hide); rect.addEventListener('focus', show); rect.addEventListener('blur', hide);
    });
    el('text', {x: x(acc) + 6, y: y + 13}, svg).textContent = fmt(acc, 1);
  });
  const t = document.getElementById('tbl3'); t.textContent = '';
  const tr = h('tr'); tr.appendChild(h('th', 'Вариант')); for (const [, l] of causes) tr.appendChild(h('th', l)); t.appendChild(tr);
  for (const v of V) { const r = h('tr'); r.appendChild(h('td', v.label)); for (const [k] of causes) r.appendChild(h('td', fmt(v.deathsMean[k], 2))); t.appendChild(r); }
}
const drawSurvival = () => lineChart('c1', V.map((v, i) => ({label: v.label, color: col(i), pts: v.byDay.map(r => [r.day, r.alive * 100])})), {yMax: 100, unit: '%'});
function drawAll() { drawSurvival(); drawMetric(); drawDeaths(); }
drawAll();
let rt = 0; let lastW = innerWidth;
addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rt); rt = setTimeout(drawAll, 150); });
</script></body></html>`;
}

// rebuild a report from an existing run: node tools/report.mjs runs/<folder>
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2];
  if (!dir) { console.log('usage: node tools/report.mjs runs/<folder>'); process.exit(1); }
  writeFileSync(join(dir, 'report.html'), renderReport(JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'))));
  console.log('ok', join(dir, 'report.html'));
}
