// Predator brain (wolves). Hunger is the motive:
//   fed       — roams with the pack, still snaps up prey that runs right under its nose;
//   hungry    — follows the scent of the nearest prey across the map, the pack hunts together;
//   starving  — boldness grows: comes closer to the settlement, goes for a lone colonist
//               (at night sooner), when desperate even for a pair, and backs off less readily.
// Fire, wounds, a crowd of people and the settlement zone still drive it away.
// A chase is one pack hunt shared by the pack (agents/carcass.js: roles, last sighting, one outcome);
// the prey is chosen by what it is worth (food per head, the chance to catch it, the way, the risk),
// and a kill lies on the map as a carcass the pack eats, leaves and comes back to.
// All numbers come from the species' `predator` block in data/species.js.
import {SPECIES, matchesKind} from '../../data/species.js';
import {nightness} from '../../core/time.js';
import {cellOf, walkable} from '../../world/grid.js';
import {approach, escapeHeat, nearFire, bolt, follow, sprintMul, recover, ascend, shunsHeat, sameLand} from '../movement.js';
import {agentInZone} from '../../settlement/zone.js';
import {attack, behindRock} from '../combat.js';
import {SPECIES as SP} from '../../data/species.js';
import {stepBody} from '../body.js';
import {kill, maxHp} from '../agent.js';
import {log} from '../../core/log.js';
import {think} from '../mind.js';
import {esc, clamp} from '../../core/util.js';
import {dropCarcass, carcassById, smellCarcass, eat, startHunt, endHunt, huntOf, huntAim, CARCASS} from '../carcass.js';
import {tempAt} from '../../world/heat.js';

// how far a hungry predator smells its prey (cells)
const SCENT = 70;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
import {nearAgents} from '../spatial.js';

function nearest(w, a, species, r, filter = () => true) {
  let best = null, bd = r;
  for (const o of nearAgents(w, a.x, a.y, r)) {
    if (o.dead || o.tame || !matchesKind(o.species, species) || !filter(o)) continue;   // the pen's animals are not prey
    const d = dist(a, o); if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// how many others of the victim's kind stand close to it
const company = (w, v, r) => nearAgents(w, v.x, v.y, r).filter(o => o !== v && !o.dead && (o.species === v.species || (!!SPECIES.get(o.species).rel && !!SPECIES.get(v.species).rel)) && dist(o, v) < r).length;
const packOf = (w, a) => w.agents.filter(o => !o.dead && o.pack === a.pack);
// big game (a mule) is prey only once it is badly hurt
const weakEnough = (o, P) => !(P.weakPrey || []).includes(o.species) || o.hp < maxHp(o) * P.weakBelow;
const preyKinds = P => [...P.prey, ...(P.weakPrey || [])];

export const boldness = (a, P) => clamp((P.hungry - a.needs.food) / (P.hungry - P.starving), 0, 1);

// what a chase is worth: food per head × the chance to catch it, less for the way there and the risk
// (big game kicks back). The hungrier, the less it takes to set off.
export function preyValue(w, a, P, o, packSize) {
  const ps = SPECIES.get(o.species), big = !!ps.big;
  const perHead = (big ? P.bigMeal : P.meal) / Math.max(1, packSize);
  const mine = SPECIES.get(a.species).speed * P.sprint * (0.5 + 0.5 * a.stamina);
  const theirs = ps.speed * (ps.flee?.sprint || 1);
  const caught = big ? 1 : clamp(mine / (theirs || 0.1) * 0.8, 0.15, 1);
  const way = 1 - 0.5 * clamp(dist(a, o) / P.sight, 0, 1);
  const risk = big ? 0.3 * (o.hp / maxHp(o)) : 0;
  return perHead * caught * way - risk;
}
function bestPrey(w, a, P, reach, packSize) {
  let best = null, bv = 0.05;
  const kinds = preyKinds(P);
  for (const o of nearAgents(w, a.x, a.y, reach)) {
    if (o.dead || o.tame || !matchesKind(o.species, kinds) || dist(a, o) > reach) continue;
    if (!weakEnough(o, P) || agentInZone(w, o) || a.ignore?.get(o.id) > w.tick) continue;
    const v = preyValue(w, a, P, o, packSize);
    if (v > bv) { bv = v; best = o; }
  }
  return best;
}
// the pack sits down to the kill: everyone close enough eats from the carcass
function toTheKill(w, a, prey, food, pack) {
  const c = dropCarcass(w, prey, food, a);
  for (const m of pack) if (m === a || dist(m, a) < 10) m.task = {id: 'feed', c: c.id};
  return c;
}

function startMaul(w, a, v, b) {
  const P = SPECIES.get(a.species).predator;
  for (const m of packOf(w, a)) m.calmUntil = w.tick + P.calm * (1 - 0.5 * b);   // one try at a time
  const join = packOf(w, a).filter(m => (m === a || dist(m, a) < 12) && m.task?.id !== 'feed');
  const h = startHunt(w, join, v, 'person');
  for (const m of join) m.task = {id: 'maul', target: v, hunt: h.id};
  w.stats.wolfAttacks++;
  const sp = SPECIES.get(a.species), many = packOf(w, a).length > 1, who = many ? sp.plural : sp.label;
  think(w, v, 'wolfAttack', {who: sp.plural});
  const n = company(w, v, P.loneRadius);
  log(w, b > 0.8 && n ? `Изголодавшиеся ${sp.plural} бросаются на людей! <b>${esc(v.name)}</b> и спутник(и) вдали от лагеря.`
    : `${who[0].toUpperCase() + who.slice(1)} ${many ? 'нападают' : 'нападает'}! <b>${esc(v.name)}</b> далеко от лагеря и без помощи.`, 'danger');
}

// leave prey `id` alone for `ticks`; marks that ran out are dropped here, so the list (it is saved) stays small
function ignoreFor(w, a, id, ticks) {
  const m = a.ignore || (a.ignore = new Map());
  for (const [k, t] of m) if (t <= w.tick) m.delete(k);
  m.set(id, w.tick + ticks);
}

export const predatorBrain = {
  id: 'predator',
  step(w, a) {
    const sp = SPECIES.get(a.species), P = sp.predator, i = cellOf(w, a), T = tempAt(w, i);
    stepBody(w, a);
    if (a.dead) return;
    if (a.cd > 0) a.cd--;
    if (shunsHeat(w, a, sp, T, 2.5)) { a.task = {id: 'bolt'}; escapeHeat(w, a, 1.4); return; }

    const food = a.needs.food, b = boldness(a, P), night = nightness(w.tick);
    const dZone = w.nav.get('zone')[i];
    const shy = (night > 0.5 || w.campLit ? P.zoneShyNight : P.zoneShy) * (1 - 0.6 * b);
    const people = nearAgents(w, a.x, a.y, 6).filter(o => !o.dead && matchesKind(o.species, P.victims) && dist(o, a) < 6);
    const pack = packOf(w, a), leader = pack[0];

    // wounded — or a night hunter at sunrise: leave for good
    if (sp.nocturnal && night < 0.3 && a.task?.id !== 'leave') a.task = {id: 'leave'};
    if (a.task?.id === 'leave' || a.hp < maxHp(a) * 0.35) {
      if (a.task?.id !== 'leave') { a.task = {id: 'leave'}; if (leader === a) log(w, `Раненые ${sp.plural || sp.label} уходят из леса.`, 'wildlife'); }
      if (follow(w, a, 'edge', 1.2) === 'arrived') a.gone = true;
      return;
    }
    // a crowd scares it off; a starving wolf needs a bigger crowd
    if (people.length >= P.groupFear + Math.floor(b * 2)) { a.task = {id: 'bolt'}; bolt(w, a, people, sprintMul(a, P.sprint, P.stamina)); return; }
    // the settlement zone keeps wolves at bay (wider at night, narrower when starving)
    if (dZone < shy && a.task?.id !== 'maul') {
      a.task = {id: 'roam'};
      if (!ascend(w, a, 'zone', 1)) bolt(w, a, [{x: w.camp.x + 0.5, y: w.camp.y + 0.5}], 1);
      return;
    }

    const t = a.task;
    if (t?.id === 'feed') {
      recover(a);
      if (t.left != null) { a.needs.food = Math.min(1, a.needs.food + t.gain); if (--t.left <= 0) a.task = null; return; }   // a meal from before carcasses
      const c = carcassById(w, t.c);
      if (!c || c.food < 0.05 || a.needs.food >= 0.98) { a.task = null; return; }
      if (dist(a, c) > CARCASS.eatAt) { if (approach(w, a, c.x, c.y, 0.8) === null) a.task = null; return; }
      if (!eat(w, a, c, P.meal / P.feedTicks)) a.task = null;
      return;
    }
    if (t?.id === 'chase') {
      const prey = t.target, h = huntOf(w, a);
      if (!h || !prey || prey.dead || !w.agents.includes(prey)) { a.task = {id: 'roam'}; return; }
      if (a.stamina <= 0.05) { a.task = {id: 'rest'}; return; }   // out of breath: lie down before the next try
      const [tx, ty, sprint] = huntAim(w, a, h, prey);
      // the lead itself is not getting anywhere (water or rocks in between): the pack gives this one up for half a day
      if (h.roles[a.id] === 'lead') {
        if (!t.anchor || dist(a, t.anchor) > 3) { t.anchor = {x: a.x, y: a.y}; t.since = w.tick; }
        if (w.tick - t.since > 90 || approach(w, a, tx, ty, sprintMul(a, P.sprint, P.stamina)) === null) {
          for (const m of pack) ignoreFor(w, m, prey.id, 600);
          endHunt(w, h, 'unreachable'); return;
        }
      } else if (approach(w, a, tx, ty, sprint ? sprintMul(a, P.sprint, P.stamina) : 0.75) === null) { a.task = {id: 'rest'}; return; }
      if (h.roles[a.id] === 'wait') recover(a);   // dropped back to catch its breath: it does
      // big game is not caught with one bite: the pack bites it down while it kicks back
      if (SP.get(prey.species).big) {
        if (dist(a, prey) < 1.0) {
          attack(w, a, prey);
          if (prey.dead) { w.stats.wolfKills++; endHunt(w, h, 'kill'); toTheKill(w, a, prey, P.bigMeal, pack); }
        }
        return;
      }
      if (dist(a, prey) < 0.7 && !behindRock(w, a, prey)) {
        kill(w, prey, 'зубов', a); w.stats.wolfKills++;
        endHunt(w, h, 'kill'); toTheKill(w, a, prey, P.meal, pack);
      }
      return;
    }
    if (t?.id === 'maul') {
      const v = t.target;
      if (a.stamina <= 0.05) { a.task = {id: 'rest'}; return; }
      // help arrived or the victim reached the settlement: back off for a while (shorter when starving)
      if (!v || v.dead || v.downed || !w.agents.includes(v) || company(w, v, 5) >= 2 + Math.floor(b * 2) || agentInZone(w, v)) {
        const h = huntOf(w, a);
        if (h) endHunt(w, h, !v || v.dead ? 'taken' : agentInZone(w, v) ? 'zone' : 'help');
        if (v && !v.dead && !v.downed && t.target === v) think(w, v, 'escapedWolves', {who: sp.plural});
        if (v && !v.dead) for (const m of pack) { m.calmUntil = w.tick + P.calm * (1 - 0.7 * b); if (m.task?.id === 'maul') m.task = {id: 'roam'}; }
        else if (t) a.task = {id: 'roam'};
        return;
      }
      // cannot get at the victim (water in between): give up for now
      if (!t.anchor || dist(a, t.anchor) > 3 || dist(a, v) < 1.5) { t.anchor = {x: a.x, y: a.y}; t.since = w.tick; }
      if (w.tick - t.since > 120) { endHunt(w, huntOf(w, a), 'unreachable'); a.task = {id: 'roam'}; a.calmUntil = w.tick + P.calm * 0.5; return; }
      // too far to bite: close in and nothing more this tick
      if (dist(a, v) > 0.9 || behindRock(w, a, v)) {
        if (approach(w, a, v.x, v.y, sprintMul(a, P.sprint, P.stamina * 0.6)) === null) { endHunt(w, huntOf(w, a), 'unreachable'); a.task = {id: 'roam'}; a.calmUntil = w.tick + P.calm * 0.5; }
        return;
      }
      {
        attack(w, a, v);
        if (v.dead) { endHunt(w, huntOf(w, a), 'kill'); const c = toTheKill(w, a, v, P.bigMeal, pack); c.yields = {}; }
      }
      return;
    }

    recover(a);
    if (t?.id === 'rest') { recover(a); recover(a); if (a.stamina < 0.7) return; a.task = null; }

    // the pack hunts together: join the leader's chase
    // the pack hunts together: join the hunt under way (agents/carcass.js), a fresh one in the lead's role list
    const lh = leader !== a ? huntOf(w, leader) : null;
    if (lh && leader.task?.id === 'chase' && food < P.sated && !(a.ignore?.get(lh.prey) > w.tick)) {
      if (!lh.members.includes(a.id)) lh.members.push(a.id);
      a.hunt = lh.id; a.task = {id: 'chase', target: leader.task.target}; return;
    }
    if (lh && leader.task?.id === 'maul') { if (!lh.members.includes(a.id)) lh.members.push(a.id); a.hunt = lh.id; a.task = {id: 'maul', target: leader.task.target}; return; }
    // a carcass it knows of: back to it while hungry (a scavenger takes anyone's)
    if (food < P.sated - 0.1 && !(w.tick < (a.calmUntil || 0) && a.task?.id === 'bolt')) { const c = smellCarcass(w, a); if (c) { a.task = {id: 'feed', c: c.id}; return; } }

    // prey that runs right under its nose is too good to pass up; a hungry wolf looks further
    const reach = food < P.hungry ? P.sight : food < P.sated ? P.obvious : 0;
    if (reach) {
      // those free to run: not already on a hunt, not eating, not out of breath
      const near = pack.filter(m => !huntOf(w, m) && m.stamina >= 0.6 && (m === a || (dist(m, a) < 15 && m.task?.id !== 'feed' && m.needs.food < P.sated)));
      const prey = bestPrey(w, a, P, reach, near.length);
      if (prey && near.includes(a)) {
        const h = startHunt(w, near, prey, 'game');
        for (const m of near) { m.hunt = h.id; m.task = {id: 'chase', target: prey}; }
        return;
      }
    }
    // people: only when boldness (plus the cover of night) is high enough
    if (w.tick > (a.calmUntil || 0) && b + night * 0.25 >= P.boldPeople) {
      const v = nearest(w, a, P.victims, P.sight * (0.6 + 0.4 * b), o => o.faction === 'colony' && !o.downed && !agentInZone(w, o) &&
        company(w, o, P.loneRadius) <= (b > 0.8 ? Math.max(0, pack.length - 2) : 0));
      if (v) { startMaul(w, a, v, b); return; }
    }
    // starving with no prey in sight: the pack may move on to other hunting grounds
    if (leader === a && b > 0.85 && !nearest(w, a, P.prey, P.sight) && w.rngs.wild() < P.wanderOff) {
      for (const m of pack) m.task = {id: 'leave'};
      log(w, `Голодные ${sp.plural || sp.label} ушли искать другие угодья.`, 'wildlife');
      return;
    }

    // roam: the leader picks where; hungry, it follows the scent of the nearest prey
    if (!t || t.id !== 'roam') a.task = {id: 'roam'};
    if (leader !== a && leader) {
      if (dist(a, leader) > 2.5) approach(w, a, leader.x + (a.id % 3 - 1), leader.y + ((a.id >> 1) % 3 - 1), 0.95);
      return;
    }
    // hungry: follow the scent of the nearest animal it actually hunts (A* around lakes and rocks);
    // the trail is picked again now and then, and one that leads nowhere is dropped for a while
    const r = a.task;
    if (food < P.hungry) {
      let s = r.scent != null ? w.agents.find(o => o.id === r.scent && !o.dead && !o.tame) : null;
      if (!s || w.tick - (r.scentAt || 0) > 120) {
        s = nearest(w, a, P.prey, SCENT, o => !agentInZone(w, o) && !(a.ignore?.get(o.id) > w.tick));
        r.scent = s?.id ?? null; r.scentAt = w.tick;
      }
      if (s) {
        if (approach(w, a, s.x, s.y, 0.85) !== null) return;
        ignoreFor(w, a, s.id, 600); r.scent = null;
      }
    }
    // pick a new spot when there or when stuck (no progress for a while, e.g. a lake in the way)
    const d = r.spot ? dist(a, {x: r.spot[0], y: r.spot[1]}) : 0;
    if (r.spot && d < r.bestD - 0.5) { r.bestD = d; r.since = w.tick; }
    if (!r.spot || d < 1.5 || w.tick - (r.since || 0) > 120) {
      for (let k = 0; k < 20; k++) {
        const x = 2 + w.rngs.wild() * (w.w - 4), y = 2 + w.rngs.wild() * (w.h - 4);
        const j = (y | 0) * w.w + (x | 0);
        if (!walkable(w, j) || w.nav.get('zone')[j] < P.zoneShyNight + 6 || !sameLand(w, a, j)) continue;
        r.spot = [x, y]; r.bestD = Infinity; r.since = w.tick; break;
      }
    }
    if (r.spot && approach(w, a, r.spot[0], r.spot[1], night > 0.5 ? 0.85 : 0.7) === null) r.spot = null;   // across the water: choose again
  },
};
