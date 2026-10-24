// Maul: go for a person — a lone colonist far from the camp, or a pair when desperate — once hunger (and the cover
// of night) has made the pack bold enough; a member joins the leader's attack. Help arriving or the victim
// reaching the settlement makes the pack back off for a while, shorter when starving; a victim it cannot get at
// is given up. A kill feeds the whole pack. In the `lair` mode (defendLair) nothing frightens it and it does not
// let go. Reads: predator {victims, sight, loneRadius, boldPeople, calm, sprint, stamina, bigMeal}.
import {SPECIES} from '../../data/species.js';
import {approach, sprintMul, recover} from '../movement.js';
import {attack, behindRock} from '../combat.js';
import {huntOf, endHunt} from '../carcass.js';
import {endTask} from '../lifecycle.js';
import {agentInZone} from '../../settlement/zone.js';
import {think} from '../mind.js';
import {dist, packOf, paramsOf, boldness, nearest, company, startMaul, toTheKill} from '../hunting.js';
import {PROWL} from '../../data/behaviour.js';

const BUSY = new Set(['feed', 'chase', 'maul']);
const gone = (w, v) => !v || v.dead || v.downed || !w.agents.includes(v);

export const maul = {
  want(w, a, {sp, night}) {
    const P = sp.predator, W = PROWL.want;
    if (a.task?.id === 'maul') return [[a.task, W.maulOn, () => 'нападает']];
    if (BUSY.has(a.task?.id) || (a.task?.id === 'rest' && a.stamina < PROWL.rested)) return null;
    const pack = packOf(w, a), leader = pack[0];
    const lh = leader !== a ? huntOf(w, leader) : null;
    if (lh && leader.task?.id === 'maul') return [[{id: 'maul', target: leader.task.target, join: lh.id}, W.joinMaul, () => 'стая напала']];
    // people: only when boldness (plus the cover of night) is high enough
    const b = boldness(a, P), PP = PROWL.people;
    if (w.tick > (a.calmUntil || 0) && b + night * PP.night >= P.boldPeople) {
      const v = nearest(w, a, P.victims, P.sight * (PP.sightBase + PP.sightBold * b), o => o.faction === 'colony' && !o.downed && !agentInZone(w, o) &&
        company(w, o, P.loneRadius) <= (b > PROWL.desperate ? Math.max(0, pack.length - 2) : 0));
      if (v) return [[{id: 'maul', target: v, start: true}, W.people, () => `${v.name} далеко от лагеря`]];
    }
    return null;
  },
  // taken: the pack's attack begins (agents/hunting.js startMaul), or this one joins the one under way
  pick(w, a, t) {
    if (t.join != null) { const h = w.hunts?.[t.join]; if (h && !h.members.includes(a.id)) h.members.push(a.id); a.hunt = t.join; delete t.join; }
    if (t.start) { delete t.start; t.hunt = startMaul(w, a, t.target, boldness(a, paramsOf(a))).id; }
  },
  step(w, a, t) {
    const P = paramsOf(a), M = PROWL.maul, v = t.target;
    if (t.mode === 'lair') { lair(w, a, t, P, v); return; }
    const b = boldness(a, P), pack = packOf(w, a);
    // help arrived or the victim reached the settlement: back off for a while (shorter when starving)
    if (gone(w, v) || company(w, v, M.helpNear) >= M.help + Math.floor(b * M.helpBold) || agentInZone(w, v)) {
      const h = huntOf(w, a);
      if (h) endHunt(w, h, gone(w, v) && (!v || v.dead) ? 'taken' : agentInZone(w, v) ? 'zone' : 'help');
      if (v && !v.dead && !v.downed) think(w, v, 'escapedWolves', {who: SPECIES.get(a.species).plural});
      if (v && !v.dead) for (const m of pack) { m.calmUntil = w.tick + P.calm * (1 - M.calmHelp * b); if (m.task?.id === 'maul') m.task = {id: 'roam'}; }
      if (a.task === t) endTask(w, a);
      return;
    }
    // cannot get at the victim (water in between): give up for now
    if (!t.anchor || dist(a, t.anchor) > M.moved || dist(a, v) < M.reset) { t.anchor = {x: a.x, y: a.y}; t.since = w.tick; }
    const giveUp = () => { endHunt(w, huntOf(w, a), 'unreachable'); a.calmUntil = w.tick + P.calm * M.calmStuck; if (a.task === t) endTask(w, a, 'impossible', 'к жертве не подойти'); };
    if (w.tick - t.since > M.stuck) { giveUp(); return; }
    // too far to bite: close in and nothing more this tick
    if (dist(a, v) > M.reach || behindRock(w, a, v)) { if (approach(w, a, v.x, v.y, sprintMul(a, P.sprint, P.stamina * M.pace)) === null) giveUp(); return; }
    attack(w, a, v);
    if (v.dead) { endHunt(w, huntOf(w, a), 'kill'); const c = toTheKill(w, a, v, P.bigMeal, pack); c.yields = {}; }
  },
};

// the beasts of a lair the caravan storms (campaign/camp.js `defend`) hold it to the last: at the nearest of those
// who came, no fear of a crowd or of the fire, no leaving when hurt
function lair(w, a, t, P, v) {
  const D = PROWL.defend;
  if (gone(w, v)) { endTask(w, a); return; }
  if (dist(a, v) > PROWL.maul.reach || behindRock(w, a, v)) {
    if (approach(w, a, v.x, v.y, a.stamina > D.winded ? sprintMul(a, P.sprint, P.stamina * D.drain) : D.pace) === null) endTask(w, a, 'impossible', 'не подойти');
    else recover(a);
    return;
  }
  attack(w, a, v);
}

export const defendLair = {
  want(w, a, {sp}) {
    if (!a.defend) return null;
    let v = a.task?.id === 'maul' ? a.task.target : null;
    if (gone(w, v)) v = nearest(w, a, sp.predator.victims, PROWL.defend.reach, o => o.faction === 'colony' && !o.downed);
    return v ? [[{id: 'maul', mode: 'lair', target: v}, PROWL.want.lair, () => 'держит логово']] : null;
  },
};
