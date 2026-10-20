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
// Newton's method for a logistic regression without intercept unless a column of ones is given;
// y may be fractional (a draw is ½). Returns the coefficients, their standard errors and the log-likelihood.
function fitLogit(X, y) {
  const k = X[0]?.length || 0; let beta = new Array(k).fill(0), H = null;
  for (let it = 0; it < 40; it++) {
    const g = new Array(k).fill(0); H = Array.from({length: k}, (_, i) => Array.from({length: k}, (_, j) => (i === j ? 1e-3 : 0)));
    for (let n = 0; n < X.length; n++) {
      const z = X[n].reduce((s, v, i) => s + v * beta[i], 0), p = 1 / (1 + Math.exp(-z)), wgt = p * (1 - p);
      for (let i = 0; i < k; i++) { g[i] += X[n][i] * (y[n] - p); for (let j = 0; j < k; j++) H[i][j] += X[n][i] * X[n][j] * wgt; }
    }
    const d = solve(H, g); beta = beta.map((b, i) => b + d[i]);
    if (Math.max(...d.map(Math.abs)) < 1e-8) break;
  }
  const se = beta.map((_, i) => Math.sqrt(Math.max(0, solve(H, beta.map((_, j) => (i === j ? 1 : 0)))[i])));
  let ll = 0;
  for (let n = 0; n < X.length; n++) { const z = X[n].reduce((s, v, i) => s + v * beta[i], 0), p = Math.min(1 - 1e-12, Math.max(1e-12, 1 / (1 + Math.exp(-z)))); ll += y[n] * Math.log(p) + (1 - y[n]) * Math.log(1 - p); }
  return {beta, se, ll};
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

// ── parts 2 and 3: the strength rating against group battles ─────────────────
// Each battle: side A's and side B's total rating (data/balance/creatures.js) and who won.
// Part 2, the races:
//   calibration — do sides with equal totals win half the time, and the stronger side more the bigger the gap;
//   alpha       — which exponent makes the totals predict best (the ratings are recomputed for each);
//   ks          — with that alpha, which race (humans are the yardstick), tier or kind of weapon the rating
//                 misjudges: a factor m for each, such that the outcome follows ln(m·ΣA / ΣB);
//   crowd       — whether numbers win more than the totals say (then alpha is too high) or less.
// Part 3, the creatures: the races taken as calibrated, one factor m for each creature.
// What to write: a species with no `ks` yet gets m (it is being met for the first time); one that has it
// is moved half the way (× √m) only when m is sure (its 95% interval misses 1) and off by more than `adjustMin`.
const RATIO_EDGES = [[0, 0.67, 'A слабее в 1,5+ раза'], [0.67, 0.87, 'A слабее на 15–50%'], [0.87, 1.15, 'почти равны'], [1.15, 1.5, 'A сильнее на 15–50%'], [1.5, 99, 'A сильнее в 1,5+ раза']];
const yOf = battles => battles.map(r => (r.winner === 'a' ? 1 : r.winner === 'draw' ? 0.5 : 0));
const round2 = x => Math.round(x * 100) / 100;
function calibration(battles, x, y) {
  const cal = fitLogit(x.map(v => [1, v]), y);
  const bins = RATIO_EDGES.map(([lo, hi, label]) => {
    const idx = battles.map((_, n) => n).filter(n => Math.exp(x[n]) >= lo && Math.exp(x[n]) < hi);
    const sc = idx.reduce((t, n) => t + y[n], 0), [l, h] = wilson(sc, idx.length);
    const pred = idx.reduce((t, n) => t + 1 / (1 + Math.exp(-cal.beta[1] * x[n])), 0);
    return {label, n: idx.length, rate: idx.length ? sc / idx.length : null, lo: l, hi: h, pred: idx.length ? pred / idx.length : null};
  });
  return {bias: 1 / (1 + Math.exp(-cal.beta[0])), slope: cal.beta[1], bins};
}
// one factor per column of the fit: m = exp(γ / slope), with its 95% interval
function factors(fit, cols, battles, minN) {
  const b1 = fit.beta[0];
  return cols.map((c, i) => {
    const g = fit.beta[i + 1], se = fit.se[i + 1], n = battles.filter(r => c.f(r.a) || c.f(r.b)).length;
    const m = Math.exp(g / b1), lo = Math.exp((g - Z * se) / b1), hi = Math.exp((g + Z * se) / b1);
    return {id: c.id, n, m, lo, hi, sure: n >= minN && (lo > 1 || hi < 1) && Math.abs(Math.log(m)) > Math.log(1 + RULES.arena.adjustMin)};
  });
}
// what to write for a species: assign when it has no ks yet, refine when sure
// (a species already calibrated moves half the way: noise between seeds should not rock it)
function proposal(f, now, enough) {
  if (now == null) return enough ? round2(Math.min(10, Math.max(0.1, f.m))) : null;
  return f.sure ? round2(now * Math.sqrt(f.m)) : null;
}

export function analyseRaces(battles, S, sp, rangedIds = {}) {
  if (!battles.length) return null;
  const y = yOf(battles), A = RULES.arena;
  const ks = (side, alpha) => side.units.reduce((t, u) => t + S.base * (u.raw / S.refRaw) ** alpha * (S.ks[side.species] ?? 1), 0);
  const xAt = alpha => battles.map(r => Math.log(ks(r.a, alpha) / ks(r.b, alpha)));
  const cal = calibration(battles, xAt(S.alpha), y);
  const scan = [];
  for (let a = 0.3; a <= 1.2001; a += 0.05) { const xs = xAt(a), f = fitLogit(xs.map(x => [x]), y); scan.push({alpha: +a.toFixed(2), ll: f.ll}); }
  const best = scan.reduce((b, r) => (r.ll > b.ll ? r : b));
  const xb = xAt(best.alpha), refSp = S.ref.species;
  const kinds = [...new Set(battles.flatMap(r => [r.a.species, r.b.species]))].filter(k => k !== refSp);
  const tiersSeen = [...new Set(battles.flatMap(r => [r.a.tier, r.b.tier]).filter(t => t != null))].sort((a, b) => a - b).filter(t => t !== 0);
  // the share of a side's rating carried by bows and slings: its factor says whether shots are rated right
  const rangedShare = side => { let r = 0, t = 0; for (const u of side.units) { const k = (u.raw / S.refRaw) ** best.alpha; t += k; if (rangedIds[u.weapon]) r += k; } return t ? r / t : 0; };
  const cols = [...kinds.map(k => ({id: k, f: side => (side.species === k ? 1 : 0)})), ...tiersSeen.map(t => ({id: 'tier' + t, f: side => (side.tier === t ? 1 : 0)})), {id: 'ranged', f: rangedShare}];
  const fit = fitLogit(battles.map((r, n) => [xb[n], ...cols.map(c => c.f(r.a) - c.f(r.b))]), y);
  const fs = factors(fit, cols, battles, A.minN);
  const species = fs.slice(0, kinds.length).map(f => ({...f, label: sp(f.id), now: S.ks[f.id]})).sort((a, b) => a.m - b.m);
  for (const f of species) f.write = proposal(f, f.now, f.n >= A.minN);
  const tiers = fs.slice(kinds.length, kinds.length + tiersSeen.length).map((f, i) => ({...f, tier: tiersSeen[i]}));
  const rf = fs.at(-1);
  // rating ∝ offence^alpha and shots are a part of offence × rangedWeight: the weight moves by m^(1/alpha) at
  // most; half of that in log, as with ks, so that it settles rather than swings
  const ranged = {...rf, now: S.rangedWeight, suggest: rf.sure ? round2(S.rangedWeight * rf.m ** (0.5 / best.alpha)) : S.rangedWeight};
  const crowd = fitLogit(battles.map((r, n) => [xb[n], Math.log(r.a.n / r.b.n)]), y);
  return {n: battles.length, draws: battles.filter(r => r.winner === 'draw').length, ticks: median(battles.map(r => r.ticks)),
    alpha: S.alpha, base: S.base, ref: S.ref, ...cal, scan, best, species, tiers, ranged,
    crowd: {beta: crowd.beta[1] / crowd.beta[0], se: crowd.se[1] / Math.abs(crowd.beta[0])},
    writeAlpha: Math.abs(best.alpha - S.alpha) >= 0.05 - 1e-9 ? best.alpha : null,
    write: Object.fromEntries(species.filter(f => f.write != null).map(f => [f.id, f.write]))};
}

export function analyseCreatures(battles, S, sp, harmless = []) {
  if (!battles.length) return null;
  const y = yOf(battles), A = RULES.arena, x = battles.map(r => Math.log(r.a.ks / r.b.ks));
  const cal = calibration(battles, x, y);
  const kinds = [...new Set(battles.map(r => r.a.species))];
  const cols = kinds.map(k => ({id: k, f: side => (side.species === k ? 1 : 0)}));
  const fit = fitLogit(battles.map((r, n) => [x[n], ...cols.map(c => c.f(r.a) - c.f(r.b))]), y);
  const list = factors(fit, cols, battles, A.minN).map(f => {
    const mine = battles.filter(r => r.a.species === f.id);
    const even = mine.filter(r => Math.abs(Math.log(r.a.ks / r.b.ks)) < Math.log(1.5)).length;
    const won = mine.reduce((t, r) => t + (r.winner === 'a' ? 1 : r.winner === 'draw' ? 0.5 : 0), 0) / mine.length;
    const size = median(mine.map(r => r.a.n)), against = median(mine.map(r => r.b.n));
    return {...f, label: sp(f.id), now: S.ks[f.id], even, won, size, against, write: null};
  });
  // too few even battles: the creature is far stronger or weaker than any side the races could field
  for (const f of list) f.write = proposal(f, f.now, f.even >= 10);
  list.sort((a, b) => a.m - b.m);
  return {n: battles.length, draws: battles.filter(r => r.winner === 'draw').length, ticks: median(battles.map(r => r.ticks)), ...cal,
    list, harmless, write: Object.fromEntries(list.filter(f => f.write != null).map(f => [f.id, f.write]))};
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
  if (s.fights) L.push(`\nЧАСТЬ 1. ОРУЖИЕ`);
  if (s.fights) L.push(`${s.fights} боёв: в своём тире ${s.kinds.same}, тир против следующего ${s.kinds.cross}, против существ ${s.kinds.foe}; ничьих ${s.draws}; бой длится ~${s.ticks} тиков`);
  for (const t of s.tiers) {
    L.push(`\nТир ${t.tier} (${t.duels} боёв, ~${t.ticks} тиков) — оружие, доля побед [95%]:`);
    for (const g of t.weapons) L.push(`  ${g.label.padEnd(16)} ${ci(g).padEnd(16)} n=${String(g.n).padEnd(5)}${mark(g)}`);
    const sh = t.shield.find(g => g.key === 'со щитом'), no = t.shield.find(g => g.key === 'без щита');
    if (sh && no) L.push(`  щит у одноручного: ${pct(sh.rate)} против ${pct(no.rate)} без него`);
    const ar = t.armor.filter(g => g.verdict);
    if (ar.length) L.push(`  броня: ${ar.map(g => g.label + mark(g)).join(', ')}`);
  }
  if (s.fights && s.races.length > 1) L.push(`\nРасы (все тиры): ${s.races.map(g => `${g.label} ${pct(g.rate)}`).join(' · ')}`);
  if (s.fights && s.skillVaried) L.push(`Навык: ${s.skill.map(g => `${g.key} → ${pct(g.rate)}`).join(' · ')}`);
  if (s.fights && s.statsVaried) for (const k of ['S', 'A', 'E', 'L']) if (s.stats[k].length > 1) L.push(`${k}: ${s.stats[k].map(g => `${g.key} → ${pct(g.rate)}`).join(' · ')}`);
  if (s.model) {
    L.push(`\nПри прочих равных (${s.model.n} ближних боёв): что даёт к шансу победы в равном бою, и сколько это PL оружия`);
    for (const f of s.model.features) L.push(`  ${f.label.padEnd(28)} ${(f.pp >= 0 ? '+' : '') + (f.pp * 100).toFixed(1)} п.п. [${(f.lo * 100).toFixed(1)}…${(f.hi * 100).toFixed(1)}]${f.perAtk != null && f.id !== 'atk' ? `   ≈ ${f.perAtk.toFixed(2)} PL оружия` : ''}`);
  }
  for (const c of s.cross) L.push(`Тир ${c.lower} против тира ${c.upper}: слабое снаряжение побеждает в ${pct(c.upset)} боёв (${c.duels})`);
  for (const f of s.foes) L.push(`Против: ${f.label} — ${pct(f.rate)} (${f.duels}); по тирам ${f.tiers.map(g => `${g.key}: ${pct(g.rate)}`).join(', ')}`);
  const f2 = x => x.toFixed(2), K = s.raceKs, C = s.creatures, T = s.typical;
  if (K) {
    L.push(`\nЧАСТЬ 2. КС РАЗУМНЫХ РАС (${K.n} боёв, ~${K.ticks} тиков; ${K.ref.species} с ${K.ref.kit.join(' + ')} = ${K.base})`);
    L.push(`  при равных КС сторона A побеждает в ${pct(K.bias)} боёв (должно быть ~50%)`);
    for (const b of K.bins) if (b.n) L.push(`  ${b.label.padEnd(24)} побед A ${pct(b.rate).padStart(4)} [${pct(b.lo)}…${pct(b.hi)}], n=${b.n}`);
    L.push(`  alpha: сейчас ${K.alpha}, лучше всего ${K.best.alpha}`);
    L.push(`  толпа: ${Math.abs(K.crowd.beta) < 2 * K.crowd.se ? 'числом сверх КС не берут' : K.crowd.beta > 0 ? 'числа побеждают больше, чем говорит КС' : 'числа побеждают меньше, чем говорит КС'} (${f2(K.crowd.beta)} ± ${f2(K.crowd.se)})`);
    L.push(`  поправки при alpha ${K.best.alpha} (× к КС; * — уверенно; → что записать в ks):`);
    L.push('    ' + K.species.map(f => `${f.label} ×${f2(f.m)}${f.sure ? '*' : ''}${f.write != null ? ` → ${f.write}` : ''}`).join(' · '));
    if (K.tiers.length) L.push('  снаряжение тира: ' + K.tiers.map(f => `тир ${f.tier} ×${f2(f.m)}${f.sure ? '*' : ''}`).join(' · ') + ' (больше 1 — КС его недооценивает)');
    L.push(`  лук и праща: ×${f2(K.ranged.m)}${K.ranged.sure ? '*' : ''} [${f2(K.ranged.lo)}…${f2(K.ranged.hi)}] → rangedWeight ${K.ranged.suggest}`);
  }
  if (C) {
    L.push(`\nЧАСТЬ 3. КС СУЩЕСТВ (${C.n} боёв против рас, ~${C.ticks} тиков; при равных КС существа побеждают в ${pct(C.bias)})`);
    L.push(`  ${'кто'.padEnd(26)}${'×'.padStart(6)}  ${'95%'.padEnd(11)}${'равных'.padStart(7)}${'стаей'.padStart(7)}${'ks'.padStart(7)}  → запись`);
    for (const f of C.list) L.push(`  ${f.label.slice(0, 25).padEnd(26)}${f2(f.m).padStart(6)}${f.sure ? '*' : ' '} ${(f2(f.lo) + '…' + f2(f.hi)).padEnd(11)}${String(f.even).padStart(7)}${String(f.size).padStart(7)}${String(f.now ?? '—').padStart(7)}  ${f.write != null ? '→ ' + f.write : f.even < 10 ? 'мало равных боёв' : ''}`);
    if (C.harmless.length) L.push(`  не дерутся (нет attack), КС не считается: ${C.harmless.join(', ')}`);
  }
  if (T) {
    const h0 = T.races.find(r => r.species === T.ref.species)?.tiers[0]?.mean;
    L.push(`\nТипичный КС${h0 ? ' (и сколько их на одного человека тира 0)' : ''}:`);
    for (const r of T.races) L.push(`  ${r.label.padEnd(14)} ${Object.entries(r.tiers).map(([t, v]) => `тир ${t}: ${v.mean.toFixed(0).padStart(4)}`).join('  ')}${h0 ? `   ×${(h0 / r.tiers[0].mean).toFixed(2)}` : ''}`);
    L.push('  ' + T.creatures.map(c => `${c.label} ${c.mean.toFixed(0)}`).join(' · '));
  }
  if (s.written) L.push(s.written.length ? `\nЗаписано в data/balance/creatures.js:\n  ${s.written.join('\n  ')}` : '\nВ data/balance/creatures.js менять нечего: КС сходится.');
  else if ((K && (K.writeAlpha != null || K.ranged.sure || Object.keys(K.write).length)) || (C && Object.keys(C.write).length)) L.push('\nЕсть что записать в data/balance/creatures.js: npm run arena:calibrate (или --write).');
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

function racesHtml(K) {
  const f2 = x => x.toFixed(2);
  const maxLL = K.best.ll, minLL = Math.min(...K.scan.map(r => r.ll));
  return `<h1 class="part">Часть 2. КС разумных рас — групповые бои</h1>
  <section class="card"><h2>Сходится ли КС</h2><p class="muted">${K.n} боёв «N против M», ~${K.ticks} тиков, ничьих ${K.draws}. КС ${esc(K.ref.species)} с ${esc(K.ref.kit.join(' + '))} = ${K.base}; КС стороны — сумма КС бойцов (data/balance/creatures.js). Если КС верен, стороны с равной суммой побеждают поровну, а с большей — тем чаще, чем больше разрыв.</p>
    <p>При равных КС сторона A побеждает в <b>${pct(K.bias)}</b> боёв.</p>
    ${binsHtml(K.bins)}
    <div class="grid2"><div><h3>alpha: как сила складывается в толпе</h3><p class="muted">1 — каждый дерётся с одним, 0,5 — все бьют разом (квадратичный закон Ланчестера). Сейчас ${K.alpha}, лучше всего предсказывает <b>${K.best.alpha}</b>.</p>
      <div class="scroll"><table><thead><tr><th>alpha</th><th>правдоподобие</th><th></th></tr></thead><tbody>${K.scan.map(r => `<tr><td>${r.alpha}${r.alpha === K.best.alpha ? ' ★' : ''}${Math.abs(r.alpha - K.alpha) < 1e-9 ? ' (сейчас)' : ''}</td><td>${r.ll.toFixed(0)}</td><td style="text-align:left"><span style="display:inline-block;height:8px;border-radius:4px;background:var(--good);width:${Math.round(4 + 120 * (r.ll - minLL) / Math.max(1e-9, maxLL - minLL))}px"></span></td></tr>`).join('')}</tbody></table></div>
      <p class="muted">Толпа: ${Math.abs(K.crowd.beta) < 2 * K.crowd.se ? 'числом сверх КС не берут' : K.crowd.beta > 0 ? 'числа побеждают больше, чем говорит КС' : 'числа побеждают меньше, чем говорит КС'} (${f2(K.crowd.beta)} ± ${f2(K.crowd.se)}).</p></div>
    <div><h3>Поправки при alpha ${K.best.alpha}</h3><p class="muted">Множитель к КС: больше 1 — сильнее, чем говорит формула. Люди — мерило. «ks» — что сейчас в строке вида и что туда записать.</p>
      <div class="scroll"><table><thead><tr><th>кто</th><th>×</th><th>95%</th><th>боёв</th><th>ks</th></tr></thead><tbody>${K.species.map(f => `<tr><td>${esc(f.label)}</td><td style="${heat(0.5 + Math.log(f.m) / 2)}">${f2(f.m)}</td><td class="muted">${f2(f.lo)}…${f2(f.hi)}</td><td>${f.n}</td><td>${f.now ?? '—'}${f.write != null ? ` → <b>${f.write}</b>` : ''}</td></tr>`).join('')}
      ${K.tiers.map(f => `<tr><td>снаряжение тира ${f.tier}</td><td style="${heat(0.5 + Math.log(f.m) / 2)}">${f2(f.m)}</td><td class="muted">${f2(f.lo)}…${f2(f.hi)}</td><td>${f.n}</td><td class="muted">к тиру 0</td></tr>`).join('')}
      <tr><td>лук и праща</td><td style="${heat(0.5 + Math.log(K.ranged.m) / 2)}">${f2(K.ranged.m)}</td><td class="muted">${f2(K.ranged.lo)}…${f2(K.ranged.hi)}</td><td>${K.ranged.n}</td><td>rangedWeight ${K.ranged.now}${K.ranged.suggest !== K.ranged.now ? ` → <b>${K.ranged.suggest}</b>` : ''}</td></tr></tbody></table></div>
      <p class="muted">Поправки меньше ${Math.round(RULES.arena.adjustMin * 100)}% не предлагаются: это разброс между сидами. ${K.writeAlpha != null ? `alpha → <b>${K.writeAlpha}</b>.` : ''}</p></div></div>
  </section>`;
}
const binsHtml = bins => `<div class="scroll"><table><thead><tr><th>соотношение КС</th><th>побед A</th><th>95%</th><th>по модели</th><th>боёв</th></tr></thead><tbody>${bins.filter(b => b.n).map(b => `<tr><td>${esc(b.label)}</td><td style="${heat(b.rate)}">${pct(b.rate)}</td><td class="muted">${pct(b.lo)}…${pct(b.hi)}</td><td>${pct(b.pred)}</td><td>${b.n}</td></tr>`).join('')}</tbody></table></div>`;
function creaturesHtml(C) {
  const f2 = x => x.toFixed(2);
  return `<h1 class="part">Часть 3. КС существ — против рас</h1>
  <section class="card"><h2>Поправки ks</h2><p class="muted">${C.n} боёв: стая одного вида (с тем, что он носит в набегах) против отряда одной расы, суммы КС от ½ до 2 к одному. Расы считаются откалиброванными (часть 2). При равных КС существа побеждают в <b>${pct(C.bias)}</b>. «×» — во сколько раз существо сильнее, чем говорит формула; «равных» — боёв, где суммы отличались меньше чем в 1,5 раза (на них и держится поправка); «стаей» — сколько их обычно выходило. Без ks вид получает поправку при 10+ равных боях; с ks — только уверенную и больше ${Math.round(RULES.arena.adjustMin * 100)}%, и на полшага (×√m), чтобы шум между сидами не раскачивал её.</p>
    ${binsHtml(C.bins)}
    <div class="scroll"><table><thead><tr><th>кто</th><th>×</th><th>95%</th><th>боёв</th><th>равных</th><th>побед</th><th>стаей</th><th>против</th><th>ks</th></tr></thead><tbody>${C.list.map(f => `<tr><td>${esc(f.label)}</td><td style="${heat(0.5 + Math.log(f.m) / 2)}">${f2(f.m)}${f.sure ? ' *' : ''}</td><td class="muted">${f2(f.lo)}…${f2(f.hi)}</td><td>${f.n}</td><td>${f.even}</td><td>${pct(f.won)}</td><td>${f.size}</td><td>${f.against}</td><td>${f.now ?? '—'}${f.write != null ? ` → <b>${f.write}</b>` : f.even < 10 ? ' <span class="muted">мало равных</span>' : ''}</td></tr>`).join('')}</tbody></table></div>
    ${C.harmless.length ? `<p class="muted">Не дерутся (нет attack), КС не считается: ${esc(C.harmless.join(', '))}.</p>` : ''}
  </section>`;
}
function typicalHtml(T) {
  const h0 = T.races.find(r => r.species === T.ref.species)?.tiers[0]?.mean, tiersT = Object.keys(T.races[0]?.tiers || {});
  const cr = [...T.creatures].sort((a, b) => a.mean - b.mean);
  return `<section class="card"><h2>Типичный КС</h2><p class="muted">Среднее по 300: расы — SPECIAL по расе, навык как в прогоне, снаряжение тира случайное; существа — как в набегах. «На одного человека» — сколько их нужно против человека тира 0. Это КС после записи, если она была.</p>
    <div class="grid2"><div class="scroll"><table><thead><tr><th>раса</th>${tiersT.map(t => `<th>тир ${t}</th>`).join('')}<th>на одного человека</th></tr></thead><tbody>${T.races.map(r => `<tr><td>${esc(r.label)}</td>${tiersT.map(t => `<td title="25–75%: ${r.tiers[t].p25.toFixed(0)}–${r.tiers[t].p75.toFixed(0)}">${r.tiers[t].mean.toFixed(0)}</td>`).join('')}<td>${h0 ? (h0 / r.tiers[tiersT[0]].mean).toFixed(2) : '—'}</td></tr>`).join('')}</tbody></table></div>
    <div class="scroll"><table><thead><tr><th>существо</th><th>КС</th><th>ks</th><th>на одного человека</th></tr></thead><tbody>${cr.map(c => `<tr><td>${esc(c.label)}</td><td title="25–75%: ${c.p25.toFixed(0)}–${c.p75.toFixed(0)}">${c.mean.toFixed(0)}</td><td>${c.ks ?? '—'}</td><td>${h0 ? (h0 / c.mean).toFixed(2) : '—'}</td></tr>`).join('')}</tbody></table></div></div></section>`;
}

export function renderArena(s) {
  const o = s.opt;
  const setup = [`поединков ${s.fights}`, ...(s.raceKs ? [`боёв рас ${s.raceKs.n}`] : []), ...(s.creatures ? [`боёв существ ${s.creatures.n}`] : []), `расы: ${o.races === 'all' ? 'все' : o.races}`, `SPECIAL: ${o.stats === 'norm' ? 'все 5' : 'по расе'}`, `навык: ${o.skill === 'random' ? 'случайный 0–1' : o.skill}`,
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
  ${s.fights ? '<h1 class="part">Часть 1. Оружие — поединки</h1>' : ''}
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
  ${s.foes.length ? `<section class="card"><h2>Против существ</h2>${s.foes.map(f => `<h3>${esc(f.label)}: ${pct(f.rate)} побед вооружённого (${f.duels} боёв)</h3><div class="grid2"><div>${table(f.tiers, {first: 'тир'})}</div><div>${table(f.weapons, {first: 'оружие'})}</div></div>`).join('')}</section>` : ''}
  ${s.raceKs ? racesHtml(s.raceKs) : ''}
  ${s.creatures ? creaturesHtml(s.creatures) : ''}
  ${s.typical ? typicalHtml(s.typical) : ''}
  ${s.written ? `<section class="card"><h2>Записано в data/balance/creatures.js</h2>${s.written.length ? `<pre>${esc(s.written.join('\n'))}</pre>` : '<p>Менять нечего: КС сходится.</p>'}</section>` : ''}`;
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
h1.part{font-size:20px;margin:18px 0 0} pre{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px;overflow-x:auto;font-size:12px}
</style></head><body><main>${body}</main></body></html>`;
}
