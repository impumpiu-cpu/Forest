// What the deeds share: distances and the leader's reach on the world map.
import {LEADER, TRIBE_RAID} from '../../data/lairs.js';
import {scaleOf} from '../tectonics.js';

export {dist} from '../../core/util.js';   // (one for all: core/util.js)
// how far a leader goes: its reach × the tribes' raid reach, scaled with the map
export const reachOf = a => TRIBE_RAID.reach * LEADER.reach * scaleOf(a);

// a realm's raids this year (realm.raids = {year, n, camps}): `n` — on towns (raidTown.js, captives.js), held to
// DIPLOMACY.raidsPerYear; `camps` — the greenskins' slave raids on the wild tribes' camps (captives.js), counted, never held
export function countRaid(realm, y, kind = 'n') {
  const R = realm.raids?.year === y ? realm.raids : (realm.raids = {year: y, n: 0, camps: 0});
  R[kind] = (R[kind] || 0) + 1;
}
export const raidsDone = (realm, y, often = 1, D) => realm.raids?.year === y && realm.raids.n >= D.raidsPerYear * often;
