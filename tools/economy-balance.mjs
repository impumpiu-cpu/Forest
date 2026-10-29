// Fits the capacity of the ways of data/townBuildings.js to what the towns ask (atlas/economy.js): over generated worlds,
// for each good what its makers could make at full load (E.cap) against what is asked at full load (E.want), by people,
// and the factor its makers' capacity wants so that they meet it with a margin (TARGET). A way is scaled whole — what it
// takes, its fire and what it gives together — so that its proportions (12 grain to 12 flour, a unit of ore to so much
// iron) stay as designed and only how much one building handles a day moves; a way of several goods is fitted by the one
// that wants it most (a craft hut of tools and arms grows for its tools though the arms are plenty). A way that works up what others make moves less (CAP.works) than one that
// gathers (CAP.gathers): the asking of a worked good leans on its own supply (a mill bigger than its fields lures the
// kitchens to flour), so it is held near its design. The kitchens move together by ready food (KITCHENS.raw and .fire). Gold
// (the treasury's), luxury and coin of the getter ways (LUX, MINT) and the people's own hands (start) are left alone.
// Prints the factors; with --apply writes them into the table. `node tools/economy-balance.mjs [rounds] [--apply]`.
import fs from 'fs';
import {generateAtlas} from '../src/atlas/generate.js';
import {TOWN_BUILDINGS, TOWN_WORKS, TOWN_GOODS, goodPrice, townStart} from '../src/data/townBuildings.js';
import {stepEconomies} from '../src/atlas/economy.js';

const ROUNDS = +(process.argv[2] || 6), APPLY = process.argv.includes('--apply');
const TARGET = 1.15;             // capacity against asking: a margin for towns that lack a building or its makings
const STEP = [0.7, 1.4];         // how far a round may move a way
const CAP = {gathers: [0.25, 8], works: [0.33, 4]};   // how far a way may be moved in all
const SKIP = new Set(['gold']), GEAR = new Set(['tools', 'arms', 'armor']);
const start = townStart();
const worlds = [0, 1].map(k => generateAtlas({seed: 'econ' + k, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1}));
const towns = worlds.flatMap(a => a.towns.filter(t => t.alive).map(t => [a, t]));
const PEOPLES = ['humans', 'dwarves', 'elves', 'orcs'];
const KITCHEN = /^(campfire|hearth|cookhouse)\.(?!brew)/;
const plain = o => !Object.values(Object.getOwnPropertyDescriptors(o)).some(d => d.get);
const worth = g => goodPrice(g) || 1;

// the units to fit: a building of one way (its own in/out/fire) or a way; each with its peoples and the object to scale
const units = [];
const works = o => Object.keys(o.in || {}).some(g => !GEAR.has(g));
for (const b of TOWN_BUILDINGS.all()) if (!b.works && b.out && Object.keys(b.out).length && plain(b.out)) units.push({id: b.id, kind: 'B', o: b, peoples: b.peoples || PEOPLES, works: works(b)});
for (const w of TOWN_WORKS.all()) if (!KITCHEN.test(w.id) && Object.keys(w.out).length && plain(w.out)) units.push({id: w.id, kind: 'W', o: w, peoples: w.peoples || TOWN_BUILDINGS.get(w.at).peoples || PEOPLES, works: works(w)});
const kitchens = TOWN_WORKS.all().filter(w => KITCHEN.test(w.id));
// (a herd is kept for its milk and young: its dung is a by-product, not a reason to keep more beasts)
const outsOf = u => Object.keys(u.o.out).filter(g => !SKIP.has(g) && !(g === 'coal' && TOWN_BUILDINGS.get(u.o.at || u.o.id)?.herd));
const r3 = v => Math.round(v * 1000) / 1000;
const scale = (o, f) => {
  for (const k of ['in', 'out']) if (o[k]) for (const g of Object.keys(o[k])) o[k][g] = r3(o[k][g] * f);
  if (o.fire) o.fire = r3(o.fire * f);
};

const measure = () => {
  const cap = {}, want = {};
  for (const a of worlds) { for (const t of a.towns) t.econ = null; for (let k = 0; k < 4; k++) stepEconomies(a, 30); }
  // by realm (its towns count their household together): a good counts only in the realms that have a maker of it — a
  // realm without a charcoal pit wants a pit, not a stronger one (that is the gap of the chains printed at the end)
  const realms = new Map();
  for (const [a, t] of towns) if (t.econ) {
    const k = `${a.cfg.seed}:${t.realm ?? 't' + t.id}`, R = realms.get(k) || {people: t.people, own: {}, cap: {}, want: {}};
    for (const [g, v] of Object.entries(start)) R.own[g] = (R.own[g] || 0) + v * Math.max(1, t.pop / 100);
    for (const [g, v] of Object.entries(t.econ.cap || {})) R.cap[g] = (R.cap[g] || 0) + v;
    for (const [g, v] of Object.entries(t.econ.want || {})) R.want[g] = (R.want[g] || 0) + v;
    realms.set(k, R);
  }
  const absent = {};
  for (const R of realms.values()) {
    const C = cap[R.people] ||= {}, W = want[R.people] ||= {}, A = absent[R.people] ||= {};
    for (const [g, v] of Object.entries(R.want)) {
      if (!((R.cap[g] || 0) - (R.own[g] || 0) > 1e-6)) { A[g] = (A[g] || 0) + v; continue; }
      W[g] = (W[g] || 0) + v; C[g] = (C[g] || 0) + R.cap[g];
    }
  }
  return {cap, want, absent};
};
const ratioOf = (M, P, g) => (M.want[P]?.[g] > 1e-9 ? (M.cap[P]?.[g] || 0) / M.want[P][g] : null);
// what a good wants of its makers: the mean over the peoples that have them, weighed by how much each asks of it
const factorOf = (M, g, peoples, none = false) => {
  let w = 0, sum = 0;
  for (const P of peoples) {
    const r = ratioOf(M, P, g); if (r == null || !(M.cap[P]?.[g] > 0)) continue;
    const k = M.want[P][g] * worth(g); sum += k * Math.max(STEP[0], Math.min(STEP[1], TARGET / r)); w += k;
  }
  return w ? sum / w : none ? null : 1;
};
const total = {};

const report = (M, title) => {
  const rows = PEOPLES.flatMap(P => Object.keys(M.want[P] || {}).map(g => [P, g, ratioOf(M, P, g)])).filter(x => x[2] != null);
  const worst = rows.sort((x, y) => x[2] - y[2]).slice(0, 6);
  console.log(`${title}: хуже всего ${worst.map(([P, g, v]) => `${P}·${TOWN_GOODS.get(g).label} ${v.toFixed(2)}`).join(', ')}`);
};
for (let r = 0; r < ROUNDS; r++) {
  const M = measure();
  report(M, `раунд ${r + 1}`);
  for (const u of units) {
    const gs = outsOf(u); if (!gs.length) continue;
    const f = Math.max(...gs.map(g => factorOf(M, g, u.peoples, true) ?? 0));
    const C = u.works ? CAP.works : CAP.gathers, now = total[u.id] || 1, next = Math.max(C[0], Math.min(C[1], now * (f || 1)));
    if (Math.abs(next / now - 1) < 0.01) continue;
    scale(u.o, next / now); total[u.id] = next;
  }
  {
    const C = CAP.works, now = total.kitchens || 1, next = Math.max(C[0], Math.min(C[1], now * factorOf(M, 'food', PEOPLES)));
    for (const w of kitchens) scale(w, next / now);
    total.kitchens = next;
  }
}
// what a people cannot reach however its makers are scaled: a gap of the chains, not of numbers
{
  const M = measure();
  report(M, 'итог');
  console.log('\nмощность против спроса < 0,7 по расам:');
  for (const P of PEOPLES) {
    const gaps = Object.keys(M.want[P] || {}).map(g => [g, ratioOf(M, P, g)]).filter(([, v]) => v != null && v < 0.7).sort((x, y) => x[1] - y[1]);
    console.log(`  ${P}: ${gaps.map(([g, v]) => `${TOWN_GOODS.get(g).label} ${v.toFixed(2)}`).join(', ') || '—'}`);
  }
  console.log('\nспрос в державах без производителя (доля спроса расы — разрыв цепочки, не нормы):');
  for (const P of PEOPLES) {
    const A = M.absent[P] || {}, gaps = Object.keys(A).map(g => [g, A[g] / (A[g] + (M.want[P]?.[g] || 0))]).filter(([, v]) => v > 0.3).sort((x, y) => y[1] - x[1]);
    console.log(`  ${P}: ${gaps.map(([g, v]) => `${TOWN_GOODS.get(g).label} ${Math.round(v * 100)}%`).join(', ') || '—'}`);
  }
}
console.log('\nмножители мощности:', Object.entries(total).filter(([, v]) => Math.abs(v - 1) > 0.02).sort((x, y) => y[1] - x[1]).map(([id, v]) => `${id} ×${v.toFixed(2)}`).join(', '));
if (APPLY) {
  // write back: in, out and fire of each scaled building line and way line; the kitchens through KITCHENS
  const p = 'src/data/townBuildings.js';
  let s = fs.readFileSync(p, 'utf8');
  const map = o => `{${Object.entries(o).map(([g, v]) => `${g}: ${r3(v)}`).join(', ')}}`;
  const lineOf = re => { const m = s.match(re); if (!m) throw new Error('нет строки ' + re); return m[0]; };
  for (const u of units) if (total[u.id]) {
    const o = u.o;
    if (u.kind === 'B') {
      const line = lineOf(new RegExp(`  B\\('${o.id}',[^\\n]*`));
      let nl = line.replace(/out: \{[^}]*\}/, `out: ${map(o.out)}`);
      if (o.in) nl = nl.replace(/([{ ,])in: \{[^}]*\}/, `$1in: ${map(o.in)}`);
      if (o.fire) nl = nl.replace(/fire: [\d.]+/, `fire: ${r3(o.fire)}`);
      s = s.replace(line, nl);
    } else if (/\.brew/.test(o.id)) {
      // the home brew of the kitchens: one constant for them all (they move together, by drink)
      s = s.replace(/export const HOMEBREW = \{[^\n]*\};/, `export const HOMEBREW = {raw: ${r3(Object.values(o.in)[0])}, drink: ${r3(o.out.drink)}, fire: ${r3(o.fire)}};`);
    } else {
      const [at, id] = o.id.split('.');
      const line = lineOf(new RegExp(`  WK\\('${at}', '${id}', [^\\n]*`));
      const m = line.match(/^(  WK\('[^']*', '[^']*', '[^']*', )\{[^}]*\}, \{[^}]*\}(.*)$/);
      let nl = `${m[1]}${map(o.in)}, ${map(o.out)}${m[2]}`;
      if (o.fire) nl = nl.replace(/fire: [\d.]+/, `fire: ${r3(o.fire)}`);
      s = s.replace(line, nl);
    }
  }
  if (total.kitchens) s = s.replace(/export const KITCHENS = \{[^\n]*\};/, m => m.replace(/(raw|fire): ([\d.]+)/g, (x, k, v) => `${k}: ${r3(v * total.kitchens)}`));
  fs.writeFileSync(p, s);
  console.log('записано в', p, '; KITCHENS ×' + (total.kitchens || 1).toFixed(2));
}
