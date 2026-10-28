// The compass of world views (data/values.js, docs/RULES.md «Мировоззрение»): labels, the three layers
// (race → realm → creature, ±3 each, all within ±5), the realms' feeling for each other, the drift.
import {AXIS_MAX, ALIGN, alignLabel, alignNear, shiftAlign, spreadOf} from '../src/data/values.js';
import {SPECIES} from '../src/data/species.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {mulberry} from '../src/core/rng.js';
import {generateAtlas} from '../src/atlas/generate.js';
import {compassFeeling, memory, feeling} from '../src/atlas/diplomacy.js';
import {realmPeople as rp} from '../src/atlas/realms.js';

const fail = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}   ${name}${info ? `: ${info}` : ''}`); if (!ok) fail.push(name); };

const L = (o, m, g) => alignLabel({order: o, mercy: m}, g);
check('ярлык компаса', L(5, 0) === 'законопослушный нейтральный' && L(0, 0) === 'истинно нейтральный' && L(-3, -3) === 'хаотичный злой' && L(2, 3, 'pl') === 'законопослушные добрые' && L(1.5, -2, 'f') === 'нейтральная злая',
  [L(5, 0), L(0, 0), L(-3, -3), L(2, 3, 'pl'), L(1.5, -2, 'f')].join(' · '));

// a creature: within ±ALIGN.pawn of its centre, on the compass; the far ends rare, but there
const rng = mulberry(42);
let within = true, far = 0, n = 4000;
for (let k = 0; k < n; k++) {
  const c = {order: rng() * 10 - 5, mercy: rng() * 10 - 5}, p = alignNear(c, ALIGN.pawn, rng);
  if (Math.abs(p.order - c.order) > ALIGN.pawn + 0.25 || Math.abs(p.mercy - c.mercy) > ALIGN.pawn + 0.25 || Math.abs(p.order) > AXIS_MAX || Math.abs(p.mercy) > AXIS_MAX) within = false;
  if (Math.abs(p.mercy - c.mercy) >= 2) far++;
}
check('пешка: в пределах ±3 от центра и ±5 по компасу, далеко отходят немногие', within && far > 0 && far < n * 0.25, `отошли на 2 и больше: ${(far / n * 100).toFixed(1)}%`);

// the race's own spread (data/races.js align.spread): humans stray from their centre further than dwarves from theirs on law
const sd = (race, axis) => { const sp = SPECIES.get(race), r2 = mulberry(7); let s = 0; for (let k = 0; k < 3000; k++) { const p = alignNear({order: 0, mercy: 0}, spreadOf(sp, 'pawn'), r2); s += p[axis] ** 2; } return Math.sqrt(s / 3000); };
check('разброс расы по осям: люди шире, дварфы держатся закона', sd('human', 'order') > sd('dwarf', 'order') * 2 && sd('dwarf', 'mercy') > sd('dwarf', 'order'),
  `закон: люди ${sd('human', 'order').toFixed(2)}, дварфы ${sd('dwarf', 'order').toFixed(2)}; добро у дварфов ${sd('dwarf', 'mercy').toFixed(2)}`);

const x = {align: {order: 4.9, mercy: 0}}; shiftAlign(x, 'order', 1); shiftAlign(x, 'mercy', -0.3);
check('сдвиг точки держится в пределах компаса', x.align.order === AXIS_MAX && x.align.mercy === -0.3, JSON.stringify(x.align));
check('близость взглядов: одна точка теплее, далёкие холоднее', compassFeeling({order: 1, mercy: 1}, {order: 1, mercy: 1}) === ALIGN.near && compassFeeling({order: 5, mercy: 5}, {order: -5, mercy: -5}) === ALIGN.far);

// realms of a generated world: each within ±ALIGN.realm of its race (a schism — of its parent), the two of a race differ
const a = generateAtlas({seed: '3', size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1, epic: true, epicYears: {wild: 15, elder: 25, young: 25}});
const R = a.realms || [];
const ok = R.every(r => r.align && Math.abs(r.align.order) <= AXIS_MAX && Math.abs(r.align.mercy) <= AXIS_MAX);
const byPeople = {};
for (const r of R) (byPeople[r.people] ||= []).push(r);
const differ = Object.values(byPeople).filter(l => l.length > 1).some(l => l.some(r => r.align.order !== l[0].align.order || r.align.mercy !== l[0].align.mercy));
const founders = Object.values(byPeople).map(l => l[0]);
const near = founders.every(r => { const c = SPECIES.get(WORLD_PEOPLES.get(r.people).race).align; return Math.abs(r.align.order - c.order) <= ALIGN.realm + 1.5 && Math.abs(r.align.mercy - c.mercy) <= ALIGN.realm + 1.5; });
check('державы: у каждой своя точка, у двух держав одного народа — разные, первые — около своей расы', ok && differ && near,
  R.slice(0, 6).map(r => `${r.name}: ${alignLabel(r.align)} (${r.align.order}, ${r.align.mercy})`).join('; '));
const pair = Object.keys(a.rel || {})[0];
if (pair) {
  const [p, q] = pair.split(':'), P = rp(a, p), Q = rp(a, q);
  check('память держав учитывает их взгляды', Math.abs(memory(a, p, q) - Math.min(feeling(P, Q), feeling(Q, P))) > 1e-9, `${p}–${q}: ${memory(a, p, q).toFixed(2)}`);
}

if (fail.length) process.exit(1);
