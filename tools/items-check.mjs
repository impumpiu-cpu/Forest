// Items against one scale: power levels (PL), prices on a fitted curve, dominated pieces, tiers that
// overlap, two-handers that do not pay for the shield they leave out, prices below the raw materials.
// What it measures against: src/data/balance/rules.js; the numbers themselves: src/data/balance/.
//
//   npm run items -- [--csv file.csv] [--strict]
//     --csv     also write the table to a CSV file (opens in any spreadsheet)
//     --strict  exit with an error when something is marked ✗ (a piece nobody should ever pick)
//
// Body armour is worth its defence plus its warmth (rules.js `warmth`), weapons their attack, block and tools.
// Signs: ✗ — a piece is worse than another in every way and costs no less; ⚠ — worth a look; · — a note.
import {writeFileSync} from 'node:fs';
import {ITEMS} from '../src/data/items.js';
import {RULES, rowOf} from '../src/data/balance/index.js';
import {toPL, attackPL, shotPL, defencePL, toolPL} from '../src/data/balance/power.js';
import {QUALITY} from '../src/data/quality.js';
import {RECIPES} from '../src/data/recipes.js';
import {RESOURCES} from '../src/data/resources.js';
import {STRENGTH} from '../src/data/balance/strength.js';
import {strengthOf} from '../src/agents/strength.js';
import {createAgent, maxHp} from '../src/agents/agent.js';
import {dress} from '../src/agents/equipment.js';
import {refreshBody} from '../src/agents/special.js';
import {STATS} from '../src/data/special.js';
import {mulberry} from '../src/core/rng.js';

const args = process.argv.slice(2);
const csvPath = args.includes('--csv') ? args[args.indexOf('--csv') + 1] : null, strict = args.includes('--strict');
const log = toPL;
const f1 = x => (x == null || !Number.isFinite(x) ? '—' : (x >= 0 ? ' ' : '') + x.toFixed(1));
const pad = (s, n) => String(s).padEnd(n), lpad = (s, n) => String(s).padStart(n);

// ── power of every item
const ref = ITEMS.get(RULES.ref);
const items = ITEMS.all().map(d => {
  const atk = attackPL(d, ref), rng = shotPL(d, ref), def = defencePL(d);
  const kind = d.slot === 'body' ? 'armor' : d.slot === 'hand' && d.melee && !d.ranged ? (d.hands === 2 ? 'twohand' : 'onehand')
    : d.ranged ? 'ranged' : d.block ? 'shield' : 'gear';
  const warm = RULES.warmth * (d.warmth || 0);
  const worth = kind === 'armor' ? def + warm : kind === 'shield' ? def : kind === 'ranged' ? rng : (atk ?? 0) + def + RULES.toolWeight * toolPL(d);
  const inputs = RECIPES.all().filter(r => r.makes?.item === d.id).map(r => Object.entries(r.cost || {}).reduce((s, [res, n]) => s + (RESOURCES.get(res).value || 0) * n, 0));
  return {d, id: d.id, kind, tier: d.tier, form: d.form, atk, rng, def, warm, tool: toolPL(d), worth, value: d.value, dur: d.dur,
    input: inputs.length ? Math.min(...inputs) : null, table: rowOf(d.id)?.table};
});
const byId = Object.fromEntries(items.map(x => [x.id, x]));

// ── price curve: ln(price) = a + b × PL, fitted over each kind that has enough pieces
function fit(xs) {
  const pts = xs.filter(x => x.value > 0 && Number.isFinite(x.worth));
  if (pts.length < 3) return null;
  const n = pts.length, mx = pts.reduce((s, x) => s + x.worth, 0) / n, my = pts.reduce((s, x) => s + Math.log(x.value), 0) / n;
  const b = pts.reduce((s, x) => s + (x.worth - mx) * (Math.log(x.value) - my), 0) / Math.max(1e-9, pts.reduce((s, x) => s + (x.worth - mx) ** 2, 0));
  return {a: my - b * mx, b, at: pl => Math.exp(my - b * mx + b * pl)};
}
const curves = {weapon: fit(items.filter(x => x.kind === 'onehand' || x.kind === 'twohand')), armor: fit(items.filter(x => x.kind === 'armor'))};
for (const x of items) {
  const c = x.kind === 'armor' ? curves.armor : x.kind === 'onehand' || x.kind === 'twohand' ? curves.weapon : null;
  x.fair = c ? c.at(x.worth) : null;
}

// ── findings
const marks = [];
const mark = (sign, text) => marks.push({sign, text});
const label = x => `${x.d.short} (${x.id}, тир ${x.tier})`;

// dominance: another piece is at least as good in every way, no dearer and no later — this one is never the pick
const fightVec = x => ({hands: x.d.hands || 0, atk: x.atk ?? -Infinity, def: x.def, rng: x.rng ?? -Infinity, speed: x.d.speed ?? 1});
const geq = (a, b) => a.hands <= b.hands && a.atk >= b.atk - 1e-9 && a.def >= b.def - 1e-9 && a.rng >= b.rng - 1e-9 && a.speed >= b.speed - 1e-9;
const same = (a, b) => a.hands === b.hands && Math.abs(a.atk - b.atk) < 1e-9 && Math.abs(a.def - b.def) < 1e-9 && a.rng === b.rng && a.speed === b.speed;
const toolsCover = (a, b) => Object.entries(b.d.tool || {}).every(([j, m]) => (a.d.tool?.[j] || 1) >= m);
const hands = items.filter(x => x.d.slot === 'hand' && (x.d.melee || x.d.ranged || x.d.block));
for (const b of hands) for (const a of hands) {
  if (a === b || a.value > b.value || a.tier > b.tier || (b.d.silver && !a.d.silver)) continue;
  const va = fightVec(a), vb = fightVec(b);
  if (!geq(va, vb) || (same(va, vb) && a.value === b.value)) continue;
  if (a.dur >= b.dur && toolsCover(a, b)) mark('✗', `${label(b)} хуже, чем ${label(a)}, во всём и стоит не меньше (${b.value} против ${a.value})`);
  else mark('⚠', `${label(b)} в бою хуже, чем ${label(a)}; держится только на ${[a.dur < b.dur ? 'прочности' : '', !toolsCover(a, b) ? 'работе (' + Object.keys(b.d.tool || {}).join(', ') + ')' : ''].filter(Boolean).join(' и ')}`);
}
const bodies = items.filter(x => x.kind === 'armor');
for (const b of bodies) for (const a of bodies) {
  if (a === b || a.value > b.value || a.tier > b.tier) continue;
  const ge = (k, def = 0) => (a.d[k] ?? def) >= (b.d[k] ?? def) - 1e-9;
  if (!(ge('armor') && ge('warmth') && ge('speed', 1) && a.dur >= b.dur)) continue;
  if (['armor', 'warmth'].every(k => (a.d[k] ?? 0) === (b.d[k] ?? 0)) && (a.d.speed ?? 1) === (b.d.speed ?? 1) && a.dur === b.dur && a.value === b.value) continue;
  mark('✗', `${label(b)} хуже, чем ${label(a)}, во всём (броня, тепло, шаг, прочность) и стоит не меньше`);
}

// the tier corridor: where a plain piece of its tier should sit
for (const x of items) {
  const kind = x.kind === 'onehand' ? 'weapon' : x.kind === 'twohand' ? 'twohand' : x.kind === 'armor' ? 'armor' : null;
  if (!kind) continue;
  const pl = kind === 'weapon' ? x.atk : kind === 'twohand' ? x.atk + x.def : x.def, band = RULES.tierPL[kind][x.tier];
  if (!band) { mark('⚠', `${label(x)}: для тира ${x.tier} нет коридора в rules.js`); continue; }
  if (pl < band[0] - 1e-9 || pl > band[1] + 1e-9) mark('⚠', `${label(x)}: ${kind === 'weapon' ? 'атака' : kind === 'twohand' ? 'атака + защита' : 'защита'} PL ${f1(pl).trim()} вне коридора тира [${band[0]}…${band[1]}]`);
}

// overlapping tiers: a lower tier clearly stronger than a higher one of the same kind
for (const kind of ['onehand', 'twohand', 'armor']) {
  const xs = items.filter(x => x.kind === kind), pl = x => (kind === 'armor' ? x.def : x.atk);
  for (const lo of xs) for (const hi of xs) {
    if (lo.tier >= hi.tier) continue;
    if (pl(lo) > pl(hi) + RULES.overlap) mark('⚠', `${label(lo)} сильнее, чем ${label(hi)}: PL ${f1(pl(lo)).trim()} против ${f1(pl(hi)).trim()}`);
  }
}

// the same form one tier up: stronger and dearer
const forms = new Map();
for (const x of items) if (x.form) (forms.get(x.form) || forms.set(x.form, []).get(x.form)).push(x);
for (const [form, xs] of forms) {
  xs.sort((a, b) => a.tier - b.tier);
  for (let k = 1; k < xs.length; k++) {
    const lo = xs[k - 1], hi = xs[k];
    if (lo.tier === hi.tier) continue;
    if (hi.worth <= lo.worth) mark('⚠', `форма «${form}»: ${label(hi)} не сильнее, чем ${label(lo)}`);
    if (hi.value <= lo.value) mark('⚠', `форма «${form}»: ${label(hi)} не дороже, чем ${label(lo)}`);
  }
}

// two hands: a two-hander leaves no hand for a shield, so it has to be worth one
const shields = items.filter(x => x.kind === 'shield');
for (const x of items.filter(x => x.kind === 'twohand')) {
  const sh = shields.filter(s => s.tier <= x.tier).sort((a, b) => b.def - a.def)[0];
  const pairs = items.filter(y => y.kind === 'onehand' && y.tier === x.tier).map(y => ({y, pl: y.atk + y.def + (sh ? sh.def : 0)}));
  if (!pairs.length) continue;
  const weakest = pairs.sort((a, b) => a.pl - b.pl)[0], mine = x.atk + x.def;
  if (mine < weakest.pl) mark('⚠', `${label(x)}: в двух руках PL ${f1(mine).trim()}, а слабейшее одноручное его тира со щитом — ${weakest.y.d.short} + ${sh ? sh.d.short : '—'}: ${f1(weakest.pl).trim()}. Двуручному не хватает ${(weakest.pl - mine).toFixed(1)} PL`);
}

// prices
for (const x of items) {
  if (x.fair && !RULES.niche.some(f => x.d[f]) && (x.value > x.fair * RULES.priceOff || x.value < x.fair / RULES.priceOff)) mark('⚠', `${label(x)}: цена ${x.value}, по кривой ~${x.fair.toFixed(1)} (в ${(x.value / x.fair).toFixed(1)} раза)`);
  if (x.input != null && x.value < x.input) mark('·', `${label(x)}: стоит ${x.value}, а сырьё на него — ${x.input.toFixed(1)}: делать на продажу невыгодно`);
}

// ── print
const head = `${pad('предмет', 18)}${pad('вид', 9)}${lpad('тир', 4)} ${lpad('атака', 6)}${lpad('выстр', 6)}${lpad('защита', 7)}${lpad('тепло', 6)}${lpad('работа', 7)}${lpad('итог', 6)}${lpad('цена', 7)}${lpad('кривая', 8)}${lpad('сырьё', 7)}${lpad('прочн', 7)}`;
const KIND = {onehand: '1 рука', twohand: '2 руки', ranged: 'стрелк.', shield: 'щит', armor: 'броня', gear: 'снасть'};
console.log(`Сила вещей в PL: один уровень — ×${RULES.step} к урону за тик или к запасу здоровья; PL 0 — ${ref.short}.`);
console.log(`Итог: оружие — атака + защита + ${RULES.toolWeight} × работа; броня — защита + тепло (${RULES.warmth} PL за полное); щит — защита; лук и праща — выстрел.\n`);
console.log(head); console.log('─'.repeat(head.length));
const order = ['onehand', 'twohand', 'ranged', 'shield', 'armor', 'gear'];
for (const kind of order) {
  for (const x of items.filter(y => y.kind === kind).sort((a, b) => a.tier - b.tier || a.worth - b.worth)) {
    console.log(`${pad(x.d.short, 18)}${pad(KIND[kind], 9)}${lpad(x.tier, 4)} ${lpad(f1(x.atk), 6)}${lpad(f1(x.rng), 6)}${lpad(f1(x.def || null), 7)}${lpad(f1(x.warm || null), 6)}${lpad(f1(x.tool || null), 7)}${lpad(f1(x.worth), 6)}${lpad(x.value, 7)}${lpad(x.fair ? '~' + x.fair.toFixed(1) : '—', 8)}${lpad(x.input == null ? '—' : x.input.toFixed(1), 7)}${lpad(Number.isFinite(x.dur) ? x.dur : '∞', 7)}`);
  }
}
console.log('');
for (const [k, c] of Object.entries(curves)) if (c) console.log(`кривая цены (${k === 'weapon' ? 'оружие' : 'броня'}): ${Math.exp(c.a).toFixed(2)} × ${Math.exp(c.b).toFixed(2)}^PL — каждый уровень дороже в ${Math.exp(c.b).toFixed(2)} раза`);
console.log('«выстр» — выстрел против удара при равной меткости; дальний бой честно сравнивает только `npm run arena`.');

console.log('\nКачество (data/quality.js): что даёт шаг и сколько стоит');
console.log(`${pad('', 6)}${lpad('атака +PL', 10)}${lpad('оружие +', 10)}${lpad('за 1 PL', 9)}${lpad('броня +', 9)}${lpad('редкость', 14)}`);
for (const Q of QUALITY.all().filter(q => q.q > 0)) {
  const dpl = log(1 + Q.hit);
  console.log(`${pad(Q.label, 6)}${lpad(f1(dpl), 10)}${lpad(Q.addWeapon, 10)}${lpad((Q.addWeapon / dpl).toFixed(0), 9)}${lpad(Q.addArmor, 9)}${lpad(Q.rank, 14)}`);
}
const matStep = curves.weapon ? Math.exp(curves.weapon.b) : null;
if (matStep) console.log(`для сравнения: ступень материала (+1 PL) по кривой дороже в ${matStep.toFixed(2)} раза — у меча это ~${(byId.sword.value * (matStep - 1)).toFixed(0)} зол.`);

// ── the strength rating (КС) of the reference fighter in every kit: what a piece adds to a fighter
const R = STRENGTH.ref, scratch = {rngs: {birth: mulberry(1)}, agents: [], nextId: 1, nameIdx: 0};
function ks(kit) {
  scratch.agents = [];
  const a = createAgent(scratch, R.species, 'raiders', 0, 0);
  if (a.special) { for (const st of STATS.ids()) a.special[st] = R.special; refreshBody(a); a.hp = maxHp(a); }
  a.skill = {melee: R.skill, ranged: R.skill};
  const quiver = kit.map(id => ITEMS.get(id).ranged?.ammo).filter(Boolean).map(ammo => ITEMS.all().find(d => d.holds?.ammo === ammo)?.id)[0];
  dress(a, quiver ? [...kit, quiver] : kit, quiver ? ITEMS.get(quiver).holds.max : 0);
  return strengthOf(a);
}
const tiersAll = [...new Set(items.filter(x => x.d.slot === 'hand' && (x.d.melee || x.d.ranged)).map(x => x.tier))].sort((a, b) => a - b);
const shieldId = items.find(x => x.kind === 'shield')?.id;
console.log(`\nКС (коэффициент силы, data/balance/strength.js): ${R.species}, SPECIAL ${R.special}, навык ${R.skill}, ${R.kit.map(id => ITEMS.get(id).short).join(' + ')} = ${STRENGTH.base}`);
for (const T of tiersAll) {
  const bodies = items.filter(x => x.kind === 'armor' && x.tier <= T), best = bodies.sort((a, b) => b.def - a.def)[0];
  const cloth = ITEMS.has('clothes') ? 'clothes' : null;
  console.log(`  тир ${T}${pad('', 18)}${lpad(cloth ? ITEMS.get(cloth).short : 'без', 8)}${lpad(best ? best.d.short : '—', 18)}`);
  for (const x of items.filter(y => (y.kind === 'onehand' || y.kind === 'twohand' || y.kind === 'ranged') && y.tier === T)) {
    const kits = x.d.hands === 1 && shieldId ? [[x.id], [x.id, shieldId]] : [[x.id]];
    for (const k of kits) console.log(`    ${pad(k.map(id => ITEMS.get(id).short).join(' + '), 20)}${lpad(ks(cloth ? [...k, cloth] : k).toFixed(0), 8)}${lpad(best ? ks([...k, best.id]).toFixed(0) : '—', 18)}`);
  }
}

console.log(`\nНаходки (${marks.length}):`);
for (const s of ['✗', '⚠', '·']) for (const m of marks.filter(x => x.sign === s)) console.log(`  ${m.sign} ${m.text}`);
if (!marks.length) console.log('  нет');

if (csvPath) {
  const cols = ['id', 'short', 'table', 'kind', 'tier', 'form', 'atk', 'rng', 'def', 'warm', 'tool', 'worth', 'value', 'fair', 'input', 'dur'];
  const cell = v => (v == null ? '' : typeof v === 'number' ? (Number.isFinite(v) ? +v.toFixed(3) : 'inf') : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  writeFileSync(csvPath, [cols.join(','), ...items.map(x => cols.map(c => cell(c === 'short' ? x.d.short : x[c])).join(','))].join('\n') + '\n');
  console.log(`\nтаблица: ${csvPath}`);
}
if (strict && marks.some(m => m.sign === '✗')) process.exit(1);
