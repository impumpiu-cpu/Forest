// The peoples side by side over a whole history (docs/WORLD.md «Асимметрия народов»): what each race's towns come to —
// people, steps, how their works feed and supply them, what they lack, what they make a head, how they fight. Measured over
// the last `--years` of each world and averaged over the seeds. Not part of `npm test`: a small world takes ~10 s.
// Usage: node tools/race-balance.mjs [seeds=5,9,21,27,47] [--years=20] [--json] [--towns]
import {newAtlas, runNextStage, landDone} from '../src/atlas/generate.js';
import {startHistory, stepHistory, historyDone} from '../src/atlas/history.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {TOWN_BUILDINGS, goodPrice, TOWN_GOODS} from '../src/data/townBuildings.js';
import {SEASONS_PER_YEAR} from '../src/data/atlas.js';
import {townFx, might, room} from '../src/atlas/towns.js';

const args = process.argv.slice(2), seeds = (args.find(s => /^[\d,]+$/.test(s)) || '5,9,21,27,47').split(',');
const years = +(args.find(s => s.startsWith('--years='))?.split('=')[1] || 20), json = args.includes('--json'), listTowns = args.includes('--towns');
const PEOPLES = WORLD_PEOPLES.all().map(p => p.id);
// the goods that tell a people's trade: craft (the dwarves), the wood's gifts (the elves), the goods of war (the greenskins)
const TRADES = {craft: ['tools', 'arms', 'armor', 'metal', 'gems', 'lux'], wood: ['herbs', 'potions', 'honey', 'hide', 'leather'], war: ['arms', 'armor', 'beasts']};
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;

const blank = () => ({towns: 0, pop: 0, away: 0, tier: [0, 0, 0], fed: 0, feeds: 0, room: 0, landFeed: 0, needs: 0, comfort: 0, rows: 0, idle: 0, unpaid: 0,
  gold: 0, peopleGold: 0, makersGold: 0, realmGold: 0, wasted: 0, lackV: 0, askV: 0, short: {}, spare: {}, made: {}, lack: {}, might: 0, armies: 0, armyMen: 0, slaves: 0, golems: 0, beasts: 0, built: {}});
function take(a, acc) {
  for (const t of a.towns.filter(t => t.alive)) {
    const r = acc[t.people], e = t.econ, fx = townFx(t);
    r.towns++; r.pop += t.pop; r.tier[t.tier]++; r.feeds += e.feeds; r.fed += Math.min(1, e.feeds / Math.max(1, t.pop)); r.room += room(fx);
    r.needs += (t.needs?.basic ?? 1) * t.pop; r.comfort += (t.needs?.comfort ?? 1) * t.pop; r.unpaid += t.unpaid || 0;
    r.gold += t.gold; r.peopleGold += t.peopleGold; r.makersGold += t.makersGold; r.wasted += t.trade?.wasted || 0;
    r.might += might(t, fx); r.slaves += t.slaves || 0; r.golems += (t.golems?.guard?.length || 0) + Object.values(t.golems?.auto || {}).reduce((s, l) => s + l.length, 0); r.beasts += t.warBeasts?.men || 0;
    for (const [g, d] of Object.entries(e.dem)) { const v = d * goodPrice(g); r.askV += v; r.lackV += v * (e.short[g] || 0); if (e.short[g]) r.short[g] = (r.short[g] || 0) + v * e.short[g]; }
    for (const [g, v] of Object.entries(e.spare)) r.spare[g] = (r.spare[g] || 0) + v * (e.made[g] || 0) * goodPrice(g);
    for (const [g, v] of Object.entries(e.made)) r.made[g] = (r.made[g] || 0) + v;
    for (const [g, v] of Object.entries(t.needs?.lack || {})) r.lack[g] = (r.lack[g] || 0) + v * t.pop;
    for (const row of e.rows) { const b = TOWN_BUILDINGS.get(row.id); if (b.cat === 'housing' || !(b.jobs || b.in)) continue; r.rows += row.n; if (row.eff < 0.5) r.idle += row.n; }
    for (const id of new Set(t.built)) r.built[id] = (r.built[id] || 0) + 1;
  }
  for (const p of a.parties || []) if (p.kind === 'army' && p.state !== 'gone' && acc[p.people]) { acc[p.people].away += p.men; }
  for (const r of a.realms || []) if (acc[r.people]) acc[r.people].realmGold += r.gold || 0;
}
function armies(a, acc) { for (const p of a.parties || []) if (p.kind === 'army' && p.state === 'go' && !p.counted && acc[p.people]) { p.counted = true; acc[p.people].armyMen += p.men; acc[p.people].armiesN = (acc[p.people].armiesN || 0) + 1; } }

const MARKS = [10, 20, 30, 40];   // the people's towns' people so many years after they came (the elder and the young at the same age)
const sums = Object.fromEntries(PEOPLES.map(id => [id, {n: 0, seeds: 0, burnt: 0, wars: 0, raids: 0, grew: MARKS.map(() => 0), ...blank()}]));
for (const seed of seeds) {
  const a = newAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north'});
  while (!landDone(a)) runNextStage(a); startHistory(a);
  const acc = Object.fromEntries(PEOPLES.map(id => [id, blank()])), came = {}, grew = Object.fromEntries(PEOPLES.map(id => [id, MARKS.map(() => 0)])); let n = 0;
  while (!historyDone(a)) {
    stepHistory(a);
    for (const pe of a.peoples || []) { came[pe.id] ??= a.hist.year; const k = MARKS.indexOf(a.hist.year - came[pe.id]); if (k >= 0 && a.hist.season === 0) grew[pe.id][k] = a.towns.filter(t => t.alive && t.people === pe.id).reduce((s, t) => s + t.pop, 0); }
    if (a.hist.year > a.hist.end / SEASONS_PER_YEAR - years) { take(a, acc); n++; }
    armies(a, acc);
  }
  const burnt = Object.fromEntries(PEOPLES.map(id => [id, (a.ruins || []).filter(r => r.people === id).length]));
  const chron = a.chronicle.filter(l => l.year > a.hist.end / SEASONS_PER_YEAR - years);
  for (const id of PEOPLES) {
    const s = sums[id], r = acc[id];
    for (const k of Object.keys(r)) {
      if (typeof r[k] === 'number') s[k] = (s[k] || 0) + (k === 'armyMen' || k === 'armiesN' ? r[k] : r[k] / n);
      else if (Array.isArray(r[k])) r[k].forEach((v, i) => { s[k][i] += v / n; });
      else for (const [g, v] of Object.entries(r[k])) s[k][g] = (s[k][g] || 0) + v / n;
    }
    s.burnt += burnt[id]; s.seeds++; grew[id].forEach((v, i) => { s.grew[i] += v; });
    const P = WORLD_PEOPLES.get(id), lab = P.label, gen = P.labelGen, low = l => l.text.toLowerCase();
    s.wars += chron.filter(l => /началась война/.test(l.text) && low(l).includes(lab)).length;
    s.raids += chron.filter(l => (/разграбили/.test(l.text) && low(l).slice(0, 30).includes(lab)) || low(l).includes(`набег ${gen}`)).length;
    s.armies += chron.filter(l => /собрали в .* войско/.test(l.text) && low(l).slice(0, 30).includes(lab)).length;
  }
  if (listTowns) for (const t of a.towns.filter(t => t.alive).sort((p, q) => q.pop - p.pop)) console.log(`${seed} ${t.people.padEnd(8)} ${t.name.padEnd(14)} т${t.tier} ${Math.round(t.pop).toString().padStart(5)} кормят ${Math.round(t.econ.feeds)} нужды ${t.needs?.basic} нет: ${Object.entries(t.econ.short).map(([g, v]) => `${g}:${r2(v)}`).join(' ')} | ${[...new Set(t.built)].join(' ')}`);
}

const out = {};
for (const id of PEOPLES) {
  const s = sums[id], k = s.seeds, pop = s.pop || 1, top = o => Object.entries(o).sort((p, q) => q[1] - p[1]).slice(0, 5).map(([g, v]) => `${g} ${Math.round(v / k)}`).join(', ');
  const perHead = goods => r3(goods.reduce((v, g) => v + (s.made[g] || 0) * goodPrice(g), 0) / pop);
  out[id] = {
    grew: s.grew.map(v => Math.round(v / k)),
    towns: r2(s.towns / k), pop: Math.round(pop / k), away: Math.round(s.away / k), perTown: Math.round(pop / Math.max(1, s.towns)), tiers: s.tier.map(v => r2(v / k)),
    burnt: r2(s.burnt / k), wars: r2(s.wars / k), raids: r2(s.raids / k), armies: r2(s.armies / k), armyMen: Math.round(s.armyMen / Math.max(1, s.armiesN || 0)),
    fedByWorks: r2(s.fed / Math.max(1, s.towns)), roomUse: r2(pop / Math.max(1, s.room)), needs: r2(s.needs / pop), comfort: r2(s.comfort / pop), idle: r2(s.idle / Math.max(1, s.rows)), unpaid: r2(s.unpaid / Math.max(1, s.towns)),
    goldHead: r2((s.gold + s.peopleGold + s.makersGold) / pop), realmGold: Math.round(s.realmGold / k), wastedHead: r2(s.wasted / pop), lackShare: r2(s.lackV / Math.max(1, s.askV)),
    mightHead: r2(s.might / Math.sqrt(pop / Math.max(1, s.towns)) / Math.max(1, s.towns)), slaves: Math.round(s.slaves / k), golems: r2(s.golems / k), warBeastMen: Math.round(s.beasts / k),
    craftHead: perHead(TRADES.craft), woodHead: perHead(TRADES.wood), warHead: perHead(TRADES.war), foodHead: r2(((s.made.food || 0) + (s.made.grain || 0) * 0.8) / pop),
    short: top(s.short), spare: top(s.spare), peopleLack: top(s.lack),
    built: Object.entries(s.built).sort((p, q) => q[1] - p[1]).slice(0, 14).map(([g, v]) => `${g} ${r2(v / Math.max(1, s.towns))}`).join(', '),
  };
}
if (json) { console.log(JSON.stringify(out)); process.exit(0); }
const keys = Object.keys(out[PEOPLES[0]]);
console.log(`сидов ${seeds.length}, последние ${years} лет; на расу в среднем за мир`);
for (const key of keys) console.log(key.padEnd(12) + PEOPLES.map(id => String(Array.isArray(out[id][key]) ? out[id][key].join('/') : out[id][key]).padStart(key === 'short' || key === 'spare' || key === 'peopleLack' || key === 'built' ? 0 : 12)).join(key === 'short' || key === 'spare' || key === 'peopleLack' || key === 'built' ? '\n' + ' '.repeat(12) : ''));
