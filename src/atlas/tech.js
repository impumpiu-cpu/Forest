// Technologies of the realms (data/tech.js; docs/TABLE.md, этап 7). A realm knows a list of them (r.tech); each year
// (spring) it may find one its race can know, whose demands its towns meet. What a technology opens, a town of a realm
// without it cannot build (atlas/towns.js canBuild), and a town's smith and market do not work its metals
// (campaign/town.js). A realm born of a schism keeps what the old one knew. A world saved before technologies (no
// r.tech) knows them all, as it always did.
// The finds draw from their own stream (seed:atlas:tech), kept by its position in a.techRnd.
import {mulberry, seedNumber} from '../core/rng.js';
import {TECHS, TECH_RULES, techOfBuilding, techOfMaterial} from '../data/tech.js';
import {ERAS} from '../data/history.js';
import {realmOf, realmLabel} from './realms.js';

const eraIndex = id => ERAS.ids().indexOf(id);

// whether a realm knows a technology (a realm with no list — an old save — knows all)
export function knows(a, realmId, techId) {
  if (!techId) return true;
  const r = realmId != null ? realmOf(a, realmId) : null;
  return !r || !r.tech || r.tech.includes(techId);
}
// a town may build this / work this metal by its realm's knowledge
export const techAllowsBuilding = (a, t, id) => knows(a, t.realm, techOfBuilding(id));
export const techAllowsMaterial = (a, t, id) => knows(a, t.realm, techOfMaterial(id));

// whether a realm could find a technology now: its race may know it, its era has come, it knows what it needs first,
// one of its towns is big enough and has one of the buildings asked for
export function canFind(a, r, T) {
  if (r.tech?.includes(T.id)) return false;
  if (T.races && !T.races.includes(r.people)) return false;
  if (T.era && eraIndex(a.hist?.era) < eraIndex(T.era)) return false;
  if (T.requires && !T.requires.every(id => r.tech?.includes(id))) return false;
  const towns = (a.towns || []).filter(t => t.alive && t.realm === r.id && t.tier >= (T.tier ?? 0));
  if (!towns.length) return false;
  return !T.needsAny || towns.some(t => T.needsAny.some(b => t.built.includes(b)));
}

// ── a year of the realms' finds (spring)
export function stepTech(a, say) {
  if (!a.realms?.length || a.hist.season !== 0) return;
  const r = mulberry(a.techRnd ?? seedNumber(`${a.cfg.seed}:atlas:tech`));
  for (const realm of a.realms) {
    if (realm.fallen != null || !realm.tech) continue;
    for (const T of TECHS.all()) {
      if (!canFind(a, realm, T) || r() >= (T.chance ?? TECH_RULES.chance)) continue;
      realm.tech.push(T.id);
      say(`${realmLabel(a, realm.id).replace(/^./, c => c.toUpperCase())} освоили ${T.label.toLowerCase()}.`);
    }
  }
  a.techRnd = r.state;
}
