// Fits the outputs of data/townBuildings.js to what the towns ask (atlas/economy.js): over generated worlds, for each good
// the made against the asked at full load, and the factor its makers' outputs want so that the towns meet it with a
// margin. Prints the factors; with --apply writes them into the table (the `out` of buildings and ways, KITCHENS.raw for
// ready food, LUX.take for luxury). `node tools/economy-balance.mjs [rounds] [--apply]`.
import fs from 'fs';
import {generateAtlas} from '../src/atlas/generate.js';
import {TOWN_BUILDINGS, TOWN_WORKS, TOWN_GOODS} from '../src/data/townBuildings.js';
import {stepEconomies} from '../src/atlas/economy.js';

const ROUNDS = +(process.argv[2] || 8), APPLY = process.argv.includes('--apply'), TARGET = 1.15;
const worlds = [0, 1].map(k => generateAtlas({seed: 'econ' + k, size: 'small', land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1}));
const towns = worlds.flatMap(a => a.towns.filter(t => t.alive).map(t => [a, t]));
// the outputs to scale: every `out` that is a plain number (luxury and coin ways are getters: left to LUX and MINT), with
// the peoples that have it (a way's own, else its building's, else all)
const PEOPLES = ['humans', 'dwarves', 'elves', 'orcs'];
const outs = [];
for (const b of TOWN_BUILDINGS.all()) if (b.out) for (const g of Object.keys(b.out)) outs.push([b.out, g, b.peoples || PEOPLES]);
for (const w of TOWN_WORKS.all()) for (const g of Object.keys(w.out)) if (Object.getOwnPropertyDescriptor(w.out, g).get == null && !/^(campfire|hearth|cookhouse)\.(?!brew)/.test(w.id)) outs.push([w.out, g, w.peoples || TOWN_BUILDINGS.get(w.at).peoples || PEOPLES]);
const CAP = [0.3, 15];   // how far a good's makers may be scaled in all
const kitchens = TOWN_WORKS.all().filter(w => /^(campfire|hearth|cookhouse)\./.test(w.id) && w.out.food);
const total = {};
const measure = () => {
  const made = {}, asked = {};
  for (const a of worlds) { for (const t of a.towns) t.econ = null; for (let k = 0; k < 4; k++) stepEconomies(a, 30); }
  for (const [a, t] of towns) {
    const M = made[t.people] ||= {}, A = asked[t.people] ||= {};
    for (const [g, v] of Object.entries(t.econ.prod)) M[g] = (M[g] || 0) + v;
    for (const [g, v] of Object.entries(t.econ.want)) A[g] = (A[g] || 0) + v;
  }
  return {made, asked};
};
const ratioOf = (made, asked, P, g) => (asked[P]?.[g] ? (made[P]?.[g] || 0) / asked[P][g] : null);
for (let r = 0; r < ROUNDS; r++) {
  const {made, asked} = measure();
  // a maker's factor: the mean over the peoples that have it of what each of them wants of the good, weighed by its asking
  const factor = (g, peoples) => {
    let w = 0, sum = 0;
    for (const P of peoples) {
      const r = ratioOf(made, asked, P, g); if (r == null || !made[P]?.[g]) continue;
      const k = asked[P][g]; sum += k * Math.max(0.5, Math.min(2, Math.sqrt(TARGET / r))); w += k;
    }
    return w ? sum / w : 1;
  };
  const f = {};
  for (const [o, g, peoples] of outs) {
    const k = factor(g, peoples), now = total[g] || 1, next = Math.max(CAP[0], Math.min(CAP[1], now * k));
    o[g] = Math.round(o[g] * (next / now) * 1000) / 1000;
    f[g] = next / now;
  }
  if (f.food) for (const w of kitchens) { const g = Object.keys(w.in)[0]; w.in[g] = Math.round(w.in[g] * f.food * 1000) / 1000; w.out.food = Math.round(w.out.food * f.food * 1000) / 1000; if (w.fire) w.fire = Math.round(w.fire * f.food * 1000) / 1000; }
  for (const [g, v] of Object.entries(f)) total[g] = (total[g] || 1) * v;
  const worst = PEOPLES.flatMap(P => Object.keys(asked[P] || {}).map(g => [P, g, ratioOf(made, asked, P, g)])).filter(x => x[2] != null).sort((x, y) => x[2] - y[2]).slice(0, 5);
  console.log(`раунд ${r + 1}: хуже всего ${worst.map(([P, g, v]) => `${P}·${TOWN_GOODS.get(g).label} ${v.toFixed(2)}`).join(', ')}`);
}
// what a people cannot meet however its makers are scaled: a gap of the chains in quantity, not in numbers
{
  const {made, asked} = measure();
  console.log('\nнехватка по расам (сделано / нужно < 0,6):');
  for (const P of PEOPLES) {
    const gaps = Object.keys(asked[P] || {}).map(g => [g, ratioOf(made, asked, P, g)]).filter(([, v]) => v != null && v < 0.6).sort((x, y) => x[1] - y[1]);
    console.log(`  ${P}: ${gaps.map(([g, v]) => `${TOWN_GOODS.get(g).label} ${v.toFixed(2)}`).join(', ') || '—'}`);
  }
}
console.log('\nмножители выпуска:', Object.entries(total).filter(([, v]) => Math.abs(v - 1) > 0.02).map(([g, v]) => `${g} ×${v.toFixed(2)}`).join(', '));
if (APPLY) {
  // write the fitted outs back into the source: the `out` maps of buildings (by id) and ways (by id)
  const p = 'src/data/townBuildings.js';
  let s = fs.readFileSync(p, 'utf8');
  const fmt = v => String(Math.round(v * 1000) / 1000);
  const mapText = o => Object.entries(o).map(([g, v]) => `${g}: ${fmt(v)}`).join(', ');
  for (const b of TOWN_BUILDINGS.all()) if (b.out && Object.keys(b.out).length) {
    const re = new RegExp(`(  B\\('${b.id}',[^\\n]*?out: )\\{[^}]*\\}`);
    s = s.replace(re, (m, head) => `${head}{${mapText(b.out)}}`);
  }
  for (const w of TOWN_WORKS.all()) {
    if ((/^(campfire|hearth|cookhouse)\./.test(w.id) && !/\.brew/.test(w.id)) || Object.values(Object.getOwnPropertyDescriptors(w.out)).some(d => d.get)) continue;
    const [at, id] = w.id.split('.');
    const re = new RegExp(`(  WK\\('${at}', '${id}', '[^']*', \\{[^}]*\\}, )\\{[^}]*\\}`);
    s = s.replace(re, (m, head) => `${head}{${mapText(w.out)}}`);
  }
  if (total.food) s = s.replace(/export const KITCHENS = \{[^\n]*\};/, m => m.replace(/raw: ([\d.]+)/g, (x, v) => `raw: ${fmt(v * total.food)}`).replace(/fire: ([\d.]+)/g, (x, v) => `fire: ${fmt(v * total.food)}`));
  fs.writeFileSync(p, s);
  console.log('записано в', p);
}
