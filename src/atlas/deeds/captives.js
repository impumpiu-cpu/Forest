// Captives: a raid that takes people instead of killing them (data/lairs.js CAPTIVE_RAID). The deed of the camps of the
// thinking wild that keep slaves or eat their prisoners (goblins, gnolls, ogres), of the necromancer's tower (its dead
// need bodies), and of the orcs' realms — whichever species rows list it.
//   the lair (ctx.role 'lair'): as a tribe's raid (raid.js) — autumn, a strong camp, the year's chance, the nearest town of
//     a people it dislikes within reach; a strong party walks there, a weak one strikes where it stands. A town beaten
//     loses `loss` of its people into the lair's captivity (lair.captives, by people), the camp grows by `feed`; a beating
//     thins the camp as a raid's does. The captives waste at CAPTIVE_RAID.keep a year (atlas/lairs.js), and a caravan that
//     beats the lair's folk in its lands frees them (campaign/fight.js).
//   the realm (ctx.role 'realm'): a town with warriors raids the nearest disliked town in DIPLOMACY.raidReach (raidTown.js);
//     a win takes `realm.loss` of its people — the raiding town grows by `grow` of them, the realm counts them (realm.captives).
import {TRIBE_RAID, CAPTIVE_RAID as CR} from '../../data/lairs.js';
import {DIPLOMACY as D} from '../../data/diplomacy.js';
import {PARTIES} from '../../data/parties.js';
import {SEASONS_PER_YEAR} from '../../data/atlas.js';
import {ROT} from '../../data/lairs.js';
import {raidWho, raidBand, campMight, hitTown} from '../lairs.js';
import {townFx, might, raidShare, townLabel} from '../towns.js';
import {relation, attitude, meet, fight, barrows} from '../diplomacy.js';
import {realmLabel, realmLabelGen} from '../realms.js';
import {sendParty} from '../parties.js';
import {scaleOf} from '../tectonics.js';
import {dist} from './shared.js';
import {raider} from './raid.js';
import {liveTowns} from './realm.js';

const cap1 = s => s[0].toUpperCase() + s.slice(1);
const plural = (n, one, few, many) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many; };
const heads = n => `${n} ${plural(n, 'жителя', 'жителей', 'жителей')}`;

// the raid for captives (lairs.js hitTown): the town loses people into captivity, not into graves; they live at the lair
export function takeCaptives(a, lair, L, target, tribe, rnd, atOnce, who = raidWho(L)) {
  return hitTown(a, lair, L, target, tribe, rnd, atOnce, fx => {
    const n = Math.max(1, Math.round(target.pop * CR.loss * raidShare(fx)));
    target.pop = Math.max(0, target.pop - n);
    (lair.captives ||= {})[target.people] = (lair.captives[target.people] || 0) + n;
    if (atOnce) lair.strength = Math.min(1, lair.strength + CR.feed);
    barrows(a, target.i, Math.max(1, Math.round(scaleOf(a))), ROT.raidGraves * CR.graves);   // a few fall on the way to the ropes
    return `${who} ${L.from} «${lair.name}» увели в полон ${heads(n)} из ${townLabel(target, 2)} ${target.name}.`;
  }, ': в полон никого не дали');
}

export const captives = {
  want(a, actor, {L, role, season, r}) {
    if (role === 'lair') {
      if (season !== 'autumn' || !(L.tribe || L.undead) || L.at === 'town' || !a.towns || actor.leader) return null;
      if (actor.strength < TRIBE_RAID.from || r() > CR.chance) return null;
      let town = null, td = TRIBE_RAID.reach * scaleOf(a);
      for (const t of a.towns) if (t.alive && t.pop >= 20 && raider(L, t)) { const d = dist(actor, t); if (d < td) { td = d; town = t; } }
      return town ? [[{goal: town.i, target: town.id}, 1, () => `осень, стан силён: в ${town.name} есть кого взять`]] : null;
    }
    if (role !== 'realm') return null;
    const y = a.hist.year;
    if (actor.raids?.year === y && actor.raids.n >= D.raidsPerYear) return null;
    const out = [], k = scaleOf(a), towns = a.towns.filter(t => t.alive);
    for (const t of liveTowns(a, actor)) {
      if (!townFx(t).defence || r() > CR.realm.chance / SEASONS_PER_YEAR) continue;
      let target = null, bd = D.raidReach * k;
      for (const o of towns) if (o.realm !== actor.id && o.pop >= 20 && relation(a, actor.id, o.realm) && attitude(a, actor.id, o.realm) < 0) {
        const d = Math.hypot(t.x - o.x, t.y - o.y); if (d < bd) { bd = d; target = o; }
      }
      if (target) out.push([{from: t.id, target: target.id}, 1, () => `${t.name}: в ${target.name} есть кого взять, ${realmLabel(a, target.realm)} нам не любы`]);
    }
    return out.length ? out : null;
  },
  act(a, actor, plan, {L, role, r}) {
    if (role === 'lair') {
      const target = a.towns.find(t => t.id === plan.target), B = raidBand(a, actor, L, r);   // who goes: the land about the lair says
      const tribe = campMight(actor, L, B.k, r);
      if (tribe >= PARTIES.threshold) {
        const p = sendParty(a, 'raid', actor.i, target.i, {owner: actor.id, plan: 'captives', target: target.id, might: tribe, speed: B.riders ? 'rider' : 'foot', label: B.who, color: L.color});
        return p ? `${B.who} ${L.from} «${actor.name}» ${L.leads ? 'за пленными на' : 'двинулись за пленными на'} ${townLabel(target, 1)} ${target.name}.` : null;
      }
      return takeCaptives(a, actor, L, target, tribe, r, true, B.who).line;
    }
    // the realm's
    const t = a.towns.find(x => x.id === plan.from), target = a.towns.find(x => x.id === plan.target);
    if (!t?.alive || !target?.alive) return null;
    const y = a.hist.year;
    actor.raids = actor.raids?.year === y ? {year: y, n: actor.raids.n + 1} : {year: y, n: 1};
    const rel = meet(a, actor.id, target.realm, y);
    rel.att = Math.max(-5, rel.att - D.raid);
    if (fight(t, r) > fight(target, r)) {
      const n = Math.max(1, Math.round(target.pop * CR.realm.loss * raidShare(townFx(target))));
      target.pop = Math.max(0, target.pop - n); t.pop += n * CR.realm.grow;
      (actor.captives ||= {})[target.people] = (actor.captives[target.people] || 0) + n;
      barrows(a, target.i, Math.max(1, Math.round(scaleOf(a))), ROT.raidGraves * CR.graves);
      return `${cap1(realmLabel(a, actor.id))} из ${townLabel(t, 2)} ${t.name} увели в полон ${heads(n)} из ${townLabel(target, 2)} ${target.name}.`;
    }
    t.pop *= 1 - D.repelled;   // a beaten raid costs the raiders
    return `${cap1(realmLabel(a, target.realm))} отбили набег ${realmLabelGen(a, actor.id)} на ${townLabel(target, 1)} ${target.name}: в полон никого не дали.`;
  },
  // the lair's party at the town
  arrive(a, p, l, L, rnd, say) {
    const t = a.towns.find(x => x.id === p.target);
    if (!t?.alive) return;
    const {line, won} = takeCaptives(a, l, L, t, p.might, rnd, false, p.label || raidWho(L));
    p.loot = won ? CR.feed : 0;
    say(line);
  },
  home(a, p, l) { if (p.loot) l.strength = Math.min(1, l.strength + p.loot); },
};
