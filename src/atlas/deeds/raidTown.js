// The raid of a people of raiders (the orcs' row lists it): a town with warriors goes for the nearest town of a realm it
// has met and dislikes within DIPLOMACY.raidReach — a few times a year for the realm (raidsPerYear), each town with the
// year's chance spread over the seasons. The loot grows the raiders' town, the beaten town loses `raidLoss`; either way
// the standing between the two sinks by `raid`.
import {plunder} from '../treasury.js';
import {TREASURY} from '../../data/macro.js';
import {DIPLOMACY as D} from '../../data/diplomacy.js';
import {SEASONS_PER_YEAR} from '../../data/atlas.js';
import {relation, attitude, meet, fight, raidGraves} from '../diplomacy.js';
import {townFx, raidShare, townLabel} from '../towns.js';
import {raidSite} from '../sites.js';
import {realmLabel, realmLabelGen} from '../realms.js';
import {BURNT} from '../peoples.js';
import {scaleOf} from '../tectonics.js';
import {liveTowns} from './realm.js';

const cap1 = s => s[0].toUpperCase() + s.slice(1);

export const raidTown = {
  want(a, realm, {r}) {
    const y = a.hist.year;
    if (realm.raids?.year === y && realm.raids.n >= D.raidsPerYear) return null;
    const out = [], k = scaleOf(a), towns = a.towns.filter(t => t.alive);
    for (const t of liveTowns(a, realm)) {
      if (!townFx(t).defence || r() > D.raidChance / SEASONS_PER_YEAR) continue;   // only a camp with warriors goes raiding
      let target = null, bd = D.raidReach * k;
      for (const o of towns) if (o.realm !== realm.id && relation(a, realm.id, o.realm) && attitude(a, realm.id, o.realm) < 0) {
        const d = Math.hypot(t.x - o.x, t.y - o.y); if (d < bd) { bd = d; target = o; }
      }
      if (target) out.push([{from: t.id, target: target.id}, 1, () => `${t.name}: ${target.name} в досягаемости, ${realmLabel(a, target.realm)} нам не любы`]);
    }
    return out.length ? out : null;
  },
  act(a, realm, plan, {r}) {
    const t = a.towns.find(x => x.id === plan.from), target = a.towns.find(x => x.id === plan.target);
    if (!t?.alive || !target?.alive) return null;
    const y = a.hist.year;
    realm.raids = realm.raids?.year === y ? {year: y, n: realm.raids.n + 1} : {year: y, n: 1};
    const rel = meet(a, realm.id, target.realm, y);
    rel.att = Math.max(-5, rel.att - D.raid);
    if (fight(t, r) > fight(target, r)) {
      const loss = D.raidLoss * raidShare(townFx(target));
      const lost = target.pop * loss;   // the raiders carry off D.raidTake of those lost as captives
      target.pop -= lost; t.pop += lost * D.raidTake; raidGraves(a, target);
      plunder(a, target, realm.id, TREASURY.loot.raid);   // the raiders carry off what keeps, to their realm's treasury
      const burnt = raidSite(a, target, r);
      return `${cap1(realmLabel(a, realm.id))} из ${townLabel(t, 2)} ${t.name} разграбили ${townLabel(target, 1)} ${target.name}${burnt ? `: ${BURNT[burnt.g]} ${burnt.name}` : ''}.`;
    }
    t.pop *= 1 - D.repelled;   // a beaten raid costs the raiders
    return `${cap1(realmLabel(a, target.realm))} отбили набег ${realmLabelGen(a, realm.id)} на ${townLabel(target, 1)} ${target.name}.`;
  },
};
