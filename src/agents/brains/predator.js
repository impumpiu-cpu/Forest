// Predator brain (wolves). Hunger is the motive:
//   fed       — roams with the pack, still snaps up prey that runs right under its nose;
//   hungry    — follows the scent of the nearest prey across the map, the pack hunts together;
//   starving  — boldness grows: comes closer to the settlement, goes for a lone colonist
//               (at night sooner), when desperate even for a pair, and backs off less readily.
// Fire, wounds, a crowd of people and the settlement zone still drive it away.
// All numbers come from the species' `predator` block in data/species.js.
import {SPECIES} from '../../data/species.js';
import {nightness} from '../../core/time.js';
import {cellOf, walkable} from '../../world/grid.js';
import {approach, escapeHeat, nearFire, bolt, follow, sprintMul, recover, ascend} from '../movement.js';
import {agentInZone} from '../../settlement/zone.js';
import {attack} from '../combat.js';
import {stepBody} from '../body.js';
import {kill} from '../agent.js';
import {log} from '../../core/log.js';
import {think} from '../mind.js';
import {esc, clamp} from '../../core/util.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function nearest(w, a, species, r, filter = () => true) {
  let best = null, bd = r;
  for (const o of w.agents) {
    if (o.dead || !species.includes(o.species) || !filter(o)) continue;
    const d = dist(a, o); if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// how many others of the victim's kind stand close to it
const company = (w, v, r) => w.agents.filter(o => o !== v && !o.dead && o.species === v.species && dist(o, v) < r).length;
const packOf = (w, a) => w.agents.filter(o => !o.dead && o.pack === a.pack);
export const boldness = (a, P) => clamp((P.hungry - a.needs.food) / (P.hungry - P.starving), 0, 1);

function startMaul(w, a, v, b) {
  const P = SPECIES.get(a.species).predator;
  for (const m of packOf(w, a)) m.calmUntil = w.tick + P.calm * (1 - 0.5 * b);   // one try at a time
  for (const m of packOf(w, a)) if ((m === a || dist(m, a) < 12) && m.task?.id !== 'feed') m.task = {id: 'maul', target: v};
  w.stats.wolfAttacks++;
  think(w, v, 'wolfAttack');
  const n = company(w, v, P.loneRadius);
  log(w, b > 0.8 && n ? `Изголодавшиеся волки бросаются на людей! <b>${esc(v.name)}</b> и спутник(и) вдали от лагеря.`
    : `Волки нападают! <b>${esc(v.name)}</b> далеко от лагеря и без помощи.`, 'danger');
}

export const predatorBrain = {
  id: 'predator',
  step(w, a) {
    const sp = SPECIES.get(a.species), P = sp.predator, i = cellOf(w, a), T = w.grid.temp[i];
    stepBody(w, a);
    if (a.dead) return;
    if (a.cd > 0) a.cd--;
    if (T > 45 || nearFire(w, a, 2.5)) { a.task = {id: 'bolt'}; escapeHeat(w, a, 1.4); return; }

    const food = a.needs.food, b = boldness(a, P), night = nightness(w.tick);
    const dZone = w.nav.get('zone')[i];
    const shy = (night > 0.5 || w.campLit ? P.zoneShyNight : P.zoneShy) * (1 - 0.6 * b);
    const people = w.agents.filter(o => !o.dead && P.victims.includes(o.species) && dist(o, a) < 6);
    const pack = packOf(w, a), leader = pack[0];

    // wounded: leave for good
    if (a.task?.id === 'leave' || a.hp < sp.hp * 0.35) {
      if (a.task?.id !== 'leave') { a.task = {id: 'leave'}; if (leader === a) log(w, 'Раненые волки уходят из леса.', 'wildlife'); }
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
      a.needs.food = Math.min(1, a.needs.food + t.gain); recover(a);
      if (--t.left <= 0) a.task = null;
      return;
    }
    if (t?.id === 'chase') {
      const prey = t.target;
      if (a.stamina <= 0.05) { a.task = {id: 'rest'}; return; }   // out of breath: lie down before the next try
      if (!prey || prey.dead || !w.agents.includes(prey) || dist(a, prey) > P.sight * 1.3 || agentInZone(w, prey)) { a.task = {id: 'roam'}; return; }
      // the wolf itself is not getting anywhere (water or rocks in between): give this one up for half a day
      if (!t.anchor || dist(a, t.anchor) > 3) { t.anchor = {x: a.x, y: a.y}; t.since = w.tick; }
      if (w.tick - t.since > 90) { (a.ignore || (a.ignore = new Map())).set(prey.id, w.tick + 600); a.task = {id: 'roam'}; return; }
      approach(w, a, prey.x, prey.y, sprintMul(a, P.sprint, P.stamina));
      if (dist(a, prey) < 0.7) {
        kill(w, prey, 'зубов', a); w.stats.wolfKills++;
        // the pack shares the kill: everyone close enough gets a part of the meal
        const eaters = pack.filter(m => m === a || dist(m, a) < 8);
        for (const m of eaters) m.task = {id: 'feed', left: P.feedTicks, gain: P.meal / eaters.length / P.feedTicks};
      }
      return;
    }
    if (t?.id === 'maul') {
      const v = t.target;
      if (a.stamina <= 0.05) { a.task = {id: 'rest'}; return; }
      // help arrived or the victim reached the settlement: back off for a while (shorter when starving)
      if (!v || v.dead || !w.agents.includes(v) || company(w, v, 5) >= 2 + Math.floor(b * 2) || agentInZone(w, v)) {
        if (v && !v.dead && t.target === v) think(w, v, 'escapedWolves');
        if (v && !v.dead) for (const m of pack) { m.calmUntil = w.tick + P.calm * (1 - 0.7 * b); if (m.task?.id === 'maul') m.task = {id: 'roam'}; }
        else if (t) a.task = {id: 'roam'};
        return;
      }
      // cannot get at the victim (water in between): give up for now
      if (!t.anchor || dist(a, t.anchor) > 3 || dist(a, v) < 1.5) { t.anchor = {x: a.x, y: a.y}; t.since = w.tick; }
      if (w.tick - t.since > 120) { a.task = {id: 'roam'}; a.calmUntil = w.tick + P.calm * 0.5; return; }
      if (dist(a, v) > 0.9) approach(w, a, v.x, v.y, sprintMul(a, P.sprint, P.stamina * 0.6));
      else {
        attack(w, a, v);
        if (v.dead) { const eaters = pack.filter(m => dist(m, a) < 10); for (const m of eaters) m.task = {id: 'feed', left: P.feedTicks * 2, gain: P.bigMeal / eaters.length / (P.feedTicks * 2)}; }
      }
      return;
    }

    recover(a);
    if (t?.id === 'rest') { recover(a); recover(a); if (a.stamina < 0.7) return; a.task = null; }

    // the pack hunts together: join the leader's chase
    if (leader !== a && leader?.task?.id === 'chase' && food < P.sated && !(a.ignore?.get(leader.task.target?.id) > w.tick)) { a.task = {id: 'chase', target: leader.task.target}; return; }
    if (leader !== a && leader?.task?.id === 'maul') { a.task = {id: 'maul', target: leader.task.target}; return; }

    // prey that runs right under its nose is too good to pass up; a hungry wolf looks further
    const reach = food < P.hungry ? P.sight : food < P.sated ? P.obvious : 0;
    if (reach) {
      const prey = nearest(w, a, P.prey, reach, o => !agentInZone(w, o) && !(a.ignore?.get(o.id) > w.tick));
      if (prey) { a.task = {id: 'chase', target: prey}; return; }
    }
    // people: only when boldness (plus the cover of night) is high enough
    if (w.tick > (a.calmUntil || 0) && b + night * 0.25 >= P.boldPeople) {
      const v = nearest(w, a, P.victims, P.sight * (0.6 + 0.4 * b), o => o.faction === 'colony' && !agentInZone(w, o) &&
        company(w, o, P.loneRadius) <= (b > 0.8 ? Math.max(0, pack.length - 2) : 0));
      if (v) { startMaul(w, a, v, b); return; }
    }
    // starving with no prey in sight: the pack may move on to other hunting grounds
    if (leader === a && b > 0.85 && !nearest(w, a, P.prey, P.sight) && Math.random() < P.wanderOff) {
      for (const m of pack) m.task = {id: 'leave'};
      log(w, 'Голодная стая ушла искать другие угодья.', 'wildlife');
      return;
    }

    // roam: the leader picks where; hungry, it follows the scent of the nearest prey
    if (!t || t.id !== 'roam') a.task = {id: 'roam'};
    if (leader !== a && leader) {
      if (dist(a, leader) > 2.5) approach(w, a, leader.x + (a.id % 3 - 1), leader.y + ((a.id >> 1) % 3 - 1), 0.95);
      return;
    }
    // hungry: follow the scent along the prey flow field, which leads around lakes and rocks
    if (food < P.hungry && w.agents.some(o => P.prey.includes(o.species))) {
      if (follow(w, a, 'prey', 0.85) === 'moving') return;
    }
    const r = a.task;
    // pick a new spot when there or when stuck (no progress for a while, e.g. a lake in the way)
    const d = r.spot ? dist(a, {x: r.spot[0], y: r.spot[1]}) : 0;
    if (r.spot && d < r.bestD - 0.5) { r.bestD = d; r.since = w.tick; }
    if (!r.spot || d < 1.5 || w.tick - (r.since || 0) > 120) {
      for (let k = 0; k < 20; k++) {
        const x = 2 + Math.random() * (w.w - 4), y = 2 + Math.random() * (w.h - 4);
        const j = (y | 0) * w.w + (x | 0);
        if (!walkable(w, j) || w.nav.get('zone')[j] < P.zoneShyNight + 6) continue;
        r.spot = [x, y]; r.bestD = Infinity; r.since = w.tick; break;
      }
    }
    if (r.spot) approach(w, a, r.spot[0], r.spot[1], night > 0.5 ? 0.85 : 0.7);
  },
};
