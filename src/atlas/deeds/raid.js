// Raid: the leader marches on the nearest town in its reach it may hope to beat — of a people its race dislikes
// (data/relations.js); the dead, the demons and the beasts go for anyone. The loot feeds the lair when the party is
// home; a beating may kill the leader. A beast's leader goes for a town less often (LEADER.beastRaid): it hunts the woods.
import {LEADER, TRIBE_RAID} from '../../data/lairs.js';
import {SPECIES} from '../../data/species.js';
import {RELATIONS} from '../../data/relations.js';
import {WORLD_PEOPLES} from '../../data/peoples.js';
import {strikeTown} from '../lairs.js';
import {townLabel} from '../towns.js';
import {leaderFalls, leaderName} from '../leaders.js';
import {dist, reachOf} from './shared.js';

// whether the lair's kind raids this town: the dead, the demons and the beasts raid anyone, a thinking race its foes
export const raider = (L, t) => {
  const race = SPECIES.get(L.species);
  if (L.undead || L.fiend || !race.rel) return true;
  return (RELATIONS[race.rel]?.[SPECIES.get(WORLD_PEOPLES.get(t.people).race).rel] ?? 0) < 0;
};

export const raid = {
  want(a, l, {L, sp}) {
    let town = null, td = reachOf(a);
    for (const t of a.towns || []) if (t.alive && raider(L, t)) { const d = dist(l, t); if (d < td) { td = d; town = t; } }
    if (!town) return null;
    const beast = (sp.mind || 'beast') === 'beast';
    return [[{plan: 'raid', goal: town.i, target: town.id}, LEADER.plans.raid * (beast ? LEADER.beastRaid : 1), () => `город в досягаемости: ${town.name}`]];
  },
  // told as it sets out: the towns see it coming
  told(a, l, o) { const t = a.towns.find(x => x.id === o.target); return t ? `${leaderName(l)} из «${l.name}» выступил в набег: на ${townLabel(t, 1)} ${t.name}.` : null; },
  arrive(a, p, l, L, rnd, say) {
    const t = a.towns.find(x => x.id === p.target);
    if (!t?.alive) return;
    const line = strikeTown(a, l, L, t, p.might, rnd, false);
    p.loot = /погибло/.test(line) ? TRIBE_RAID.loot : 0;
    say(`${line} Вёл их ${leaderName(l)}.`);
    if (p.loot) l.leader.deeds++;
    else if (rnd() < LEADER.fall) leaderFalls(a, l, 'beaten', say);
  },
  home(a, p, l) { if (p.loot) l.strength = Math.min(1, l.strength + p.loot); },
};
