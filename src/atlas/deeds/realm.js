// What the deeds of a realm share (the role: atlas/realms.js realmRole; the relations' body: atlas/diplomacy.js):
// the realm's relations, its live towns, who is at war with whom.
import {relation} from '../diplomacy.js';
import {realmTowns} from '../realms.js';

const key = (p, q) => (p < q ? `${p}:${q}` : `${q}:${p}`);
// the realm's relations with every realm it has met: [{kk, r, other}]
export function relationsOf(a, realm) {
  const out = [];
  for (const o of a.realms) {
    if (o.id === realm.id) continue;
    const r = relation(a, realm.id, o.id);
    if (r) out.push({kk: key(realm.id, o.id), r, other: o});
  }
  return out;
}
export const liveTowns = (a, realm) => realmTowns(a, realm.id);
export const armyOut = (a, kk) => (a.parties || []).some(x => x.kind === 'army' && x.war === kk && x.state !== 'gone');
