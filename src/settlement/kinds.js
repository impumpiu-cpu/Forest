// What the stock's wood and stone are made of (data/kinds.js; docs/BALANCE.md, «Материалы на выбор»). The stock keeps
// a family's total where it always did (w.stock.wood, w.stock.stone), and beside it what the total is made of:
// w.kinds = {wood: {pine: 12.5, oak: 3}, stone: {granite: 18}}. Every system that only counts wood goes on as before;
// the few that care what wood it is — the fire, the crafts, the builders — take it member by member (takeKind).
// Wherever the total moved without telling (an old line that takes `w.stock.wood -= n`), the ledger follows it at the
// next look: a loss comes off every member alike, a gain is of the land's own kinds in the land's shares (settle) — in
// shares, not a unit at a time, so the ledger does not depend on how often it is looked at (the panel looks every frame:
// peekKinds, which writes nothing).
//
// What the land gives: the trees of its biomes (data/kinds.js WOODS `biomes`, weighed by the region's biomes,
// world/region.js) and the rock under it (the world cell's rock, or one rock of the polygon's own). Taken in turn by
// weight, so a forest of pine and birch fills the stock with both.
import {WOODS, STONES, FAMILIES, mayMake, useOf, EXTRACTS, ORE_METAL, KIND_LAND} from '../data/kinds.js';
import {JOBS} from '../data/jobs.js';
import {region} from '../world/region.js';
import {seedNumber} from '../core/rng.js';

const EPS = 1e-6;

// the land's mix of a family: {member: weight}
export function landMix(w, fam) {
  if (fam === 'wood') {
    const b = region(w).biomes || {}, out = {};
    for (const T of WOODS.all()) {
      const v = Object.entries(T.biomes).reduce((s, [id, k]) => s + (b[id] || 0) * k, 0);
      if (v > KIND_LAND.least) out[T.id] = v;
    }
    return Object.keys(out).length ? out : {[KIND_LAND.wood]: 1};
  }
  if (fam === 'stone') {
    const rock = region(w).rock || KIND_LAND.rocks[seedNumber(`${w.cfg?.seed ?? ''}:rock`) % KIND_LAND.rocks.length];
    return {[STONES.has(rock) ? rock : KIND_LAND.stone]: 1};
  }
  return {};
}

const ledger = (w, fam) => ((w.kinds ||= {})[fam] ||= {});
const total = L => Object.values(L).reduce((s, v) => s + v, 0);

// `n` of the land's kinds put into a ledger, in the land's shares
function addOfLand(w, fam, L, n) {
  const mix = landMix(w, fam), sum = Object.values(mix).reduce((s, v) => s + v, 0) || 1;
  for (const [id, v] of Object.entries(mix)) L[id] = (L[id] || 0) + n * v / sum;
}

// a ledger made to agree with a total: a loss off every member alike, a gain of the land's kinds; a total that is not
// a number (a broken stock) leaves it as it is
function agree(w, fam, L, have) {
  if (!Number.isFinite(have)) return L;
  have = Math.max(0, have);
  const was = total(L);
  if (Math.abs(have - was) < EPS) return L;
  if (have < was) { const k = was > 0 ? have / was : 0; for (const id of Object.keys(L)) { L[id] *= k; if (L[id] < EPS) delete L[id]; } }
  else addOfLand(w, fam, L, have - was);
  // members this build does not know (a save of another build, a wood taken out of the tables) are of the land's kinds
  const known = fam === 'wood' ? WOODS : fam === 'stone' ? STONES : null;
  if (known) for (const id of Object.keys(L)) if (!known.has(id)) { const n = L[id]; delete L[id]; addOfLand(w, fam, L, n); }
  return L;
}

// make the ledger agree with the stock's total
export function settle(w, fam) {
  const res = FAMILIES[fam]?.resource; if (!res) return {};
  return agree(w, fam, ledger(w, fam), w.stock?.[res] || 0);
}

// what the stock holds of a family now, settled: {member: amount}
export const kindsOf = (w, fam) => ({...settle(w, fam)});
// the same, for a screen: settled on a copy, the world untouched
export function peekKinds(w, fam) {
  const res = FAMILIES[fam]?.resource; if (!res) return {};
  return agree(w, fam, {...(w.kinds?.[fam] || {})}, w.stock?.[res] || 0);
}

// a member's worth for making and for burning (data/kinds.js): for a race that is not its master a special wood is plain
export function worth(fam, id, race = null) {
  if (fam === 'wood' && !WOODS.has(id)) return {make: 1, burn: 1};
  if (fam === 'stone' && !STONES.has(id)) return {make: 1, burn: 0};
  if (fam === 'wood') {
    const T = WOODS.get(id), U = T.special && useOf(race, id) !== 'master' ? WOODS.get(T.plain) : T;
    return {make: U.dmg * U.dur, burn: U.fuel};
  }
  if (fam === 'stone') { const S = STONES.get(id); return {make: S.dur, burn: 0}; }
  return {make: 1, burn: 0};
}

// Take `n` of a family from the stock for a use:
//   'make'  — a piece of this family (a wooden bow): the best first that the maker's race may work;
//   'build' — a building's walls: the best first;
//   'spend' — spent on the way to something else (a recipe whose piece is not of the family): the worst first;
//   'burn'  — kindling and fuel: the worst first, so the best is not burnt.
// A special member (holywood) is the best only to its master's 'make': for every other use it is taken last — nobody
// burns or builds with it while anything else is there. The total in w.stock comes down too.
// → the member most of it was (what the piece is made of), or null when nothing was there
const SPECIAL_LAST = id => (WOODS.has(id) && WOODS.get(id).special ? 1 : 0);
export function takeKind(w, fam, n, use = 'make', race = null) {
  const res = FAMILIES[fam]?.resource; if (!res || n <= 0) return null;
  const L = settle(w, fam), best = use === 'make' || use === 'build';
  const last = id => (use === 'make' && race && useOf(race, id) === 'master' ? 0 : SPECIAL_LAST(id));
  const order = Object.keys(L).filter(id => use !== 'make' || !race || mayMake(race, id))
    .sort((p, q) => last(p) - last(q) || (best ? worth(fam, q, race).make - worth(fam, p, race).make : worth(fam, p, race).make - worth(fam, q, race).make));
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
  const L = settle(w, fam);
  if (id) L[id] = (L[id] || 0) + n; else addOfLand(w, fam, L, n);
  w.stock[res] = (w.stock[res] || 0) + n;
}

// may one of this race do the work that gets a family out of the land (data/kinds.js 'nomake', 'taboo'): felling for
// wood, quarrying for stone, digging for ore. Not when it may get none of what the land here would give.
// (digging gets ore: the metal it becomes is what the race's rule is about — data/kinds.js EXTRACTS)
export function mayExtract(w, race, jobId) {
  const fam = EXTRACTS[jobId];
  if (!fam || !race) return true;
  const members = fam === 'metal' ? [ORE_METAL[JOBS.get(jobId).resource] || JOBS.get(jobId).resource] : Object.keys(landMix(w, fam));
  return members.some(id => mayMake(race, id));
}
