// What the stock's wood and stone are made of (data/kinds.js; docs/TABLE.md, «Материалы на выбор»). The stock keeps
// a family's total where it always did (w.stock.wood, w.stock.stone), and beside it what the total is made of:
// w.kinds = {wood: {pine: 12.5, oak: 3}, stone: {granite: 18}}. Every system that only counts wood goes on as before;
// the few that care what wood it is — the fire, the crafts, the builders — take it member by member (takeKind).
// Wherever the total moved without telling (an old line that takes `w.stock.wood -= n`), the ledger follows it at the
// next look: a loss comes off every member alike, a gain is of the land's own kinds (settle).
//
// What the land gives: the trees of its biomes (data/kinds.js WOODS `biomes`, weighed by the region's biomes,
// world/region.js) and the rock under it (the world cell's rock, or one rock of the polygon's own). Taken in turn by
// weight (a running tally, no random numbers), so a forest of pine and birch fills the stock with both.
import {WOODS, STONES, FAMILIES, mayMake, useOf} from '../data/kinds.js';
import {region} from '../world/region.js';
import {seedNumber} from '../core/rng.js';

const POLY_ROCKS = ['granite', 'limestone', 'sandstone', 'basalt', 'gneiss'];
const EPS = 1e-6;

// the land's mix of a family: {member: weight}
export function landMix(w, fam) {
  if (fam === 'wood') {
    const b = region(w).biomes || {}, out = {};
    for (const T of WOODS.all()) {
      const v = Object.entries(T.biomes).reduce((s, [id, k]) => s + (b[id] || 0) * k, 0);
      if (v > 0.002) out[T.id] = v;
    }
    return Object.keys(out).length ? out : {birch: 1};
  }
  if (fam === 'stone') {
    const rock = region(w).rock || POLY_ROCKS[seedNumber(`${w.cfg?.seed ?? ''}:rock`) % POLY_ROCKS.length];
    return {[STONES.has(rock) ? rock : 'granite']: 1};
  }
  return {};
}

const ledger = (w, fam) => ((w.kinds ||= {})[fam] ||= {});
const total = L => Object.values(L).reduce((s, v) => s + v, 0);

// the next member the land gives, by its weights in turn (w.kindsTurn keeps the running tally)
function nextOfLand(w, fam) {
  const mix = landMix(w, fam), turn = ((w.kindsTurn ||= {})[fam] ||= {});
  const sum = Object.values(mix).reduce((s, v) => s + v, 0) || 1;
  let best = null, bv = -Infinity;
  for (const [id, v] of Object.entries(mix)) { turn[id] = (turn[id] || 0) + v / sum; if (turn[id] > bv) { bv = turn[id]; best = id; } }
  turn[best] -= 1;
  return best;
}

// make the ledger agree with the stock's total: a loss off every member alike, a gain of the land's kinds
export function settle(w, fam) {
  const res = FAMILIES[fam]?.resource; if (!res) return {};
  const L = ledger(w, fam), have = Math.max(0, w.stock?.[res] || 0), was = total(L);
  if (Math.abs(have - was) < EPS) return L;
  if (have < was) { const k = was > 0 ? have / was : 0; for (const id of Object.keys(L)) { L[id] *= k; if (L[id] < EPS) delete L[id]; } }
  else { let more = have - was; while (more > EPS) { const id = nextOfLand(w, fam), n = Math.min(1, more); L[id] = (L[id] || 0) + n; more -= n; } }
  return L;
}

// what the stock holds of a family now, settled: {member: amount}
export const kindsOf = (w, fam) => ({...settle(w, fam)});

// a member's worth for making and for burning (data/kinds.js): for a race that is not its master a special wood is plain
export function worth(fam, id, race = null) {
  if (fam === 'wood') {
    const T = WOODS.get(id), U = T.special && useOf(race, id) !== 'master' ? WOODS.get(T.plain) : T;
    return {make: U.dmg * U.dur, burn: U.fuel};
  }
  if (fam === 'stone') { const S = STONES.get(id); return {make: S.dur, burn: 0}; }
  return {make: 1, burn: 0};
}

// Take `n` of a family from the stock for a use: 'burn' — the worst first (the most heat is not wasted on kindling: the
// lowest make-worth that burns), 'make' — the best first that the maker's race may work. The total in w.stock comes down
// too. → the member most of it was (what the piece is made of), or null when nothing was there
export function takeKind(w, fam, n, use = 'make', race = null) {
  const res = FAMILIES[fam]?.resource; if (!res || n <= 0) return null;
  const L = settle(w, fam);
  const order = Object.keys(L).filter(id => use === 'burn' || !race || mayMake(race, id))
    .sort((p, q) => (use === 'burn' ? worth(fam, p, race).make - worth(fam, q, race).make : worth(fam, q, race).make - worth(fam, p, race).make));
  // what the race may not work is still taken last when nothing else is there (it is the stock's, not the maker's)
  for (const id of Object.keys(L)) if (!order.includes(id)) order.push(id);
  let left = n, main = null, mainN = 0;
  for (const id of order) {
    if (left <= EPS) break;
    const k = Math.min(L[id], left);
    L[id] -= k; left -= k; if (L[id] < EPS) delete L[id];
    if (k > mainN) { mainN = k; main = id; }
  }
  w.stock[res] = Math.max(0, (w.stock[res] || 0) - (n - left));
  return main;
}

// put back what an order took (a called-off order, settlement/crafting.js): the member it was
export function giveKind(w, fam, id, n) {
  const res = FAMILIES[fam]?.resource; if (!res || n <= 0) return;
  const L = settle(w, fam), m = id || nextOfLand(w, fam);
  L[m] = (L[m] || 0) + n;
  w.stock[res] = (w.stock[res] || 0) + n;
}

// may one of this race do the work that gets a family out of the land (data/kinds.js 'nomake', 'taboo'): felling for
// wood, quarrying for stone, digging for ore. Not when it may get none of what the land here would give.
const EXTRACTS = {chop: 'wood', mine: 'stone', dig: 'metal'};
export function mayExtract(w, race, jobId) {
  const fam = EXTRACTS[jobId];
  if (!fam || !race) return true;
  const members = fam === 'metal' ? FAMILIES.metal.members() : Object.keys(landMix(w, fam));
  return members.some(id => mayMake(race, id));
}
