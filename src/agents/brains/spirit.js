// Spirit brain: the nechist of wood and water (data/bestiary.js `spirit` block). They do not raid and do
// not leave; they keep to their home ground and work on whoever comes close:
//   aura 'astray' (leshy): every `every` ticks colonists within `radius` lose their way for an hour or two;
//   aura 'lure' (rusalka): by night she sings at the shore; a colonist alone within `radius` walks to her,
//                          and she drowns them unless someone comes close and breaks the spell.
// They are seen only up close (`veil` cells, agents/combat.js nearestHostile): a leshy among the trees,
// a rusalka only while she sings. Hurt, a rusalka dives (`dives`) and a leshy fights back one on one but
// melts into the thicket when `crowd` colonists close in; hidden, nobody sees them. At home their wounds
// close (`regen`); plain weapons barely hurt a leshy (`resist`) — fire is its death. Killed, they come back after a while (data/migrations.js, `resident`).
import {FAR} from '../../nav/navigation.js';
import {SPECIES} from '../../data/species.js';
import {TERRAIN} from '../../data/terrain.js';
import {cellOf, walkable, inBounds, inMap} from '../../world/grid.js';
import {approach, escapeHeat, sameLand} from '../movement.js';
import {attack, behindRock} from '../combat.js';
import {kill, maxHp} from '../agent.js';
import {think} from '../mind.js';
import {log} from '../../core/log.js';
import {esc, g} from '../../core/util.js';
import {nightness, HOUR, DAY} from '../../core/time.js';
import {contest} from '../../data/special.js';
import {agentInZone} from '../../settlement/zone.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const code = id => TERRAIN.get(id).code;

// is cell i the spirit's home ground: deep wood, or dry land right at the water
export function isHome(w, i, home) {
  if (!walkable(w, i)) return false;
  if (home === 'forest') return w.grid.terr[i] === code('forest');
  if (home === 'shore') {
    const x = i % w.w, y = (i / w.w) | 0;
    return N4.some(([dx, dy]) => inBounds(w, x + dx, y + dy) && w.grid.terr[(y + dy) * w.w + x + dx] === code('water'));
  }
  return true;
}

// a home cell at least minDist from the camp (for a spirit that comes back); -1 if the land has none
export function homeCell(w, home, minDist) {
  for (let k = 0; k < 600; k++) {
    const i = (w.rngs.nechist() * w.w * w.h) | 0, x = i % w.w, y = (i / w.w) | 0;
    // on land the colony can reach: a rusalka on a lake nobody can walk to would sing in vain
    if (isHome(w, i, home) && w.nav.get('camp')[i] < FAR && Math.hypot(x - w.camp.x, y - w.camp.y) > minDist) return i;
  }
  return -1;
}

const lonely = (w, v, r) => !w.agents.some(o => o !== v && !o.dead && o.faction === 'colony' && dist(o, v) < r);
const spellbound = a => ['fight', 'flee', 'treat', 'astray', 'lured', 'runHome', 'muster'].includes(a.task?.id) || a.sleeping;

function wander(w, a, S) {
  const t = a.task?.id === 'lurk' || a.task?.id === 'sing' ? a.task : (a.task = {id: 'lurk'});
  if (S.night && nightness(w.tick) <= 0.5) t.id = 'lurk';
  if (!t.spot || dist(a, {x: t.spot[0], y: t.spot[1]}) < 0.8 || w.rngs.nechist() < 0.004) {
    t.spot = null;
    for (let k = 0; k < 30; k++) {
      const x = a.x + (w.rngs.nechist() * 2 - 1) * 10, y = a.y + (w.rngs.nechist() * 2 - 1) * 10;
      if (!inMap(w, x, y)) continue;
      // home ground, and out of the settlement's way (`keepOff` cells from the camp)
      if (isHome(w, (y | 0) * w.w + (x | 0), S.home) && sameLand(w, a, (y | 0) * w.w + (x | 0)) && Math.hypot(x - w.camp.x, y - w.camp.y) > (S.keepOff || 0)) { t.spot = [x, y]; break; }
    }
    // no home ground close by: look across the map, but not more than once in a while
    if (!t.spot && w.tick - (t.searched ?? -1e9) > 120) { t.searched = w.tick; const i = homeCell(w, S.home, S.keepOff || 0); if (i >= 0) t.spot = [i % w.w + 0.5, ((i / w.w) | 0) + 0.5]; }
  }
  if (t.spot && approach(w, a, t.spot[0], t.spot[1], 0.6) === null) t.spot = null;
}

// the leshy: those nearby lose their way
function leadAstray(w, a, sp, S) {
  if ((w.tick + a.id) % S.every) return;
  const lost = w.agents.filter(o => o.faction === 'colony' && !o.dead && dist(o, a) < S.radius && !agentInZone(w, o) && !spellbound(o));
  for (const v of lost) { v.task = {id: 'astray', until: w.tick + HOUR * (1 + w.rngs.nechist()), spell: 1.2}; think(w, v, 'leshyLost'); }
  if (lost.length && w.tick - (w.lastAstray || -1e9) > DAY / 2) {
    w.lastAstray = w.tick;
    log(w, `В лесу плутает ${lost.map(o => `<b>${esc(o.name)}</b>`).join(', ')}: тропы водят по кругу. ${sp.label[0].toUpperCase() + sp.label.slice(1)} шалит.`, 'wildlife', 'notice');
  }
}

// the rusalka: by night she calls a lonely colonist to the water
function lure(w, a, sp, S) {
  const v = w.agents.find(o => !o.dead && o.task?.id === 'lured' && o.task.by === a.id);
  if (v) {
    if (!lonely(w, v, 5)) {   // someone came close: the spell breaks
      v.task = null; v.think = 0;
      log(w, `<b>${esc(v.name)}</b> ${g(v, 'очнулся', 'очнулась')} у самой воды: рядом оказались свои. ${sp.label[0].toUpperCase() + sp.label.slice(1)} скрылась.`, 'danger', 'notice');
      a.task = {id: 'lurk'};
      return true;
    }
    if (dist(a, v) < 1.2) { a.task = {id: 'maul', target: v}; attack(w, a, v); }
    else a.task = {id: 'sing'};
    return true;
  }
  a.task = a.task?.id === 'sing' ? a.task : {id: 'sing'};
  // one song a night: after a try (kept, broken or resisted) she waits for the next night
  if ((w.tick + a.id) % 30 || w.tick < (a.lureAt ?? -1e9) + 12 * HOUR) return false;
  let best = null, bd = S.radius;
  for (const o of w.agents) {
    if (o.faction !== 'colony' || o.dead || o.downed || spellbound(o) || agentInZone(w, o) || !lonely(w, o, 5)) continue;
    const d = dist(o, a); if (d < bd) { bd = d; best = o; }
  }
  if (best) {
    a.lureAt = w.tick;
    // a sharp eye and a clear head see through the song: Perception + Intelligence against her Charisma ×2
    const vs = best.special, ss = a.special;
    if (vs && ss && w.rngs.nechist() < contest(vs.P + vs.I, ss.C * 2)) {
      think(w, best, 'resistedSong');
      best.task = {id: 'runHome'};   // what the journal says is what happens: back to the settlement
      log(w, `Ночью у воды пели, но <b>${esc(best.name)}</b> ${g(best, 'не поддался', 'не поддалась')} и ${g(best, 'ушёл', 'ушла')} к своим.`, 'wildlife', 'notice');
      return false;
    }
    best.task = {id: 'lured', by: a.id, until: w.tick + 2 * HOUR, spell: 1.5};
    think(w, best, 'lured');
    log(w, `Ночью у воды поют. <b>${esc(best.name)}</b> бредёт на голос — одному туда нельзя!`, 'danger');
  }
  return false;
}

export const spiritBrain = {
  id: 'spirit',
  step(w, a) {
    const sp = SPECIES.get(a.species), S = sp.spirit, i = cellOf(w, a), T = w.grid.temp[i];
    if (T > sp.heatHarm) {
      a.hp -= Math.min(0.02, (T - sp.heatHarm) * 0.0002);
      if (a.hp <= 0) { kill(w, a, 'огня'); return; }
      escapeHeat(w, a, 1.2); return;
    }
    if (a.cd > 0) a.cd--;
    if (isHome(w, i, S.home) && a.hp < maxHp(a)) a.hp = Math.min(maxHp(a), a.hp + 0.0003 * maxHp(a) * (S.regen || 1));
    const active = !S.night || nightness(w.tick) > 0.5;
    // hidden: a rusalka under the water, a leshy deep in the thicket — nobody sees it till it comes out
    if (a.hiddenUntil > w.tick) {
      a.veil = 0;
      const t = a.task?.id === 'hide' ? a.task : (a.task = {id: 'hide', spot: null});
      if (!t.spot && !t.searched) { t.searched = true; const k = homeCell(w, S.home, (S.keepOff || 0) * 1.5); if (k >= 0) t.spot = [k % w.w + 0.5, ((k / w.w) | 0) + 0.5]; }
      if (t.spot && approach(w, a, t.spot[0], t.spot[1], 1.2) === null) t.spot = null;
      return;
    }
    // whoever hurts it: a rusalka dives; a leshy fights back one on one, but slips away from a crowd
    // …but not into the settlement: the nechist keeps to its wood and water
    const h = a.hurtBy, foe = h && w.tick - h.tick < 200 ? w.agents.find(o => o.id === h.id && !o.dead && dist(o, a) < 12 && !agentInZone(w, o)) : null;
    a.veil = foe ? null : S.aura === 'lure' && active && a.task?.id === 'sing' ? 6 : S.veil;
    if (foe) {
      const crowd = w.agents.filter(o => o.faction === 'colony' && !o.dead && dist(o, a) < 5).length;
      if (S.dives || crowd >= (S.crowd || 3)) {
        a.hiddenUntil = w.tick + (S.dives ? 2 : 1) * HOUR; a.hurtBy = null; a.veil = 0;
        log(w, S.dives ? `${sp.label[0].toUpperCase() + sp.label.slice(1)} ушла под воду.` : `${sp.label[0].toUpperCase() + sp.label.slice(1)} растворился в чаще.`, 'wildlife');
        return;
      }
      a.task = {id: 'maul', target: foe};
      if (dist(a, foe) > 0.9 || behindRock(w, a, foe)) approach(w, a, foe.x, foe.y, 1.1); else attack(w, a, foe);
      return;
    }
    if (S.aura === 'lure' && active && lure(w, a, sp, S)) return;
    if (S.aura === 'astray') leadAstray(w, a, sp, S);
    wander(w, a, S);
  },
};
