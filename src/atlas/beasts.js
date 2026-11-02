// The war beasts of a greenskin town (data/peoples.js WAR_BEASTS; the pits: data/townBuildings.js fightpits). A season of
// the pits: a beast or a monster of the land about — the densest in the town's coarse cell, the bigger the better — is
// caught and broken to war, while there are fewer than one for every WAR_BEASTS.per people. Its worth (health × blow ×
// WAR_BEASTS.men) stands as so many of the town's people in its might (atlas/towns.js might) and its armies.
// t.warBeasts = {list: {species: n}, men}
import {WAR_BEASTS as WB} from '../data/peoples.js';
import {SPECIES} from '../data/species.js';
import {faunaCell} from './fauna.js';

const caught = sp => sp && (sp.kind === 'beast' || sp.kind === 'monster') && sp.mind !== 'sentient';   // (no thinking kind: a troll is a greenskin)
export const beastWorth = sp => (sp.hp || 1) * (sp.attack?.power || 1) * WB.men;

// a season of a town's pits: → the species caught, or null
export function stepWarBeasts(a, t) {
  const denOf = id => id.split(':')[0];   // (a den is a recipe of its building: data/peoples.js WAR_BEASTS)
  if (!t.built.includes('fightpits') && !Object.keys(WB.dens).some(id => t.built.includes(denOf(id)))) return null;
  const B = t.warBeasts ||= {list: {}, men: 0};
  const total = {...B.list};
  for (const p of a.parties || []) if (p.kind === 'army' && p.from === t.id && p.state !== 'gone' && !p.returned)
    for (const [sp, n] of Object.entries(p.warBeasts || {})) total[sp] = (total[sp] || 0) + n;
  const held = Object.values(total).reduce((s, n) => s + n, 0);
  if (held >= Math.max(1, Math.floor(t.pop / WB.per))) return null;
  const keep = sp => { B.list[sp] = (B.list[sp] || 0) + 1; B.men = Object.entries(B.list).reduce((s, [id, n]) => s + n * beastWorth(SPECIES.get(id)), 0); return sp; };
  const dens = Object.entries(WB.dens).filter(([id, d]) => t.built.includes(denOf(id)) && (t.work?.[id] ?? 0) >= WB.work && (a.hist?.step || 0) % d.every === 0)
    .sort(([, p], [, q]) => (total[p.species] || 0) - (total[q.species] || 0));
  if (dens.length) return keep(dens[0][1].species);
  if (!t.built.includes('fightpits') || !a.fauna) return null;
  const j = faunaCell(a, t.i);
  let best = null, bv = 0;
  for (const s of a.fauna.list) {
    const sp = SPECIES.has(s.id) ? SPECIES.get(s.id) : null, n = s.N[j];   // (the field of the dead is no species)
    if (!caught(sp) || !(n >= WB.least)) continue;
    const v = n * beastWorth(sp);
    if (v > bv) { bv = v; best = sp; }
  }
  if (!best) return null;
  return keep(best.id);
}
