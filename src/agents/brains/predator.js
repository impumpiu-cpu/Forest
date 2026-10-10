// Predator brain (wolves). Priorities, highest first:
//   escape fire → shun the lit camp → retreat when wounded or outnumbered → finish a meal
//   → keep chasing / mauling → when hungry, pick prey (hares) → when starving or at night,
//   pick a person who is alone → otherwise roam with the pack, the leader choosing where.
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

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function nearest(w, a, species, r, filter = () => true) {
  let best = null, bd = r;
  for (const o of w.agents) {
    if (o.dead || !species.includes(o.species) || !filter(o)) continue;
    const d = dist(a, o); if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// alone = nobody else of its kind nearby and well away from the camp
// alone = outside the settlement zone with nobody else of its kind nearby
function isAlone(w, v, P) {
  if (agentInZone(w, v)) return false;
  return !w.agents.some(o => o !== v && !o.dead && o.species === v.species && dist(o, v) < P.loneRadius);
}

function packOf(w, a) { return w.agents.filter(o => !o.dead && o.pack === a.pack); }

export const predatorBrain = {
  id: 'predator',
  step(w, a) {
    const sp = SPECIES.get(a.species), P = sp.predator, i = cellOf(w, a), T = w.grid.temp[i];
    stepBody(w, a);
    if (a.dead) return;
    if (a.cd > 0) a.cd--;
    if (T > 45 || nearFire(w, a, 2.5)) { a.task = {id: 'bolt'}; escapeHeat(w, a, 1.4); return; }

    const hunger = a.needs.food, night = nightness(w.tick);
    const dZone = w.nav.get('zone')[i], shy = night > 0.5 || w.campLit ? P.zoneShyNight : P.zoneShy;
    const people = w.agents.filter(o => !o.dead && P.victims.includes(o.species) && dist(o, a) < 6);

    // wounded, starving with nothing to hunt, or facing a crowd: leave for good
    if (a.task?.id === 'leave' || a.hp < sp.hp * 0.35) {
      if (a.task?.id !== 'leave') { a.task = {id: 'leave'}; if (packOf(w, a)[0] === a) log(w, 'Раненые волки уходят из леса.', 'wildlife'); }
      if (follow(w, a, 'edge', 1.2) === 'arrived') a.gone = true;
      return;
    }
    if (people.length >= P.groupFear) { a.task = {id: 'bolt'}; bolt(w, a, people, sprintMul(a, P.sprint, P.stamina)); return; }
    // the settlement zone keeps wolves at bay (wider at night, when the fire is lit)
    if (dZone < shy && a.task?.id !== 'maul') { a.task = {id: 'roam'}; ascend(w, a, 'zone', 1); return; }

    const t = a.task;
    if (t?.id === 'feed') {
      a.needs.food = Math.min(1, a.needs.food + 0.012); recover(a);
      if (--t.left <= 0) a.task = null;
      return;
    }
    if (t?.id === 'chase') {
      const prey = t.target;
      if (a.stamina <= 0.05) { a.task = {id: 'rest'}; return; }   // out of breath: lie down before the next try
      if (!prey || prey.dead || !w.agents.includes(prey) || dist(a, prey) > P.sight * 1.3 || agentInZone(w, prey)) { a.task = {id: 'roam'}; return; }
      approach(w, a, prey.x, prey.y, sprintMul(a, P.sprint, P.stamina));
      if (dist(a, prey) < 0.7) {
        kill(w, prey, 'зубов', a); w.stats.wolfKills++;
        // the whole pack shares the kill
        for (const m of packOf(w, a)) if (dist(m, a) < 8) m.task = {id: 'feed', left: P.feedTicks};
        a.task = {id: 'feed', left: P.feedTicks};
      }
      return;
    }
    if (t?.id === 'maul') {
      const v = t.target;
      const helpers = v && w.agents.filter(o => o !== v && !o.dead && o.species === v.species && dist(o, v) < 5).length;
      if (a.stamina <= 0.05) { a.task = {id: 'rest'}; return; }
      if (!v || v.dead || !w.agents.includes(v) || helpers >= 2 ||
          agentInZone(w, v)) {
        // the victim got help or reached the camp: the pack backs off and won't try again for a while
        for (const m of packOf(w, a)) { m.calmUntil = w.tick + 500; if (m.task?.id === 'maul') m.task = {id: 'roam'}; }
        return;
      }
      if (dist(a, v) > 0.9) approach(w, a, v.x, v.y, sprintMul(a, P.sprint, P.stamina * 0.6));
      else { attack(w, a, v); if (v.dead) a.needs.food = 1; }
      return;
    }

    recover(a);
    if (t?.id === 'rest') { recover(a); recover(a); if (a.stamina < 0.7) return; a.task = null; }
    // hungry: hares first; a lone person only when starving or under cover of night with the pack
    if (hunger < 0.65) {
      const prey = nearest(w, a, P.prey, P.sight, o => !agentInZone(w, o));
      if (prey) { a.task = {id: 'chase', target: prey}; return; }
      const bold = w.tick > (a.calmUntil || 0) && (hunger < 0.3 || (night > 0.6 && packOf(w, a).length >= 2));
      if (bold) {
        const v = nearest(w, a, P.victims, P.sight * 0.8, o => o.faction === 'colony' && isAlone(w, o, P));
        if (v) {
          a.task = {id: 'maul', target: v}; w.stats.wolfAttacks++;
          log(w, `Волки нападают! <b>${v.name}</b> далеко от лагеря и без помощи.`, 'danger');
          for (const m of packOf(w, a)) if (m !== a && dist(m, a) < 10 && m.task?.id !== 'feed') { m.task = {id: 'maul', target: v}; m.calmUntil = w.tick + 500; }
          a.calmUntil = w.tick + 500;
          return;
        }
      }
      if (hunger < 0.12 && !w.agents.some(o => P.prey.includes(o.species))) { a.task = {id: 'leave'}; return; }
    }

    // roam: the leader wanders between distant spots, the pack trails behind it
    const pack = packOf(w, a), leader = pack[0];
    if (!t || t.id !== 'roam') a.task = {id: 'roam'};
    if (leader !== a && leader) {
      if (dist(a, leader) > 2.5) approach(w, a, leader.x + (a.id % 3 - 1), leader.y + ((a.id >> 1) % 3 - 1), 0.9);
      return;
    }
    const r = a.task;
    // hungry and nothing in sight: follow the scent toward the nearest prey anywhere on the map
    if (hunger < 0.65) {
      const scent = nearest(w, a, P.prey, Infinity);
      if (scent) { approach(w, a, scent.x, scent.y, 0.8); return; }
    }
    if (!r.spot || dist(a, {x: r.spot[0], y: r.spot[1]}) < 1.5 || Math.random() < 0.002) {
      for (let k = 0; k < 20; k++) {
        const x = 2 + Math.random() * (w.w - 4), y = 2 + Math.random() * (w.h - 4);
        const j = (y | 0) * w.w + (x | 0);
        if (!walkable(w, j) || w.nav.get('zone')[j] < P.zoneShyNight + 6) continue;
        r.spot = [x, y]; break;
      }
    }
    if (r.spot) approach(w, a, r.spot[0], r.spot[1], night > 0.5 ? 0.8 : 0.55);
  },
};
