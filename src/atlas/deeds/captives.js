// Captives: a raid that takes people instead of killing them (data/lairs.js CAPTIVE_RAID). The deed of the camps of the
// thinking wild that keep slaves or eat their prisoners (goblins, gnolls, ogres), of the necromancer's tower (its dead
// need bodies), and of the orcs' realms — whichever species rows list it.
//   the lair (ctx.role 'lair'): as a tribe's raid (raid.js) — autumn, a strong camp, the year's chance, the nearest town of
//     a people it dislikes within reach; a strong party walks there, a weak one strikes where it stands. A town beaten
//     loses `loss` of its people into the lair's captivity (lair.captives, by people), the camp grows by `feed`; a beating
//     thins the camp as a raid's does. The captives waste at CAPTIVE_RAID.keep a year (atlas/lairs.js), and a caravan that
//     beats the lair's folk in its lands frees them (campaign/fight.js).
//   the realm (ctx.role 'realm'): a town with warriors raids the nearest disliked town in DIPLOMACY.raidReach (raidTown.js);
//     a win takes `realm.loss` of its people — `grow` of them become the raiding town's slaves (t.slaves: they work in its
//     buildings, atlas/economy.js), the realm counts them (realm.captives).
import {plunder, plunderWords, lootOf} from '../treasury.js';
import {TOWN_MONEY} from '../../data/townBuildings.js';
import {WORLD_PEOPLES as WP_CULT} from '../../data/peoples.js';
const cultOf = realm => WP_CULT.get(realm.people)?.warCult || null;   // (data/peoples.js warCult: the greenskins raid anyone, kin too)
import {TRIBE_RAID, CAPTIVE_RAID as CR, LAIRS} from '../../data/lairs.js';
import {TOWN_WAR} from '../../data/peoples.js';
import {SPECIES} from '../../data/species.js';
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
    const n = Math.min(target.pop, Math.max(1, Math.round(target.pop * CR.loss * raidShare(fx))));   // no more than there are
    target.pop -= n;
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
    const often = cultOf(actor)?.raids ?? 1;   // the cult of war raids the more (data/peoples.js warCult)
    if (actor.raids?.year === y && actor.raids.n >= D.raidsPerYear * often) return null;
    const out = [], k = scaleOf(a), towns = a.towns.filter(t => t.alive);
    for (const t of liveTowns(a, actor)) {
      if (!townFx(t).defence || r() > CR.realm.chance * often / SEASONS_PER_YEAR) continue;
      let target = null, bd = D.raidReach * k;
      // the nearest; the cult of war weighs what it would carry off against how likely it is to win (atlas/treasury.js lootOf)
      const cult = cultOf(actor), mt = cult ? might(t, townFx(t)) : 0;
      let bv = 0;
      for (const o of towns) if (o.realm !== actor.id && o.pop >= 20 && relation(a, actor.id, o.realm) && (cult || attitude(a, actor.id, o.realm) < 0)) {
        const d = Math.hypot(t.x - o.x, t.y - o.y); if (d >= D.raidReach * k) continue;
        if (!cult) { if (d < bd) { bd = d; target = o; } continue; }
        const v = (lootOf(o) + o.pop) * Math.min(TOWN_MONEY.plunder.dare, mt / Math.max(1, might(o, townFx(o)))); if (v > bv) { bv = v; target = o; }
      }
      if (target) out.push([{from: t.id, target: target.id}, 1, () => `${t.name}: в ${target.name} есть кого взять, ${realmLabel(a, target.realm)} нам не любы`]);
      // the greenskins raid the wild tribes for slaves too (data/peoples.js warCult)
      else if (cultOf(actor)) {
        let lair = null, ld = D.raidReach * k;
        for (const l of a.lairs || []) { const L2 = LAIRS.get(l.kind); if (!l.alive || !L2.tribe || l.hidden) continue; const d = Math.hypot(t.x - l.x, t.y - l.y); if (d < ld) { ld = d; lair = l; } }
        if (lair) out.push([{from: t.id, lair: lair.id}, 1, () => `${t.name}: в «${lair.name}» есть кого взять`]);
      }
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
    // the realm's: on a tribe's camp
    if (plan.lair != null) {
      const t = a.towns.find(x => x.id === plan.from), l = (a.lairs || []).find(x => x.id === plan.lair); if (!t?.alive || !l?.alive) return null;
      const L2 = LAIRS.get(l.kind), sp = SPECIES.get(L2.species), s = sp.special, TW = TOWN_WAR, CT = CR.realm.tribe;
      const town = might(t, townFx(t)) * TW.might * (TW.luck[0] + TW.luck[1] * r()), camp = l.strength * ((s.S[0] + s.S[1]) / 2 + (s.E[0] + s.E[1]) / 2) * (TW.luck[0] + TW.luck[1] * r());
      if (town > camp) {
        const n = Math.max(1, Math.round(CT.heads * l.strength)) * CR.realm.grow;
        l.strength = Math.max(0, l.strength - CT.hit); t.slaves = (t.slaves || 0) + n; (t.slavesOf ||= {})[L2.species] = (t.slavesOf[L2.species] || 0) + n;
        return `${cap1(realmLabel(a, actor.id))} из ${townLabel(t, 2)} ${t.name} разорили ${L2.labelAcc || L2.label} «${l.name}» и увели ${sp.plural} в рабство.`;
      }
      t.pop *= 1 - TW.raidLoss * raidShare(townFx(t));
      return `${cap1(sp.plural)} ${L2.from} «${l.name}» отбили набег ${realmLabelGen(a, actor.id)} за рабами.`;
    }
    const t = a.towns.find(x => x.id === plan.from), target = a.towns.find(x => x.id === plan.target);
    if (!t?.alive || !target?.alive) return null;
    const y = a.hist.year;
    actor.raids = actor.raids?.year === y ? {year: y, n: actor.raids.n + 1} : {year: y, n: 1};
    const rel = meet(a, actor.id, target.realm, y);
    rel.att = Math.max(-5, rel.att - D.raid * (cultOf(actor)?.raid ?? 1));
    if (fight(t, r) > fight(target, r)) {
      const n = Math.min(target.pop, Math.max(1, Math.round(target.pop * CR.realm.loss * raidShare(townFx(target)))));   // no more than there are
      target.pop -= n; t.slaves = (t.slaves || 0) + n * CR.realm.grow;   // they work in its buildings as slaves (atlas/economy.js)
      (t.slavesOf ||= {})[target.people] = (t.slavesOf[target.people] || 0) + n * CR.realm.grow;   // whose kin they are (the dwarves free theirs: atlas/deeds/liberate.js)
      (actor.captives ||= {})[target.people] = (actor.captives[target.people] || 0) + n;
      barrows(a, target.i, Math.max(1, Math.round(scaleOf(a))), ROT.raidGraves * CR.graves);
      const got = plunder(t, target, TOWN_MONEY.plunder.raid);   // and what they could carry: goods and gold (atlas/treasury.js)
      return `${cap1(realmLabel(a, actor.id))} из ${townLabel(t, 2)} ${t.name} увели в полон ${heads(n)} из ${townLabel(target, 2)} ${target.name}${plunderWords(got)}.`;
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
