// The outlying works of towns and the net of supply between them (data/sites.js).
//
// A site is a town's building that stands outside it (data/townBuildings.js `site`): a node in a
// cell of its own within the town's reach, joined to the town by a track. The town chooses it like
// any building (atlas/towns.js); placeSite finds the cell — the best-fitting free ground near the
// town and its other works — and lays the track. A raid burns a site; the town then wants it again
// and builds it anew through the same choice. A dead site stays a while as a stump, then is forgotten.
//
// The net: each spring the towns count what they feed against what they need, and the surplus flows
// down the links to the towns that lack. A link that carries flow thickens, one that carries none
// wastes away (data/sites.js NET) — the veins of a slime mould; the thick ones wear into roads
// (atlas/roads.js). From this a village with many fields feeds the town beside it, and a big town may
// keep no fields at all.
//
// a.sites = [{id, town, kind, i, x, y, built, alive, died, path}];  a.siteAt = Int32Array (site index + 1, 0 free)
// a.net = {links: Map(key → {p, q, c, flow}), year};  per town: t.sites (ids), t.supply = {own, got, gave}
import {linkKey} from './common.js';
import {SITES, NET} from '../data/sites.js';
import {killHeads} from './population.js';
import {DIPLOMACY} from '../data/diplomacy.js';
import {TOWN_BUILDINGS, TOWN_FX, TOWN_MONEY, foodNet} from '../data/townBuildings.js';
import {placeHas} from './towns.js';
import {placeNeed} from '../data/peoples.js';
import {findPath, tradeLinks} from './roads.js';
import {ARMY} from '../data/parties.js';
import {scaleOf} from './tectonics.js';
import {DIRS8} from './heap.js';

const FIT_NEEDS = ['fertile', 'arable', 'forest', 'pasture', 'grazing', 'ore', 'stone', 'water', 'coast', 'river'];

// whether a cell has what a building asks for; the land does not change, so the answer is kept per
// cell (roads and graves do change and are asked afresh)
export function cellHas(a, i, need) {
  if (need === 'road' || need === 'graves') return placeHas(a, i, need);
  const cache = a.needCache ||= {}, m = cache[need] ||= new Uint8Array(a.n);
  if (!m[i]) m[i] = placeHas(a, i, need) ? 2 : 1;
  return m[i] === 2;
}
// (a people reads a need its own way: data/peoples.js placeNeed — the greenskins' pasture is any open land)
const cellFits = (a, i, b, people) => (!b.needs || b.needs.every(nd => cellHas(a, i, placeNeed(people, nd)))) && (!b.needsAny || b.needsAny.some(nd => cellHas(a, i, placeNeed(people, nd))));

// how well the ground of a cell suits a building, 0 … 1: by what it asks for
function fitness(a, i, b, people) {
  const f = a.f, needs = [...(b.needs || []), ...(b.needsAny || [])].map(nd => placeNeed(people, nd));
  let v = 0, n = 0;
  for (const nd of needs) {
    if (!FIT_NEEDS.includes(nd)) continue;
    n++;
    v += nd === 'fertile' || nd === 'arable' ? f.fert[i] : nd === 'forest' ? f.trees[i] : nd === 'pasture' || nd === 'grazing' ? (cellHas(a, i, nd) ? 0.8 : 0) : cellHas(a, i, nd) ? 0.7 : 0;
  }
  return n ? v / n : 0.5;
}

export const siteRadius = (a, t) => Math.max(2, Math.round(SITES.radius[t.tier] * scaleOf(a)));
const footprint = (a, t) => Math.round(SITES.footprint[t.tier] * scaleOf(a));

// is the cell taken: by a site, by the town's own ground or another town's (`towns`: those whose ground may reach it)
function taken(a, i, x, y, towns = a.towns) {
  if (a.siteAt && a.siteAt[i]) return true;
  for (const t of towns) if (t.alive && Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) <= footprint(a, t)) return true;
  return false;
}

// the cell for a new site of this building near this town, or -1 when there is none
export function siteCell(a, t, b, rnd) {
  const f = a.f, R = siteRadius(a, t), x0 = t.x, y0 = t.y;
  // the towns whose ground may reach the window at all (the rest can take none of its cells)
  const near = a.towns.filter(o => o.alive && Math.max(Math.abs(o.x - x0), Math.abs(o.y - y0)) <= R + footprint(a, o));
  let best = -1, bv = -Infinity;
  for (let y = Math.max(0, y0 - R); y <= Math.min(a.h - 1, y0 + R); y++) for (let x = Math.max(0, x0 - R); x <= Math.min(a.w - 1, x0 + R); x++) {
    const i = y * a.w + x;
    if (f.ocean[i] || f.lake[i] >= 0 || taken(a, i, x, y, near) || !cellFits(a, i, b, t.people)) continue;
    let beside = 0;
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= a.w || ny >= a.h) continue;
      const j = ny * a.w + nx;
      if ((a.siteAt && a.siteAt[j]) || (f.road && f.road[j] > 0.25)) beside++;
    }
    const v = fitness(a, i, b, t.people) - SITES.close * Math.hypot(x - x0, y - y0) + SITES.beside * beside + (rnd ? 0.04 * rnd() : 0);
    if (v > bv) { bv = v; best = i; }
  }
  return best;
}

// is there a cell at all for a new site of this building near this town (the council asks it of every candidate: atlas/towns.js
// canBuild — the best cell is sought only when the building is placed, siteCell)
export function siteFits(a, t, b) {
  const f = a.f, R = siteRadius(a, t), x0 = t.x, y0 = t.y;
  const near = a.towns.filter(o => o.alive && Math.max(Math.abs(o.x - x0), Math.abs(o.y - y0)) <= R + footprint(a, o));
  for (let y = Math.max(0, y0 - R); y <= Math.min(a.h - 1, y0 + R); y++) for (let x = Math.max(0, x0 - R); x <= Math.min(a.w - 1, x0 + R); x++) {
    const i = y * a.w + x;
    if (!(f.ocean[i] || f.lake[i] >= 0 || taken(a, i, x, y, near) || !cellFits(a, i, b, t.people))) return true;
  }
  return false;
}

// the town has chosen a site building: put it in its cell and lay the track; null when no cell fits
export function placeSite(a, t, b, rnd) {
  const i = siteCell(a, t, b, rnd);
  if (i < 0) return null;
  a.sites ||= []; a.siteAt ||= new Int32Array(a.n); t.sites ||= [];
  const scratch = a.roadScratch ||= {g: new Float64Array(a.n).fill(Infinity), came: new Int32Array(a.n), touched: []};
  const path = findPath(a, i, t.i, t.people, scratch) || [i, t.i];
  const s = {id: a.sites.length + 1, town: t.id, kind: b.id, i, x: i % a.w, y: (i / a.w) | 0, built: a.hist.year, alive: true, died: 0, path};
  a.sites.push(s); a.siteAt[i] = s.id; t.sites.push(s.id);
  return s;
}

// a site burns: the town loses one unit of the building (atlas/economy.js: twelve fields are one farmland) and wants it
// again; while units of it are left the site stands, the last one gone leaves a stump a while
export function razeSite(a, s, year) {
  if (!s.alive) return;
  const t = a.towns.find(t => t.id === s.town);
  if (t) {
    const k = t.built.indexOf(s.kind); if (k >= 0) t.built.splice(k, 1);
    if (t.alive !== false && t.built.includes(s.kind)) return;   // the rest of the farmland stands
    t.sites = (t.sites || []).filter(id => id !== s.id);
  }
  s.alive = false; s.died = year; a.siteAt[s.i] = 0;
}
// a raid on a town burns one of its works, sometimes; returns the building burnt or null
export function raidSite(a, t, rnd) {
  const mine = (t.sites || []).map(id => a.sites[id - 1]).filter(s => s.alive);
  if (!mine.length || rnd() > SITES.burn) return null;
  const s = mine[(rnd() * mine.length) | 0], b = TOWN_BUILDINGS.get(s.kind);
  razeSite(a, s, a.hist.year);
  // the hands that worked it die with it (data/diplomacy.js warLoss.work): the field is burnt with the reapers in it
  const [lo, hi] = DIPLOMACY.warLoss.work, hands = Math.min(t.pop, (b.jobs || 0) * (lo + (hi - lo) * rnd()));
  if (hands > 0) killHeads(a, t, hands, 'field', {band: 1});
  return b;
}
// a town is razed: all its works with it
export function razeSites(a, t, year) {
  for (const id of t.sites || []) razeSite(a, a.sites[id - 1], year);
  // the net forgets the town at once: no link keeps a share of a living town's surplus for a dead end
  if (a.net) for (const [key, l] of a.net.links) if (l.p === t || l.q === t) a.net.links.delete(key);
  a.netIdx = null;   // (the index of the links by town: made again — atlas/treasury.js linksOf)
}

// old stumps are forgotten
export function forgetSites(a, year) {
  if (!a.sites) return;
  for (const s of a.sites) if (!s.alive && s.died && year - s.died > SITES.remember) s.died = -1;
}

export const siteAt = (a, i) => (a.siteAt && a.siteAt[i] ? a.sites[a.siteAt[i] - 1] : null);
export const townSites = (a, t) => (t.sites || []).map(id => a.sites[id - 1]).filter(s => s.alive);

// ── the net of supply

// a year of the net: the links are renewed, the surplus of each town flows to the lacking towns
// it is linked with, the links thicken or waste by the flow. `feeds` maps town id → [what it feeds
// (people) before any supply, the room its houses give]; afterwards t.supply = {own, got, gave}
// and the flows sit on the links.
export function stepNet(a, feeds) {
  const net = a.net ||= {links: new Map()}, L = net.links;
  for (const l of L.values()) l.flow = 0;
  // renew the links: the pairs that trade now keep or get a link, the rest waste away
  const alive = new Set();
  for (const [t, o] of tradeLinks(a, NET.links, NET.reach)) {
    const key = linkKey(t, o); alive.add(key);
    if (!L.has(key)) L.set(key, {p: t, q: o, c: NET.start, flow: 0});
    else delete L.get(key).via;   // (a route abroad through other lands whose ends have come to neighbour: a link like any — atlas/treasury.js farWays)
  }
  // a link to a razed town dies with it: a dead end must not keep a share of the living town's surplus
  for (const [key, l] of L) if (!l.p.alive || !l.q.alive) L.delete(key); else if (!alive.has(key)) { l.c *= 1 - NET.decay; if (l.c < NET.min) L.delete(key); }
  // what each town has over its need, or lacks
  const surplus = new Map(), deficit = new Map(), outC = new Map();
  for (const t of a.towns) {
    if (!t.alive) continue;
    const [own, room] = feeds.get(t.id) || [0, 0];
    t.supply = {own, got: 0, gave: 0};
    // a town has either a surplus (its land feeds more than `keep` × its people) or a lack (less than its
    // houses hold), never both: the one that gives does not take back down the same link the same year
    const sur = NET.give * Math.max(0, own - NET.keep * t.pop);
    surplus.set(t.id, sur); deficit.set(t.id, sur > 0 ? 0 : Math.max(0, Math.min(room, NET.want * t.pop) - own));
  }
  for (const l of L.values()) { outC.set(l.p.id, (outC.get(l.p.id) || 0) + l.c); outC.set(l.q.id, (outC.get(l.q.id) || 0) + l.c); }
  // the flow: each surplus is split among the town's links by their conductance, and each link lets
  // through its share, capped by what the other end lacks and by the conductance itself
  const send = (from, to, l) => {
    const s = surplus.get(from.id), d = deficit.get(to.id);
    if (!(s > 0) || !(d > 0)) return;
    const share = l.c / (outC.get(from.id) || 1), f = Math.min(l.c * s * share, d);
    if (f <= 0) return;
    surplus.set(from.id, s - f); deficit.set(to.id, d - f);
    from.supply.gave += f; to.supply.got += f; l.flow += f;
  };
  for (const l of L.values()) { send(l.p, l.q, l); send(l.q, l.p, l); }
  // the links thicken by the flow against the need of the fed town — the food, and the goods bought down them (atlas/treasury.js
  // l.goods: TOWN_MONEY.link gold of them count as a person fed) — and waste a little every year
  for (const l of L.values()) {
    if (l.goods) { l.flow += l.goods / TOWN_MONEY.link; l.goods = 0; }
    const need = Math.max(60, Math.min(l.p.pop, l.q.pop));
    l.c = Math.min(1, l.c * (1 - NET.decay) + NET.grow * Math.min(1, l.flow / need));
    if (l.c < NET.min) L.delete(linkKey(l.p, l.q));
  }
  a.netIdx = null;   // (the index of the links by town: made again — atlas/treasury.js linksOf)
}

// towns that have come to live by their links: told once each
export function fedTowns(a) {
  const out = [];
  for (const t of a.towns) {
    if (!t.alive || !t.supply) continue;
    const by = t.supply.got / Math.max(1, t.pop);
    t.fedYears = by >= NET.fedBy ? (t.fedYears || 0) + 1 : 0;
    if (t.fedYears >= NET.years && !t.fedTold) {
      t.fedTold = true;
      // the link it is fed through most
      let best = null, bf = 0;
      for (const l of (a.net?.links.values() || [])) { const o = l.p === t ? l.q : l.q === t ? l.p : null; if (o && l.flow > bf && (o.supply?.gave || 0) > 0) { bf = l.flow; best = o; } }
      if (best) out.push([t, best, by]);
    }
  }
  return out;
}

// the food of a town's works that lie in the scourge of an army (a.f.scourge, atlas/diplomacy.js, above
// data/parties.js ARMY.scourged): lost this year
export function scourgedFood(a, t) {
  if (!a.f.scourge) return 0;
  let v = 0;
  for (const s of townSites(a, t)) if (a.f.scourge[s.i] > ARMY.scourged) v += Math.max(0, foodNet(TOWN_BUILDINGS.get(s.kind))) / TOWN_FX.flow.foodRef * TOWN_FX.flow.scourged;
  return v;
}
