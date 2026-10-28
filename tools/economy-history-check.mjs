// Full-history economy, measured over the last 20 years; compare the same seeds with --levy=0.5.
// node tools/economy-history-check.mjs 5,9,21,27,47 [--levy=0.3333333333333333]
import {newAtlas, runNextStage, landDone} from '../src/atlas/generate.js';
import {startHistory, stepHistory, historyDone} from '../src/atlas/history.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {TOWN_BUILDINGS, goodPrice} from '../src/data/townBuildings.js';
import {ARMY} from '../src/data/parties.js';
import {SEASONS_PER_YEAR} from '../src/data/atlas.js';
const args = process.argv.slice(2), seeds = (args.find(s => /^[\d,]+$/.test(s)) || '5,9,21,27,47').split(',');
const levy = args.find(s => s.startsWith('--levy='));
if (levy) {
  const share = Number(levy.split('=')[1]);
  if (!(share > 0 && share < 1)) throw new Error('levy must be between 0 and 1');
  WORLD_PEOPLES.get('orcs').levy = share / ARMY.levy;
}
const skip = new Set(['food', 'grain', 'stores', 'gold']);
const take = a => {
  const by = Object.fromEntries(WORLD_PEOPLES.all().map(p => [p.id, {pop: 0, away: 0, money: 0, needs: 0, ask: 0, lack: 0, rows: 0, idle: 0}]));
  for (const t of a.towns.filter(t => t.alive)) {
    const r = by[t.people], e = t.econ;
    for (const [g, n] of Object.entries({...t.stock, pop: t.pop, gold: t.gold, peopleGold: t.peopleGold, makersGold: t.makersGold}))
      if (!Number.isFinite(n) || n < -0.01) throw new Error(`seed ${a.cfg.seed}, year ${a.hist.year}, town ${t.id}: ${g}=${n}`);
    if (['basic', 'comfort'].some(k => !Number.isFinite(t.needs?.[k]) || t.needs[k] < 0 || t.needs[k] > 1)) throw new Error(`invalid needs in town ${t.id}`);
    r.pop += t.pop; r.money += t.gold + t.peopleGold + t.makersGold + (t.grant || 0); r.needs += t.needs.basic * t.pop;
    for (const [g, d] of Object.entries(e.dem)) if (!skip.has(g)) { const v = d * goodPrice(g); r.ask += v; r.lack += v * (e.short[g] || 0); }
    for (const row of e.rows) { const b = TOWN_BUILDINGS.get(row.id); if (b.cat === 'housing' || !(b.jobs || b.in)) continue; r.rows += row.n; if (row.eff < 0.5) r.idle += row.n; }
  }
  for (const p of a.parties || []) if (p.kind === 'army' && p.state !== 'gone' && by[p.people]) by[p.people].away += p.men;
  for (const r of a.realms || []) if (by[r.people]) by[r.people].money += r.gold || 0;
  return by;
};
for (const seed of seeds) {
  const a = newAtlas({seed, size: 'small', land: 1, plates: 1, hemisphere: 'north'}), window = [];
  while (!landDone(a)) runNextStage(a); startHistory(a);
  while (!historyDone(a)) { stepHistory(a); window.push(take(a)); if (window.length > 20 * SEASONS_PER_YEAR) window.shift(); }
  const final = take(a), by = {};
  for (const id of Object.keys(final)) {
    const sum = {};
    for (const w of window) for (const [k, n] of Object.entries(w[id])) sum[k] = (sum[k] || 0) + n;
    by[id] = {population: Math.round(final[id].pop + final[id].away), needs: sum.pop ? sum.needs / sum.pop : null,
      lack: sum.ask ? sum.lack / sum.ask : 0, idle: sum.rows ? sum.idle / sum.rows : 0, moneyPerHead: sum.pop + sum.away ? sum.money / (sum.pop + sum.away) : null};
  }
  console.log(JSON.stringify({seed, orcLevy: WORLD_PEOPLES.get('orcs').levy * ARMY.levy, years: a.hist.year, by}));
}
