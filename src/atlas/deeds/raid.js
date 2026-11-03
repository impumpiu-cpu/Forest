// Raid: a strike on the nearest town in reach of a people the lair's race dislikes (data/relations.js); the dead, the
// demons and the beasts go for anyone.
//   the lair (ctx.role 'lair', atlas/lairs.js): in autumn, a camp strong enough (TRIBE_RAID.from) with the year's chance,
//     within TRIBE_RAID.reach — a thinking owner, the dead or the demons; a beast's lair raids no town without a leader.
//     Its might is the camp's strength × its kind's power × TRIBE_RAID.might (a calamity's boss leads its own: CAL.boss.might);
//     a strong raid walks the map as a party (data/parties.js threshold) and strikes when it gets there, a weak one is
//     settled where it stands. The loot feeds the camp, a beating thins it.
//   the leader (ctx.role 'leader', atlas/leaders.js): a party under the leader within its own reach; the loot feeds the
//     lair when the party is home, a beating may kill the leader. A beast's leader goes for a town less often
//     (LEADER.beastRaid): it hunts the woods.
import {LEADER, TRIBE_RAID} from '../../data/lairs.js';
import {PARTIES} from '../../data/parties.js';
import {SPECIES} from '../../data/species.js';
import {RELATIONS} from '../../data/relations.js';
import {WORLD_PEOPLES} from '../../data/peoples.js';
import {strikeTown, raidWho, raidBand, campMight} from '../lairs.js';
import {townLabel} from '../towns.js';
import {sendParty} from '../parties.js';
import {leaderFalls, leaderName} from '../leaders.js';
import {scaleOf} from '../tectonics.js';
import {dist, reachOf} from './shared.js';

// whether the lair's kind raids this town: the dead, the demons and the beasts raid anyone, a thinking race its foes
export const raider = (L, t) => {
  const race = SPECIES.get(L.species);
  if (L.undead || L.fiend || !race.rel) return true;
  if (WORLD_PEOPLES.get(t.people).warCult && race.rel === SPECIES.get(WORLD_PEOPLES.get(t.people).race).rel) return true;   // the greenskins fight their own kin as well (data/peoples.js warCult)
  return (RELATIONS[race.rel]?.[SPECIES.get(WORLD_PEOPLES.get(t.people).race).rel] ?? 0) < 0;
};

// the nearest town within reach the lair would raid
function nearestTown(a, l, L, reach) {
  let town = null, td = reach;
  for (const t of a.towns || []) if (t.alive && raider(L, t)) { const d = dist(l, t); if (d < td) { td = d; town = t; } }
  return town;
}

export const raid = {
  want(a, l, {L, sp, role, season, r}) {
    if (role === 'lair') {
      // autumn, a camp of the thinking wild, the dead or the demons (not a vampire's manor), strong enough, with the year's chance
      if (season !== 'autumn' || !(L.tribe || L.undead || L.fiend) || L.at === 'town' || !a.towns || l.leader) return null;
      if (l.strength < TRIBE_RAID.from || r() > TRIBE_RAID.chance) return null;
      const town = nearestTown(a, l, L, TRIBE_RAID.reach * scaleOf(a));
      return town ? [[{goal: town.i, target: town.id}, 1, () => `осень, стан силён: ${town.name} в досягаемости`]] : null;
    }
    const town = nearestTown(a, l, L, reachOf(a));
    if (!town) return null;
    const beast = ['beast', 'mindless'].includes(sp.mind || 'beast');   // a beast's or the dead's lair: it raids no town
    return [[{goal: town.i, target: town.id}, LEADER.plans.raid * (beast ? LEADER.beastRaid : 1), () => `город в досягаемости: ${town.name}`]];
  },
  // the lair without a leader: the raid sets out, or strikes where it stands → the chronicle line or null
  act(a, l, plan, {L, r}) {
    const T = TRIBE_RAID, target = a.towns.find(t => t.id === plan.target), B = raidBand(a, l, L, r);   // who goes: the land about the lair says
    const tribe = campMight(l, L, B.k, r);
    if (tribe >= PARTIES.threshold) {
      const p = sendParty(a, 'raid', l.i, target.i, {owner: l.id, plan: 'raid', target: target.id, might: tribe, speed: B.riders ? 'rider' : 'foot', label: B.who, color: L.color});
      if (p) return `${B.who} ${L.from} «${l.name}» ${L.leads ? 'на' : 'двинулись на'} ${townLabel(target, 1)} ${target.name}.`;
      return null;   // no way there (the sea between): the raid does not happen, rather than strike across the water
    }
    return strikeTown(a, l, L, target, tribe, r, true, B.who).line;
  },
  // the leader's: told as it sets out (the towns see it coming)
  told(a, l, o) { const t = a.towns.find(x => x.id === o.target); return t ? `${leaderName(l)} из «${l.name}» выступил в набег: на ${townLabel(t, 1)} ${t.name}.` : null; },
  // the party at the town: the leader's, or the camp's own
  arrive(a, p, l, L, rnd, say) {
    const t = a.towns.find(x => x.id === p.target);
    if (!t?.alive) return;
    const {line, won} = strikeTown(a, l, L, t, p.might, rnd, false, p.kind === 'leader' ? raidWho(L) : p.label || raidWho(L));
    p.loot = won ? TRIBE_RAID.loot : 0;
    if (p.kind !== 'leader') { say(line); return; }
    say(`${line} Вёл их ${leaderName(l)}.`);
    if (p.loot) l.leader.deeds++;
    else if (rnd() < LEADER.fall) leaderFalls(a, l, 'beaten', say);
  },
  home(a, p, l) { if (p.loot) l.strength = Math.min(1, l.strength + p.loot); },
};
