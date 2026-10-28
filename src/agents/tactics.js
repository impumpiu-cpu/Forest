// How each fighting role fights (data/roles.js; docs/BEHAVIOUR.md «Роли в отряде»). Two sides ask it:
//   a raiders' band — its plan (agents/squad.js planFor) asks once it has nothing more particular (no stores to go for,
//                     no torch to carry): bandSide(w, sq);
//   the caravan's war band on a camp's map (agents/behaviours/warband.js), once the alarm is up: caravanSide(w).
// The side is who stands with the fighter: `all()` — its living members, `has(o)` — is o one of them.
// How a creature thinks (`mind`, data/species.js MINDS) is the depth of the role (numbers — data/behaviour.js TACTICS):
//   mindless (and a beast) — the plainest form of it: the nearest foe, a shooter stands and shoots, no healing, no cunning;
//   semi                   — the role's own way;
//   sentient               — the role's way with a choice of whom: the shield-bearer turns on whoever is on its
//                            shooters, the cutthroat goes for the shooters, healers and the wounded, the catcher for
//                            one already held by another.
// Every answer is one of the shared tasks (fight, kite, mend) or null — the side's default (the nearest foe).
//   kitRole(a) — the fighting role a caravan's member fights in: by its place in the company and what it holds
import {SPECIES} from '../data/species.js';
import {COMBAT_ROLES, mixOf} from '../data/roles.js';
import {TACTICS, SQUAD} from '../data/behaviour.js';
import {isHostile} from '../data/factions.js';
import {nearAgents} from './spatial.js';
import {canSee, aggressor, darkness} from './combat.js';
import {hpShare} from './agent.js';
import {firstAttacker} from './lookup.js';
import {liveMembers} from './group.js';
import {handItems, def} from './equipment.js';
import {traitOf} from '../data/balance/combat.js';
import {dist} from '../core/util.js';

// how deep a creature's role goes: 'mindless' · 'semi' · 'sentient' (a beast fights as the mindless)
export const mindOf = a => { const m = SPECIES.get(a.species).mind; return m === 'sentient' ? 'sentient' : m === 'semi' ? 'semi' : 'mindless'; };

// ── the sides
const up = o => !o.dead && !o.gone && !o.downed;
export const bandSide = (w, sq) => ({
  all: () => liveMembers(w, sq, o => up(o) && o.squad === sq.id),
  fallen: () => liveMembers(w, sq, o => o.squad === sq.id && o.downed && !o.dead && !o.gone),
  has: o => o.squad === sq.id,
});
// the caravan's people on a camp's map (campaign/camp.js w.campaign.people): who stands in the fight, not a captive
export const caravanSide = w => {
  const people = () => [...(w.campaign?.people?.values() || [])];
  return {
    all: () => people().filter(o => up(o) && !o.captive),
    fallen: () => people().filter(o => o.downed && !o.dead && !o.gone && !o.captive),
    has: o => o.member != null && w.campaign?.people?.get(o.member) === o,
  };
};

// the foes this one can see within r, nearest first (the fallen and the bound are out of it)
export function foesNear(w, a, r) {
  r *= darkness(w, a);   // (the night hides what is further off, as for the plain search: agents/combat.js nearestHostile)
  const out = [];
  for (const o of nearAgents(w, a.x, a.y, r)) {
    if (o === a || o.dead || o.downed || o.ledBy != null || !(isHostile(a, o) || aggressor(a, o))) continue;
    if (dist(a, o) > r || !canSee(w, a, o)) continue;
    out.push(o);
  }
  return out.sort((p, q) => dist(a, p) - dist(a, q));
}
const fighting = o => (o.task?.id === 'fight' || o.task?.id === 'maul') && o.task.target;   // (as agents/combat.js stanceOf reads it)
const shoots = o => !!o.fightRole && COMBAT_ROLES.has(o.fightRole) && COMBAT_ROLES.get(o.fightRole).squad === 'shooter';
// a soft target for a cutthroat: one who shoots, one who tends the wounded, one already bleeding, one busy with another
const soft = o => !!o.gear?.ranged || o.task?.id === 'aid' || o.task?.id === 'treat' || o.task?.id === 'bind' || o.task?.id === 'mend' || hpShare(o) < TACTICS.wounded;

// a blade at it: a foe close by, coming at this one, with no bow of its own
// (none while it rests from the last time it stepped back: TACTICS.kiteRest)
const pressing = (w, a, foes) => (w.tick - (a.kitedAt ?? -Infinity) < TACTICS.kiteRest ? null : foes.find(o => dist(a, o) < TACTICS.kite && o.task?.target === a && !o.gear?.rangedReady) || null);
const kite = (w, a, e) => (a.task?.id === 'kite' && a.task.from === e.id ? a.task : {id: 'kite', from: e.id});

// the foe to fight, holding on to the current one unless another is much closer or it has been long enough (SQUAD.hold)
export function holdFoe(w, a, fresh) {
  const t = a.task?.id === 'fight' ? a.task.target : null;
  if (!t || t.dead || t.downed || t.gone || !canSee(w, a, t)) return fresh;
  if (!fresh || fresh === t) return t;
  const held = w.tick - (a.task.since ?? w.tick);
  return held > SQUAD.hold || dist(a, fresh) < dist(a, t) * SQUAD.closer ? fresh : t;
}
export const fightTask = (w, a, e) => (a.task?.id === 'fight' && a.task.target === e ? a.task : {id: 'fight', target: e, since: w.tick});

// what the role says now, or null. `side` — bandSide or caravanSide
export function roleTactic(w, a, side, radius) {
  const R = a.fightRole && COMBAT_ROLES.has(a.fightRole) ? COMBAT_ROLES.get(a.fightRole) : null;
  if (!R) return null;
  const mind = mindOf(a), T = TACTICS;
  const foes = foesNear(w, a, radius); if (!foes.length && R.id !== 'healer') return null;
  const near = foes[0] || null;
  const heldByUs = o => fighting(o) && side.has(o.task.target);

  // shooters (archer, skirmisher): keep the distance while there is something to shoot; the mindless stand and shoot
  if (R.squad === 'shooter') {
    const press = pressing(w, a, foes);
    if (mind !== 'mindless' && a.gear?.rangedReady && press) return kite(w, a, press);   // a blade coming at it: step back and shoot again
    if (mind === 'sentient' && a.gear?.rangedReady) {
      const pick = foes.find(o => dist(a, o) <= (a.gear.ranged.range || 0) && (o.gear?.ranged || hpShare(o) < T.wounded));
      if (pick) return fightTask(w, a, pick);
    }
    return null;
  }

  switch (R.id) {
    // the shield-bearer: whoever is on the side's shooters and healers first (sentient), else the nearest
    case 'shield': {
      if (mind === 'sentient') {
        for (const m of side.all()) {
          if (m === a || !(shoots(m) || m.fightRole === 'healer')) continue;
          const on = firstAttacker(w, m, o => o.task.id === 'fight' || o.task.id === 'maul');
          if (on && dist(a, on) < T.guard && canSee(w, a, on)) return fightTask(w, a, on);
        }
      }
      return null;
    }
    // the spearman: from the second rank, on the one a shield-bearer of the side already holds
    case 'spearman': {
      if (mind === 'mindless') return null;
      const held = foes.find(o => heldByUs(o) && o.task.target.fightRole === 'shield') || (mind === 'sentient' ? foes.find(heldByUs) : null);
      return held && dist(a, held) < T.guard ? fightTask(w, a, held) : null;
    }
    // the cleaver (and the dwarven hammer-smith): breaks into whoever is held by another of the side (sentient), else the nearest
    case 'smith':
    case 'cleaver': {
      if (mind !== 'sentient') return null;
      const held = foes.find(heldByUs);
      return held && dist(a, held) < T.guard ? fightTask(w, a, held) : null;
    }
    // the cutthroat: creeps up while nobody fights it; the soft and the busy first, from the side
    case 'cutthroat': {
      if (mind === 'mindless') return null;
      a.sneaking = !foes.some(o => o.task?.target === a) && dist(a, near) > T.sneakUntil;
      const pick = (mind === 'sentient' ? foes.find(soft) : null) || foes.find(o => fighting(o) && o.task.target !== a) || null;
      return pick ? fightTask(w, a, pick) : null;
    }
    // the catcher: nets one another of the side already holds (sentient), the nearest otherwise; once it is down the
    // band's `capture` (the colony's `bind`) ties it up
    case 'catcher': {
      if (mind === 'mindless') return null;
      const held = mind === 'sentient' ? foes.find(o => heldByUs(o) && !(o.webbed && w.tick < o.webbed.until)) : null;
      return held ? fightTask(w, a, held) : null;
    }
    // the healer: to the fallen of the side first, then a potion to the badly hurt; out of the way of the foe meanwhile
    case 'healer': {
      if (mind === 'mindless') return null;
      if (a.task?.id === 'mend' && a.task.who != null) return a.task;
      // (one it could not reach is on a pause of its own — agents/lifecycle.js taskKey 'mend:<who>', read here as it is
      // kept, not through lifecycle.js, which this module may not import: the next is tended meanwhile)
      const open = o => !((a.skips?.['mend:' + o.id] ?? -1) > w.tick);
      const fallen = side.fallen().filter(o => o !== a && dist(a, o) < T.mend.near && open(o)).sort((p, q) => dist(a, p) - dist(a, q))[0];
      if (fallen) return {id: 'mend', who: fallen.id};
      if (mind === 'sentient' && a.potions > 0) {
        const hurt = side.all().filter(o => o !== a && o.task?.id !== 'leave' && !SPECIES.get(o.species).mechanism && hpShare(o) < T.mend.potionBelow && dist(a, o) < T.mend.near && open(o)).sort((p, q) => hpShare(p) - hpShare(q))[0];
        if (hurt) return {id: 'mend', who: hurt.id, potion: true};
      }
      // a blade at it: behind its own, if any of the side stands near to take the blow; alone, it fights with the staff
      const press = pressing(w, a, foes), cover = press && side.all().some(m => m !== a && m.fightRole !== 'healer' && dist(a, m) < T.guard);
      if (cover) return kite(w, a, press);
      return null;
    }
    default: return null;
  }
}

// The fighting role of a caravan's member (docs/BEHAVIOUR.md «Словарь»): its place in the company (a.place — knight,
// squire, a hireling…; a master of medicine heals) and what it holds, in this order: a master of medicine — the healer;
// a net — the catcher; a bow or a crossbow — the archer; a sling or javelins — the skirmisher; a shield — the
// shield-bearer (a race's own roles before it: the dwarves' forge-master by its fire, hammer-smith by a two-handed hammer,
// berserker by two weapons and no armour); a paired weapon in the other hand — the cutthroat; a spear — the spearman; any other weapon — the
// cleaver (a knight with it too: a knight never creeps). A captive or a former slave fights in no role.
export function kitRole(a) {
  if (a.captive || a.former || !a.equip) return null;
  if (a.master?.skill === 'medicine') return 'healer';
  const hs = handItems(a).map(def), form = f => hs.some(d => d.form === f);
  if (hs.some(d => traitOf(d.qualities, 'ensnare'))) return 'catcher';
  if (form('bow') || form('crossbow')) return 'archer';
  if (form('sling') || form('javelin')) return 'skirmisher';   // (a hatchet is thrown too, but it is a cutthroat's)
  // the roles of a race's own (data/roles.js ROLE_MIX: the dwarves' forge-master, hammer-smith and berserker)
  const own = r => (mixOf(a.species)[r] || 0) > 0;
  if (form('spitfire') && own('forgemaster')) return 'forgemaster';
  if ((form('warhammer') || form('maul')) && own('smith')) return 'smith';
  if (a.gear?.offhand && !(a.gear.armor > 0) && own('berserker')) return 'berserker';
  if (form('shield')) return 'shield';
  if (a.gear?.offhand && a.place !== 'knight') return 'cutthroat';
  if (form('spear')) return 'spearman';
  if (hs.some(d => d.melee)) return 'cleaver';
  return null;
}
