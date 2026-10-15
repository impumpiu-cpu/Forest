// Predator brain (wolves). Hunger is the motive:
//   fed       — roams with the pack, still snaps up prey that runs right under its nose;
//   hungry    — follows the scent of the nearest prey across the map, the pack hunts together;
//   starving  — boldness grows: comes closer to the settlement, goes for a lone colonist
//               (at night sooner), when desperate even for a pair, and backs off less readily.
// Fire, wounds, a crowd of people and the settlement zone still drive it away.
// All numbers come from the species' `predator` block in data/species.js.
import {SPECIES, matchesKind} from '../../data/species.js';
import {nightness} from '../../core/time.js';
import {cellOf, walkable} from '../../world/grid.js';
import {approach, escapeHeat, nearFire, bolt, follow, sprintMul, recover, ascend, shunsHeat} from '../movement.js';
import {agentInZone} from '../../settlement/zone.js';
import {attack} from '../combat.js';
import {SPECIES as SP} from '../../data/species.js';
import {stepBody} from '../body.js';
import {kill, maxHp} from '../agent.js';
import {log} from '../../core/log.js';
import {think} from '../mind.js';
import {esc, clamp} from '../../core/util.js';

// how far a hungry predator smells its prey (cells)
const SCENT = 70;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function nearest(w, a, species, r, filter = () => true) {
  let best = null, bd = r;
  for (const o of w.agents) {
    if (o.dead || o.tame || !matchesKind(o.species, species) || !filter(o)) continue;   // the pen's animals are not prey
    const d = dist(a, o); if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// how many others of the victim's kind stand close to it
const company = (w, v, r) => w.agents.filter(o => o !== v && !o.dead && (o.species === v.species || (!!SPECIES.get(o.species).rel && !!SPECIES.get(v.species).rel)) && dist(o, v) < r).length;
const packOf = (w, a) => w.agents.filter(o => !o.dead && o.pack === a.pack);
// big game (a mule) is prey only once it is badly hurt
const weakEnough = (o, P) => !(P.weakPrey || []).includes(o.species) || o.hp < maxHp(o) * P.weakBelow;
const preyKinds = P => [...P.prey, ...(P.weakPrey || [])];

export const boldness = (a, P) => clamp((P.hungry - a.needs.food) / (P.hungry - P.starving), 0, 1);

function startMaul(w, a, v, b) {
  const P = SPECIES.get(a.species).predator;
  for (const m of packOf(w, a)) m.calmUntil = w.tick + P.calm * (1 - 0.5 * b);   // one try at a time
  for (const m of packOf(w, a)) if ((m === a || dist(m, a) < 12) && m.task?.id !== 'feed') m.task = {id: 'maul', target: v};
  w.stats.wolfAttacks++;
  const sp = SPECIES.get(a.species), many = packOf(w, a).length > 1, who = many ? sp.plural : sp.label;
  think(w, v, 'wolfAttack', {who: sp.plural});
  const n = company(w, v, P.loneRadius);
  log(w, b > 0.8 && n ? `Изголодавшиеся ${sp.plural} бросаются на людей! <b>${esc(v.name)}</b> и спутник(и) вдали от лагеря.`
    : `${who[0].toUpperCase() + who.slice(1)} ${many ? 'нападают' : 'нападает'}! <b>${esc(v.name)}</b> далеко от лагеря и без помощи.`, 'danger');
}

export const predatorBrain = {
  id: 'predator',
  step(w, a) {
    const sp = SPECIES.get(a.species), P = sp.predator, i = cellOf(w, a), T = w.grid.temp[i];
    stepBody(w, a);
    if (a.dead) return;
    if (a.cd > 0) a.cd--;
    if (shunsHeat(w, a, sp, T, 2.5)) { a.task = {id: 'bolt'}; escapeHeat(w, a, 1.4); return; }

    const food = a.needs.food, b = boldness(a, P), night = nightness(w.tick);
    const dZone = w.nav.get('zone')[i];
    const shy = (night > 0.5 || w.campLit ? P.zoneShyNight : P.zoneShy) * (1 - 0.6 * b);
    const people = w.agents.filter(o => !o.dead && matchesKind(o.species, P.victims) && dist(o, a) < 6);
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
      if (approach(w, a, prey.x, prey.y, sprintMul(a, P.sprint, P.stamina)) === null) { (a.ignore || (a.ignore = new Map())).set(prey.id, w.tick + 600); a.task = {id: 'roam'}; return; }
      // big game is not caught with one bite: the pack bites it down while it kicks back
      if (SP.get(prey.species).big) {
        if (dist(a, prey) < 1.0) {
          attack(w, a, prey);
          if (prey.dead) {
            w.stats.wolfKills++;
            const eaters = pack.filter(m => dist(m, a) < 10);
            for (const m of eaters) m.task = {id: 'feed', left: P.feedTicks * 2, gain: P.bigMeal / eaters.length / (P.feedTicks * 2)};
          }
        }
        return;
      }
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
        if (v && !v.dead && t.target === v) think(w, v, 'escapedWolves', {who: sp.plural});
        if (v && !v.dead) for (const m of pack) { m.calmUntil = w.tick + P.calm * (1 - 0.7 * b); if (m.task?.id === 'maul') m.task = {id: 'roam'}; }
        else if (t) a.task = {id: 'roam'};
        return;
      }
      // cannot get at the victim (water in between): give up for now
      if (!t.anchor || dist(a, t.anchor) > 3 || dist(a, v) < 1.5) { t.anchor = {x: a.x, y: a.y}; t.since = w.tick; }
      if (w.tick - t.since > 120) { a.task = {id: 'roam'}; a.calmUntil = w.tick + P.calm * 0.5; return; }
      // too far to bite: close in and nothing more this tick
      if (dist(a, v) > 0.9) {
        if (approach(w, a, v.x, v.y, sprintMul(a, P.sprint, P.stamina * 0.6)) === null) { a.task = {id: 'roam'}; a.calmUntil = w.tick + P.calm * 0.5; }
        return;
      }
      {
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
      const prey = nearest(w, a, preyKinds(P), reach, o => weakEnough(o, P) && !agentInZone(w, o) && !(a.ignore?.get(o.id) > w.tick));
      if (prey) { a.task = {id: 'chase', target: prey}; return; }
    }
    // people: only when boldness (plus the cover of night) is high enough
    if (w.tick > (a.calmUntil || 0) && b + night * 0.25 >= P.boldPeople) {
      const v = nearest(w, a, P.victims, P.sight * (0.6 + 0.4 * b), o => o.faction === 'colony' && !agentInZone(w, o) &&
        company(w, o, P.loneRadius) <= (b > 0.8 ? Math.max(0, pack.length - 2) : 0));
      if (v) { startMaul(w, a, v, b); return; }
    }
    // starving with no prey in sight: the pack may move on to other hunting grounds
    if (leader === a && b > 0.85 && !nearest(w, a, P.prey, P.sight) && w.rng() < P.wanderOff) {
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
        (a.ignore || (a.ignore = new Map())).set(s.id, w.tick + 600); r.scent = null;
      }
    }
    // pick a new spot when there or when stuck (no progress for a while, e.g. a lake in the way)
    const d = r.spot ? dist(a, {x: r.spot[0], y: r.spot[1]}) : 0;
    if (r.spot && d < r.bestD - 0.5) { r.bestD = d; r.since = w.tick; }
    if (!r.spot || d < 1.5 || w.tick - (r.since || 0) > 120) {
      for (let k = 0; k < 20; k++) {
        const x = 2 + w.rng() * (w.w - 4), y = 2 + w.rng() * (w.h - 4);
        const j = (y | 0) * w.w + (x | 0);
        if (!walkable(w, j) || w.nav.get('zone')[j] < P.zoneShyNight + 6) continue;
        r.spot = [x, y]; r.bestD = Infinity; r.since = w.tick; break;
      }
    }
    if (r.spot && approach(w, a, r.spot[0], r.spot[1], night > 0.5 ? 0.85 : 0.7) === null) r.spot = null;   // across the water: choose again
  },
};
