// The guild's cages (data/rooms.js `cages`, HOUSE.cages; plan claude/guild-plan.md Г4; docs/GUILD.md «Клетки»; the author's word
// 13.11): its war beasts — bought in its town, only the beasts of prey that live about it and have no lair of their own; the
// beasts of a lair (a griffin, a wyvern) caught on the guild's own expeditions (data/contracts.js `capture`). A war beast goes
// with a party (K.beasts: {kind: 'war', species}) and fights at its side on the local map (campaign/camp.js), counted in its
// might in the quick mode (campaign/march.js caravanMight); the living come back to the cages.
//   G.cages = {beasts: [{id, species, hp}], nextId}
import {HOUSE} from '../data/rooms.js';
import {SPECIES} from '../data/species.js';
import {LAIRS} from '../data/lairs.js';
import {CAMP} from '../data/camp.js';
import {expectedStrength} from '../local/index.js';
import {faunaAt, scaleOf, toTown} from '../atlas/index.js';
import {roomBy} from './house.js';

export const cagesOf = G => (G.cages ||= {beasts: [], nextId: 1});
export const cageRoom = G => roomBy(G, 'cages', 'slots') || 0;
const lairBeasts = new Set(LAIRS.all().map(L => L.species).filter(Boolean));
// a war beast's worth: its strength in fresh eights (CAMP.foe.unit)
export const beastStrength = sp => expectedStrength(sp, {key: 'wild'}) / CAMP.foe.unit;
export const beastPrice = sp => Math.max(HOUSE.cages.floor, Math.round(HOUSE.cages.price * beastStrength(sp)));
export const beastLabel = sp => SPECIES.get(sp)?.label || sp;

// the town's market of war beasts: the beasts of prey with no lair that live about it (HOUSE.cages reach and least)
export function beastMarket(a, G) {
  const t = a.towns.find(x => x.id === G.town); if (!t || !a.fauna || !cageRoom(G)) return [];
  const R = Math.max(1, Math.round(HOUSE.cages.reach * scaleOf(a))), cells = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const x = t.x + dx, y = t.y + dy; if (x < 0 || y < 0 || x >= a.w || y >= a.h || dx * dx + dy * dy > R * R) continue;
    const i = y * a.w + x; if (!a.f.ocean?.[i]) cells.push(i);
  }
  const out = [];
  for (const s of a.fauna.list) {
    const S = SPECIES.has(s.id) ? SPECIES.get(s.id) : null; if (!S?.predator || s.lair || lairBeasts.has(s.id) || s.role === 'spirit' || s.role === 'folk') continue;
    const thick = cells.reduce((v, i) => v + faunaAt(a, i, s.id), 0) / Math.max(1, cells.length);
    if (thick >= HOUSE.cages.least) out.push({species: s.id, label: beastLabel(s.id), price: beastPrice(s.id), thick: Math.round(thick * 100) / 100});
  }
  return out.sort((p, q) => p.price - q.price);
}
export function buyWarWhy(a, G, sp) {
  if (!cageRoom(G)) return 'нет клеток';
  if (cagesOf(G).beasts.length >= cageRoom(G)) return 'клетки полны';
  const o = beastMarket(a, G).find(x => x.species === sp); if (!o) return 'таких зверей здесь не продают';
  if (G.gold < o.price) return `в казне нет ${o.price} зол.`;
  return null;
}
export function buyWarBeast(a, G, sp, pay) {
  const why = buyWarWhy(a, G, sp); if (why) throw new Error(why[0].toUpperCase() + why.slice(1) + '.');
  const p = beastPrice(sp); pay(G, -p, `клетки: куплен — ${beastLabel(sp)}`); toTown(a.towns.find(x => x.id === G.town), p);
  return cage(G, sp);
}
export const cage = (G, sp, hp = 1) => { const C = cagesOf(G), b = {id: C.nextId++, species: sp, hp}; C.beasts.push(b); return b; };
export function release(G, id) { const C = cagesOf(G); C.beasts = C.beasts.filter(b => b.id !== id); }
export function keepHome(G, id, home) { const b = cagesOf(G).beasts.find(x => x.id === id); if (b) b.home = !!home; }

// a party sets out: the war beasts not kept home go with it (only one party takes them: those in their cages now)
export function beastsOut(G, K) {
  const C = cagesOf(G), go = C.beasts.filter(b => !b.home && b.hp > 0);
  for (const b of go) K.beasts.push({id: K.nextBeast++, kind: 'war', species: b.species, hp: b.hp, job: null, rider: null, cage: b.id});
  C.beasts = C.beasts.filter(b => !go.includes(b));
  return go.length;
}
// a party home: its living war beasts back into the cages (the caught ones too: campaign/contracts.js captured)
export function beastsHome(G, K) {
  let n = 0;
  for (const b of K.beasts || []) if (b.kind === 'war' && b.hp > 0) { cagesOf(G).beasts.push({id: b.cage ?? cagesOf(G).nextId++, species: b.species, hp: b.hp}); n++; }
  K.beasts = (K.beasts || []).filter(b => b.kind !== 'war');
  return n;
}
// the quick mode's might of the war beasts with a party
export const warMight = K => (K.beasts || []).reduce((s, b) => s + (b.kind === 'war' && b.hp > 0 ? expectedStrength(b.species, {key: 'wild'}) * HOUSE.cages.might * b.hp : 0), 0);
