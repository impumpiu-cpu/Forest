// Chase: hunt game with the pack (agents/carcass.js: one hunt shared by the pack, roles, the last sighting). A
// hungry one looks as far as it sees, a fed one only takes what runs under its nose; the free members of the pack
// close by set off together, and a member joins the leader's chase. The lead that gets nowhere (water or rocks
// in between) gives the prey up for a while; big game is bitten down, small game is caught with one bite, and
// the pack sits down to the kill. Reads: predator {sight, obvious, sated, hungry, sprint, stamina, meal, bigMeal}.
import {SPECIES} from '../../data/species.js';
import {approach, sprintMul, recover} from '../movement.js';
import {attack, behindRock} from '../combat.js';
import {kill} from '../agent.js';
import {huntOf, huntAim, startHunt, endHunt} from '../carcass.js';
import {endTask} from '../lifecycle.js';
import {liveById} from '../lookup.js';
import {dist, packOf, paramsOf, bestPrey, ignoreFor, toTheKill, busyHunting} from '../hunting.js';
import {PROWL} from '../../data/behaviour.js';


export const chase = {
  want(w, a, {sp}) {
    const P = sp.predator, W = PROWL.want, food = a.needs.food;
    if (a.task?.id === 'chase') return [[a.task, W.chaseOn, () => 'гонит добычу']];
    if (busyHunting(a, PROWL.rested)) return null;
    const pack = packOf(w, a), leader = pack[0];
    // the pack hunts together: join the leader's chase
    const lh = leader !== a ? huntOf(w, leader) : null;
    if (lh && leader.task?.id === 'chase' && food < P.sated && !(a.ignore?.get(lh.prey) > w.tick)) return [[{id: 'chase', target: leader.task.target, join: lh.id}, W.joinChase, () => 'стая гонит добычу']];
    // prey that runs right under its nose is too good to pass up; a hungry one looks further
    const reach = food < P.hungry ? P.sight : food < P.sated ? P.obvious : 0;
    if (!reach) return null;
    // those free to run: not already on a hunt, not eating, not out of breath
    const J = PROWL.join;
    const near = pack.filter(m => !huntOf(w, m) && m.stamina >= J.fresh && (m === a || (dist(m, a) < J.near && m.task?.id !== 'feed' && m.needs.food < P.sated)));
    if (!near.includes(a)) return null;
    const prey = bestPrey(w, a, P, reach, near.length);
    return prey ? [[{id: 'chase', target: prey, start: near.map(m => m.id)}, W.prey, () => `добыча в виду: ${SPECIES.get(prey.species).label}`]] : null;
  },
  // taken: the pack's hunt begins, or this one joins the one under way (agents/carcass.js)
  pick(w, a, t) {
    if (t.join != null) { const h = w.hunts?.[t.join]; if (h && !h.members.includes(a.id)) h.members.push(a.id); a.hunt = t.join; delete t.join; }
    if (t.start) {
      const near = t.start.map(id => liveById(w, id)).filter(Boolean);
      const h = startHunt(w, near, t.target, 'game');
      for (const m of near) if (m !== a) m.task = {id: 'chase', target: t.target};
      t.hunt = h.id; delete t.start;
    }
  },
  step(w, a, t) {
    const P = paramsOf(a), C = PROWL.chase, prey = t.target, h = huntOf(w, a), pack = packOf(w, a);
    if (!h || !prey || prey.dead || !w.agents.includes(prey)) { endTask(w, a); return; }
    const [tx, ty, sprint] = huntAim(w, a, h, prey);
    // the lead itself is not getting anywhere (water or rocks in between): the pack gives this one up for half a day
    if (h.roles[a.id] === 'lead') {
      if (!t.anchor || dist(a, t.anchor) > C.moved) { t.anchor = {x: a.x, y: a.y}; t.since = w.tick; }
      if (w.tick - t.since > C.stuck || approach(w, a, tx, ty, sprintMul(a, P.sprint, P.stamina)) === null) {
        for (const m of pack) ignoreFor(w, m, prey.id, C.ignoreFor);
        endHunt(w, h, 'unreachable'); return;
      }
    } else if (approach(w, a, tx, ty, sprint ? sprintMul(a, P.sprint, P.stamina) : C.flankPace) === null) { a.task = {id: 'rest', mode: 'winded'}; return; }
    if (h.roles[a.id] === 'wait') recover(a);   // dropped back to catch its breath: it does
    // big game is not caught with one bite: the pack bites it down while it kicks back
    if (SPECIES.get(prey.species).big) {
      if (dist(a, prey) < C.bigBite) {
        attack(w, a, prey);
        if (prey.dead) { w.stats.wolfKills++; endHunt(w, h, 'kill'); toTheKill(w, a, prey, P.bigMeal, pack); }
      }
      return;
    }
    if (dist(a, prey) < C.bite && !behindRock(w, a, prey)) {
      kill(w, prey, 'зубов', a); w.stats.wolfKills++;
      endHunt(w, h, 'kill'); toTheKill(w, a, prey, P.meal, pack);
    }
  },
};
