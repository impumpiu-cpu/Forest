// How each fighting role fights (data/roles.js; docs/BEHAVIOUR.md «Роли в отряде»): the member of a band asks its
// role what to do once the plan of the band (agents/squad.js planFor) has nothing more particular — no stores to go
// for, no torch to carry. The mind changes the role (SPECIES `sentient` / `mindless`, numbers — data/behaviour.js
// TACTICS):
//   mindless — the plainest form of it: the nearest foe, a shooter stands and shoots, no healing, no cunning;
//   normal   — the role's own way (no tag);
//   sentient — the role's way with a choice of whom: the shield-bearer turns on whoever is on its shooters, the
//              cutthroat goes for the shooters, healers and the wounded, the catcher for one already held by another.
// Every answer is one of the shared tasks (fight, kite, mend) or null — the band's default (the nearest foe).
import {SPECIES} from '../data/species.js';
import {COMBAT_ROLES} from '../data/roles.js';
import {TACTICS} from '../data/behaviour.js';
import {isHostile} from '../data/factions.js';
import {nearAgents} from './spatial.js';
import {canSee, aggressor} from './combat.js';
import {hpShare} from './agent.js';
import {firstAttacker} from './lookup.js';
import {liveMembers} from './group.js';
import {dist} from '../core/util.js';

// how a creature thinks: 'mindless' · 'normal' · 'sentient'
export const mindOf = a => { const sp = SPECIES.get(a.species); return sp.mindless ? 'mindless' : sp.sentient ? 'sentient' : 'normal'; };

// the foes this one can see within r, nearest first (the fallen and the bound are out of it)
export function foesNear(w, a, r) {
  const out = [];
  for (const o of nearAgents(w, a.x, a.y, r)) {
    if (o === a || o.dead || o.downed || o.ledBy != null || !(isHostile(a, o) || aggressor(a, o))) continue;
    if (dist(a, o) > r || !canSee(w, a, o)) continue;
    out.push(o);
  }
  return out.sort((p, q) => dist(a, p) - dist(a, q));
}
const fighting = o => (o.task?.id === 'fight' || o.task?.id === 'maul') && o.task.target;
// a soft target for a cutthroat: one who shoots, one who tends the wounded, one already bleeding, one busy with another
const soft = o => !!o.gear?.ranged || o.task?.id === 'aid' || o.task?.id === 'treat' || o.task?.id === 'bind' || hpShare(o) < TACTICS.wounded;

// a blade at it: a foe close by, coming at this one, with no bow of its own
// (none while it rests from the last time it stepped back: TACTICS.kiteRest)
const pressing = (w, a, foes) => (w.tick - (a.kitedAt ?? -Infinity) < TACTICS.kiteRest ? null : foes.find(o => dist(a, o) < TACTICS.kite && o.task?.target === a && !o.gear?.rangedReady) || null);
const fightTask = (w, a, e) => (a.task?.id === 'fight' && a.task.target === e ? a.task : {id: 'fight', target: e, since: w.tick});
const kite = (w, a, e) => (a.task?.id === 'kite' && a.task.from === e.id ? a.task : {id: 'kite', from: e.id});
const members = (w, sq) => liveMembers(w, sq, o => !o.gone && !o.downed && o.squad === sq.id);

// what the role says now, or null
export function roleTactic(w, a, sq, radius) {
  const R = a.fightRole && COMBAT_ROLES.has(a.fightRole) ? COMBAT_ROLES.get(a.fightRole) : null;
  if (!R) return null;
  const mind = mindOf(a), T = TACTICS;
  const foes = foesNear(w, a, radius); if (!foes.length && R.id !== 'healer') return null;
  const near = foes[0] || null;

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
    // the shield-bearer: whoever is on the band's shooters and healers first (sentient), else the nearest
    case 'shield': {
      if (mind === 'sentient') {
        for (const m of members(w, sq)) {
          if (m === a || !(m.sqRole === 'shooter' || m.fightRole === 'healer')) continue;
          const on = firstAttacker(w, m, o => o.task.id === 'fight' || o.task.id === 'maul');
          if (on && dist(a, on) < T.guard && canSee(w, a, on)) return fightTask(w, a, on);
        }
      }
      return null;
    }
    // the spearman: from the second rank, on the one a shield-bearer of the band already holds
    case 'spearman': {
      if (mind === 'mindless') return null;
      const held = foes.find(o => fighting(o) && o.task.target.squad === sq.id && o.task.target.fightRole === 'shield') || (mind === 'sentient' ? foes.find(o => fighting(o) && o.task.target.squad === sq.id) : null);
      return held && dist(a, held) < T.guard ? fightTask(w, a, held) : null;
    }
    // the cleaver: breaks into whoever is held by another of the band (sentient), else the nearest
    case 'cleaver': {
      if (mind !== 'sentient') return null;
      const held = foes.find(o => fighting(o) && o.task.target.squad === sq.id);
      return held && dist(a, held) < T.guard ? fightTask(w, a, held) : null;
    }
    // the cutthroat: creeps up while nobody fights it; the soft and the busy first, from the side
    case 'cutthroat': {
      if (mind === 'mindless') return null;
      a.sneaking = !foes.some(o => o.task?.target === a) && dist(a, near) > T.sneakUntil;
      const pick = (mind === 'sentient' ? foes.find(soft) : null) || foes.find(o => fighting(o) && o.task.target !== a) || null;
      return pick ? fightTask(w, a, pick) : null;
    }
    // the catcher: nets one another of the band already holds (sentient), the nearest otherwise; once it is down the
    // band's `capture` behaviour ties it up
    case 'catcher': {
      if (mind === 'mindless') return null;
      const held = mind === 'sentient' ? foes.find(o => fighting(o) && o.task.target.squad === sq.id && !(o.webbed && w.tick < o.webbed.until)) : null;
      return held ? fightTask(w, a, held) : null;
    }
    // the healer: to the fallen of the band first, then a potion to the badly hurt; out of the way of the foe meanwhile
    case 'healer': {
      if (mind === 'mindless') return null;
      if (a.task?.id === 'mend' && a.task.who != null) return a.task;
      const fallen = liveMembers(w, sq, o => o.squad === sq.id && o.downed && !o.dead && !o.gone && o !== a)
        .filter(o => dist(a, o) < T.mend.near).sort((p, q) => dist(a, p) - dist(a, q))[0];
      if (fallen) return {id: 'mend', who: fallen.id};
      if (mind === 'sentient' && a.potions > 0) {
        const hurt = members(w, sq).filter(o => o !== a && o.task?.id !== 'leave' && hpShare(o) < T.mend.potionBelow && dist(a, o) < T.mend.near).sort((p, q) => hpShare(p) - hpShare(q))[0];
        if (hurt) return {id: 'mend', who: hurt.id, potion: true};
      }
      // a blade at it: behind its own, if any of the band stands near to take the blow; alone, it fights with the staff
      const press = pressing(w, a, foes), cover = press && members(w, sq).some(m => m !== a && m.fightRole !== 'healer' && dist(a, m) < T.guard);
      if (cover) return kite(w, a, press);
      return null;
    }
    default: return null;
  }
}
