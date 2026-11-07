// Who could not reach the goods: one world's history, and in its last years each season the works' lack that none of a buyer's
// sellers had (atlas/treasury.js worksBuying: t.econ.why.works.by[g].goods) laid against what the sellers of the world still had
// to spare once the buying was done (t.econ.why.left). A seller's leftover is shared out among the buyers lacking that good —
// by what each still lacks, never more than that — so one leftover is counted once, not once for every buyer it could have
// served. Each share is put down by why that seller was out of the buyer's reach (as worksBuying reaches: the towns of its realm
// the net joins, and the towns of another realm on a link of its own, while the realms trade — atlas/diplomacy.js trades):
//   edge   — a town of its own realm in another part of its net (an island of the realm, a province cut off)
//   foe    — a town of another realm on a link of the buyer's own, but the realms do not trade (war, or hate)
//   apart  — a town of another realm the buyer has no link to, the realms trading, and no way to through the lands between
//            (atlas/treasury.js farWays: too many realms, too far, or a realm on the way that does not trade)
//   both   — a town of another realm, no link and no trade
//   none   — what was lacking and no town of the world had left to spare
// `node tools/reach-probe.mjs [seed] [size] [years]` → JSON on stdout: means over the last `years` (10) years, in gold a year
// for 100 people, all and by people; the goods most lacking out of reach; how many buyers stood each season on an edge
import {newAtlas, runNextStage} from '../src/atlas/generate.js';
import {TOWN_GOODS, goodPrice} from '../src/data/townBuildings.js';
import {WORLD_PEOPLES} from '../src/data/peoples.js';
import {SEASONS_PER_YEAR as S} from '../src/data/atlas.js';
import {trades} from '../src/atlas/diplomacy.js';

const seed = process.argv[2] || 'start376615', size = process.argv[3] || 'small', last = Number(process.argv[4] || 10);
const a = newAtlas({seed, size, land: 1, plates: 1, hemisphere: 'north', wild: 1, elder: 1, young: 1});
const PE = WORLD_PEOPLES.all().map(P => P.id), KINDS = ['edge', 'foe', 'apart', 'both', 'none'];
const price = g => (TOWN_GOODS.has(g) ? goodPrice(g) || 0 : 0);
const r2 = x => Math.round(x * 100) / 100;

// the parts of each realm's net: towns of one realm joined by links of that realm (union-find) → town id → part
function partsOf(towns, links) {
  const up = new Map(towns.map(t => [t.id, t.id]));
  const find = x => { while (up.get(x) !== x) { up.set(x, up.get(up.get(x))); x = up.get(x); } return x; };
  for (const l of links) if (l.p.realm === l.q.realm && up.has(l.p.id) && up.has(l.q.id)) up.set(find(l.p.id), find(l.q.id));
  return new Map(towns.map(t => [t.id, find(t.id)]));
}

// one season: the shares, by kind and by good, in gold a season
function season() {
  const towns = a.towns.filter(t => t.alive && t.econ?.why);
  const links = [...(a.net?.links.values() || [])].filter(l => l.p.alive && l.q.alive && l.p.realm != null && l.q.realm != null);
  const part = partsOf(towns, links), linked = new Set(links.map(l => `${Math.min(l.p.id, l.q.id)}:${Math.max(l.p.id, l.q.id)}`));
  const kindOf = (b, s) => {
    if (b.realm === s.realm) return 'edge';   // (one part — it would have been reached: the share goes to another seller first)
    const link = linked.has(`${Math.min(b.id, s.id)}:${Math.max(b.id, s.id)}`), trade = trades(a, b.realm, s.realm);
    return link ? (trade ? null : 'foe') : (trade ? 'apart' : 'both');
  };
  const out = {by: Object.fromEntries([...PE, 'all'].map(p => [p, Object.fromEntries(KINDS.map(k => [k, 0]))])), goods: {}, edgeBuyers: 0, buyers: 0};
  const goods = new Set(towns.flatMap(t => Object.keys(t.econ.why.works?.by || {})));
  for (const g of goods) {
    const need = new Map(towns.map(t => [t, t.econ.why.works?.by?.[g]?.goods || 0]).filter(([, n]) => n > 0));
    if (!need.size) continue;
    // the sellers that still had it, each buyer's reachable ones taken out (what is in reach and still there was not lacking
    // for want of goods: the buyer's lack of it was laid on money, route or room)
    const sellers = towns.filter(s => (s.econ.why.left?.[g] || 0) > 0).map(s => [s, s.econ.why.left[g]]);
    for (const [s, has] of sellers.sort((p, q) => p[0].id - q[0].id)) {
      let left = has;
      const takers = [...need].filter(([b, n]) => n > 0 && b !== s && !(b.realm === s.realm && part.get(b.id) === part.get(s.id)) && kindOf(b, s) !== null);
      const sum = takers.reduce((v, [, n]) => v + n, 0);
      if (!(sum > 0)) continue;
      for (const [b, n] of takers) {
        const q = Math.min(n, has * n / sum, left);
        if (!(q > 0)) continue;
        const k = kindOf(b, s), v = q * price(g);
        for (const p of [b.people, 'all']) out.by[p][k] += v;
        (out.goods[g] ||= Object.fromEntries(KINDS.map(x => [x, 0])))[k] += v;
        need.set(b, n - q); left -= q;
      }
    }
    for (const [b, n] of need) if (n > 0) { const v = n * price(g); for (const p of [b.people, 'all']) out.by[p].none += v; (out.goods[g] ||= Object.fromEntries(KINDS.map(x => [x, 0]))).none += v; }
  }
  // the buyers lacking a good for want of it, and of them those whose realm's net is cut in parts
  for (const t of towns) {
    if (!Object.values(t.econ.why.works?.by || {}).some(r => r.goods > 0)) continue;
    out.buyers++;
    if (towns.some(o => o.realm === t.realm && part.get(o.id) !== part.get(t.id))) out.edgeBuyers++;
  }
  return out;
}

const seasons = [];
let end = null;
while (true) {
  const st = runNextStage(a);
  if (!st) break;
  if (st.id !== 'history' || !a.hist || !a.towns?.length) continue;
  seasons.push({y: a.hist.year, pop: Object.fromEntries([...PE, 'all'].map(p => [p, a.towns.filter(t => t.alive && (p === 'all' || t.people === p)).reduce((v, t) => v + t.pop, 0)])), ...season()});
  end = a.hist.year;
}
const tail = seasons.filter(x => x.y > end - last);
const per100 = (p, k) => r2(tail.reduce((v, x) => v + x.by[p][k] / Math.max(1, x.pop[p]) * 100, 0) / tail.length * S);
const by = Object.fromEntries([...PE, 'all'].map(p => [p, Object.fromEntries(KINDS.map(k => [k, per100(p, k)]))]));
const G = {};
for (const x of tail) for (const [g, o] of Object.entries(x.goods)) for (const k of KINDS) (G[g] ||= {})[k] = (G[g][k] || 0) + o[k] / Math.max(1, x.pop.all) * 100 / tail.length * S;
const goods = Object.entries(G).map(([g, o]) => [g, Object.fromEntries(KINDS.map(k => [k, r2(o[k])]))]).sort((p, q) => KINDS.reduce((v, k) => v + q[1][k], 0) - KINDS.reduce((v, k) => v + p[1][k], 0)).slice(0, 8);
const buyers = r2(tail.reduce((v, x) => v + x.buyers, 0) / tail.length), edgeBuyers = r2(tail.reduce((v, x) => v + x.edgeBuyers, 0) / tail.length);
process.stdout.write(JSON.stringify({seed, size, years: last, by, goods, buyers, edgeBuyers}));
