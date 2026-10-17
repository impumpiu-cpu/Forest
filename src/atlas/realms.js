// Realms: the states of the world map. A people (data/peoples.js) is a race — a field of density
// with towns; a realm is a seat and the towns that hold to it. Every founding band starts a realm,
// so a race comes into the world as two; a new town joins the realm of the nearest town of its
// people. All dealings — attitudes, trade, wars, raids (atlas/diplomacy.js) — are between realms;
// two realms of one race start from their race's memory of itself. The seat is the capital
// (data/peoples.js CAPITAL): only it builds the throne hall, the palace and the mint.
//
// a.realms = [{id, people, name, capital: townId, founded, color}]
import {WORLD_PEOPLES, EPITHETS} from '../data/peoples.js';
import {ORE_GENESIS} from '../data/geology.js';
import {RIVERS} from '../data/hydrology.js';
import {biomeAt} from './biomes.js';
import {scaleOf} from './tectonics.js';
import {DIRS8} from './heap.js';

const lv = id => ORE_GENESIS.get(id).levels;
const near = (a, i, test) => {
  const x = i % a.w, y = (i / a.w) | 0;
  for (const [dx, dy] of DIRS8) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < a.w && ny < a.h && test(ny * a.w + nx)) return true; }
  return false;
};

// the names the land of a cell offers, best first
function epithets(a, i, P) {
  const f = a.f, out = [], k2 = scaleOf(a) ** 2;
  // a people that lives off the rock is named by it; the others by water and land
  if (P.ores) for (const id of ['gold', 'silver', 'gems', 'bronze', 'iron', 'coal']) if (f[`ore_${id}`][i] >= lv(id)[2]) out.push(...EPITHETS.ores[id]);
  if (near(a, i, j => f.ocean[j])) out.push(...EPITHETS.water.coast);
  if (f.flow[i] >= RIVERS.great * k2 || near(a, i, j => f.flow[j] >= RIVERS.great * k2)) out.push(...EPITHETS.water.great);
  else if (f.flow[i] >= RIVERS.river * k2 || near(a, i, j => f.flow[j] >= RIVERS.river * k2)) out.push(...EPITHETS.water.river);
  let lake = -1; near(a, i, j => { if (f.lake[j] >= 0) lake = f.lake[j]; return false; });
  if (lake >= 0) out.push(...(a.lakes[lake].salt ? EPITHETS.water.salt : EPITHETS.water.lake));
  const b = biomeAt(a, i); if (b && EPITHETS.biomes[b.id]) out.push(...EPITHETS.biomes[b.id]);
  out.push(...EPITHETS.else);
  return out;
}

export function foundRealm(a, t) {
  a.realms ||= [];
  const P = WORLD_PEOPLES.get(t.people), used = new Set(a.realms.filter(r => r.people === t.people).map(r => r.name));
  const name = epithets(a, t.i, P).find(n => !used.has(n)) || `${EPITHETS.else[0]} ${used.size}`;
  const nth = a.realms.filter(r => r.people === t.people).length;
  // each realm of a race its own shade of the race's colour
  const shade = [1, 0.72, 1.25, 0.55, 1.45][nth % 5], color = P.color.map(v => Math.max(0, Math.min(255, Math.round(v * shade))));
  const r = {id: `r${a.realms.length + 1}`, people: t.people, name, capital: t.id, founded: a.hist.year, color};
  a.realms.push(r);
  t.realm = r.id; t.capital = true;
  return r;
}

export const realmOf = (a, id) => a.realms.find(r => r.id === id);
export const realmLabel = (a, id) => { const r = realmOf(a, id); return `${WORLD_PEOPLES.get(r.people).label} ${r.name}`; };
export const realmLabelGen = (a, id) => { const r = realmOf(a, id); return `${WORLD_PEOPLES.get(r.people).labelGen} ${r.name}`; };
export const realmPeople = (a, id) => realmOf(a, id).people;
export const capitalOf = (a, id) => a.towns.find(t => t.id === realmOf(a, id).capital) || null;
export const realmTowns = (a, id) => a.towns.filter(t => t.alive && t.realm === id);

// a new town holds to the realm of the nearest town of its people
export function joinRealm(a, t) {
  let best = null, bd = Infinity;
  for (const o of a.towns) if (o !== t && o.alive && o.people === t.people && o.realm) { const d = Math.hypot(o.x - t.x, o.y - t.y); if (d < bd) { bd = d; best = o; } }
  if (best) t.realm = best.realm; else foundRealm(a, t);
  return t.realm;
}
