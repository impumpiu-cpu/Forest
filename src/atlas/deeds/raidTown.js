// The raid of a people of raiders (the orcs' row lists it): a town with warriors goes for the nearest town of a realm it
// has met and dislikes within DIPLOMACY.raidReach — a few times a year for the realm (raidsPerYear), each town with the
// year's chance spread over the seasons. The loot grows the raiders' town, the beaten town loses `raidLoss`; either way
// the standing between the two sinks by `raid`.
import {cap1} from '../../core/util.js';
import {plunder, plunderWords, lootOf, driveOff} from '../treasury.js';
import {killHeads, takeHeads, addGroup, killShare} from '../population.js';
import {TOWN_MONEY} from '../../data/townBuildings.js';
import {WORLD_PEOPLES as WP_CULT} from '../../data/peoples.js';
const cultOf = realm => WP_CULT.get(realm.people)?.warCult || null;   // (data/peoples.js warCult: the greenskins raid anyone, kin too)
import {DIPLOMACY as D} from '../../data/diplomacy.js';
import {SEASONS_PER_YEAR} from '../../data/atlas.js';
import {relation, attitude, meet, fight, raidGraves} from '../diplomacy.js';
import {townFx, raidShare, townLabel, might} from '../towns.js';
import {raidSite} from '../sites.js';
import {realmLabel, realmLabelGen} from '../realms.js';
import {BURNT} from '../peoples.js';
import {scaleOf} from '../tectonics.js';
import {liveTowns} from './realm.js';
import {countRaid, raidsDone} from './shared.js';


export const raidTown = {
  want(a, realm, {r}) {
    const y = a.hist.year;
    const often = cultOf(realm)?.raids ?? 1;   // the cult of war raids the more (data/peoples.js warCult)
    if (raidsDone(realm, y, often, D)) return null;
    const out = [], k = scaleOf(a), towns = a.towns.filter(t => t.alive);
    for (const t of liveTowns(a, realm)) {
      if (!townFx(t).defence || r() > D.raidChance * often / SEASONS_PER_YEAR) continue;   // only a camp with warriors goes raiding
      let target = null, bd = D.raidReach * k;
      // the nearest; the cult of war weighs what it would carry off against how likely it is to win (atlas/treasury.js lootOf)
      const cult = cultOf(realm), mt = cult ? might(t, townFx(t)) : 0;
      let bv = 0;
      for (const o of towns) if (o.realm !== realm.id && relation(a, realm.id, o.realm) && (cult || attitude(a, realm.id, o.realm) < 0)) {
        const d = Math.hypot(t.x - o.x, t.y - o.y); if (d >= D.raidReach * k) continue;
        if (!cult) { if (d < bd) { bd = d; target = o; } continue; }
        const v = (lootOf(o) + o.pop) * Math.min(TOWN_MONEY.plunder.dare, mt / Math.max(1, might(o, townFx(o)))); if (v > bv) { bv = v; target = o; }
      }
      if (target) out.push([{from: t.id, target: target.id}, 1, () => `${t.name}: ${target.name} в досягаемости, ${realmLabel(a, target.realm)} нам не любы`]);
    }
    return out.length ? out : null;
  },
  act(a, realm, plan, {r}) {
    const t = a.towns.find(x => x.id === plan.from), target = a.towns.find(x => x.id === plan.target);
    if (!t?.alive || !target?.alive) return null;
    const y = a.hist.year;
    countRaid(realm, y);
    const rel = meet(a, realm.id, target.realm, y);
    rel.att = Math.max(-5, rel.att - D.raid * (cultOf(realm)?.raid ?? 1));
    if (fight(t, r) > fight(target, r)) {
      const loss = D.raidLoss * raidShare(townFx(target));
      const lost = target.pop * loss;   // the raiders carry off D.raidTake of those lost as captives
      const slaves = driveOff(t, target, lost);   // the cult of war drives its captives off as slaves (atlas/treasury.js)
      const taken = slaves ? slaves : lost * D.raidTake;
      killHeads(a, target, lost - taken, 'raid'); const G = takeHeads(a, target, taken, {how: 'taken'});   // the dead lie, the taken go
      if (!slaves) addGroup(a, t, G);   // (the raiders' captives settle among them as they are)
      raidGraves(a, target);
      const burnt = raidSite(a, target, r), got = plunder(t, target, TOWN_MONEY.plunder.raid);   // goods and gold carried off (atlas/treasury.js)
      return `${cap1(realmLabel(a, realm.id))} из ${townLabel(t, 2)} ${t.name} разграбили ${townLabel(target, 1)} ${target.name}${burnt ? `: ${BURNT[burnt.g]} ${burnt.name}` : ''}${plunderWords(got)}${slaves >= 1 ? `, угнали в рабство ${Math.round(slaves)}` : ''}.`;
    }
    killShare(a, t, D.repelled, 'raid');   // a beaten raid costs the raiders
    return `${cap1(realmLabel(a, target.realm))} отбили набег ${realmLabelGen(a, realm.id)} на ${townLabel(target, 1)} ${target.name}.`;
  },
};
