// Wild herds (docs/SETTLEMENT.md): deer, goats, elk. The herd knows and announces, the beast chooses.
//
// A herd is plain data (w.herds {id: herd}, members by id, saved with the world). Once a tick (sim.js)
// stepHerds:
//   — gathers the herd beasts that have none into the nearest herd of their kind, or starts a new one;
//   — keeps the herd's pasture (herd.spot): where the herd grazes now, moved on when the herd is there;
//   — looks round through the lookouts: one or two members a tick, in turn, see what they flee from
//     (the species' `flee.from` within its `flee.radius`); what they see is the herd's alarm.
// Each beast (agents/behaviours/bolt.js, alert.js, graze.js; agents/behaviours/standGround.js, drawOff.js) decides by itself what to do with it:
//   — a skittish one (a.nerve low) bolts at the first alarm; a calm one only when the threat comes within
//     its own reach, or once those around it have run for a while;
//   — a wounded one runs slower and falls behind — and wolves go for the straggler (agents/hunting.js
//     preyValue: stragglerOf);
//   — an elk does not run: a bold bull goes for whatever attacks one of its herd, the rest draw off.
// A beast thinks of its own eyes only on its lookout turn; the rest of the time it trusts the herd.
import {SPECIES, matchesKind} from '../data/species.js';
import {grazeCodes} from '../data/terrain.js';
import {walkable, inMap} from '../world/grid.js';
import {sameLand} from './movement.js';
import {nearAgents} from './spatial.js';
import {liveById} from './lookup.js';
import {perTick, dist} from '../core/util.js';
import {wake} from './attention.js';
import {hpShare} from './agent.js';
import {prune, middleOf, nextLookouts} from './group.js';
import {WILD_HERD as HERD} from '../data/behaviour.js';

export {HERD};   // (data/behaviour.js)
export const herdOf = (w, a) => (a.herd != null ? w.herds?.[a.herd] || null : null);
const isHerdBeast = a => !a.dead && !a.gone && !a.tame && a.owner == null && a.faction === 'wild' && !!SPECIES.get(a.species).herd;

// a beast's own nerve, rolled once from the wild stream
export function nerveOf(w, a) {
  if (a.nerve == null) { const [lo, hi] = HERD.nerve; a.nerve = +(lo + (hi - lo) * w.rngs.wild()).toFixed(3); }
  return a.nerve;
}

// what a beast flees from, near it: the species' `flee.from` kinds within r
export function threatsNear(w, a, radius, from) {
  const out = [];
  for (const o of nearAgents(w, a.x, a.y, radius)) {
    if (o === a || o.dead || !matchesKind(o.species, from)) continue;
    if (o.task?.tame === a.id) continue;   // the herder coming with bait moves slowly: it lets them come
    const r = radius * (o.stalking ? 0.55 : 1);   // a creeping hunter is noticed much later
    if ((o.x - a.x) ** 2 + (o.y - a.y) ** 2 < r * r) out.push(o);
  }
  return out;
}

// herders holding out hay right now: a beast stops for them (the old check asked every beast every tick)
// (cached once a tick: a herder may drop the bait later in the same tick, so readers check o.task?.tame)
export const calmHerders = w => perTick(w, 'herd.calm', () => w.agents.filter(o => o.task?.tame != null && o.task.calm));   // scan: once a tick, not per beast

// the herd's alarm, if fresh: {t, start, ids, threats}
export function herdAlarm(w, H) {
  const al = H?.alarm;
  if (!al || w.tick - al.t > HERD.alarmFor) return null;
  const threats = al.ids.map(id => liveById(w, id)).filter(Boolean);
  return threats.length ? {...al, threats} : null;
}

// is this beast a straggler: in a herd, but far from its middle (or hurt and lagging)
export function stragglerOf(w, a) {
  const H = herdOf(w, a);
  if (!H || H.n < 2) return false;
  return Math.hypot(a.x - H.cx, a.y - H.cy) > HERD.straggler || hpShare(a) < 0.6;
}

// pick a pasture around (x, y) for a herd: of a few candidate patches the lushest not hard against the edge
function pasture(w, lead, sp, far) {
  const ok = grazeCodes(sp.grazes?.terrain || HERD.pasture), reach = far ? 30 : 8;
  let best = null, bv = -Infinity;
  for (let k = 0; k < 12; k++) {
    const x = lead.x + (w.rngs.wild() * 2 - 1) * reach, y = lead.y + (w.rngs.wild() * 2 - 1) * reach;
    if (!inMap(w, x, y)) continue;
    const j = (y | 0) * w.w + (x | 0);
    if (!walkable(w, j) || !ok.has(w.grid.terr[j]) || w.zone?.[j] || !sameLand(w, lead, j)) continue;
    const v = w.grid.fert[j] + Math.min(8, x, y, w.w - x, w.h - y) * 0.12 + w.rngs.wild() * 0.3;
    if (v > bv) { bv = v; best = [x, y]; }
  }
  return best;
}

// once a tick (sim.js)
export function stepHerds(w) {
  const herds = w.herds ||= {};
  // 1. beasts without a herd join the nearest of their kind, or start one
  for (const a of w.agents) {   // scan: once a tick, the herd step itself
    if (!isHerdBeast(a) || herdOf(w, a)) continue;
    const sp = SPECIES.get(a.species);
    let best = null, bd = HERD.join;
    for (const H of Object.values(herds)) {
      if (H.species !== a.species || H.n >= sp.herd.cap) continue;
      const d = Math.hypot(a.x - H.cx, a.y - H.cy);
      if (d < bd) { bd = d; best = H; }
    }
    if (!best) { const id = w.nextHerd = (w.nextHerd || 0) + 1; best = herds[id] = {id, species: a.species, members: [], n: 0, cx: a.x, cy: a.y, spot: null, look: 0, alarm: null}; }
    best.members.push(a.id); best.n = best.members.length; a.herd = best.id;
  }
  // 2. every herd: members, middle, pasture, lookouts
  for (const H of Object.values(herds)) {
    const ms = prune(w, H, a => isHerdBeast(a) && a.herd === H.id, a => { if (a.herd === H.id) a.herd = null; });
    if (!ms.length) { delete herds[H.id]; continue; }
    const mid = middleOf(ms); H.cx = mid.x; H.cy = mid.y;
    const sp = SPECIES.get(H.species);
    // the pasture: moved on once the herd has got there, now and then for no reason, never during an alarm
    const calm = !herdAlarm(w, H);
    if (calm && (!H.spot || Math.hypot(H.cx - H.spot[0], H.cy - H.spot[1]) < 2.5 || w.rngs.wild() < 0.003)) {
      const s = pasture(w, ms[0], sp, w.rngs.wild() < 0.15);
      if (s) { H.spot = s; H.spotV = (H.spotV || 0) + 1; }
    }
    // the lookouts: a few members, in turn, look round for everyone
    const r = (sp.flee?.radius || sp.herd.alert || HERD.alertR);
    const from = sp.flee?.from || HERD.fleeFrom;
    for (const L of nextLookouts(H, ms, HERD.lookouts)) {
      const seen = threatsNear(w, L, r * (L.nerve ? 1.2 / L.nerve : 1), from);
      if (!seen.length) continue;
      const fresh = !(H.alarm && w.tick - H.alarm.t <= HERD.alarmFor);
      const al = fresh ? (H.alarm = {start: w.tick, t: w.tick, ids: []}) : H.alarm;
      if (fresh) for (const m of ms) wake(m, 'тревога стада', 'тревога стада');   // the herd's cry: everyone thinks now (agents/brains/tabled.js)
      al.t = w.tick;
      for (const o of seen) if (!al.ids.includes(o.id)) al.ids.push(o.id);
      if (al.ids.length > 8) al.ids = al.ids.slice(-8);
    }
    if (H.alarm && w.tick - H.alarm.t > HERD.alarmFor) H.alarm = null;
  }
}

// a herd beast's own patch of the pasture: its offset from the herd's spot, kept while the spot holds
function patchOf(w, a, H) {
  if (!H?.spot) return null;
  if (a.patch?.v === H.spotV && a.patch.fails >= 3) return null;   // cannot get there: grazes where it is
  if (!a.patch || a.patch.v !== H.spotV || a.patch.lost) {
    const fails = a.patch?.v === H.spotV ? (a.patch.fails || 0) + (a.patch.lost ? 1 : 0) : 0;
    const ang = w.rngs.wild() * Math.PI * 2, r = w.rngs.wild() * HERD.spread;
    a.patch = {v: H.spotV, x: H.spot[0] + Math.cos(ang) * r, y: H.spot[1] + Math.sin(ang) * r, fails};
    if (!inMap(w, a.patch.x, a.patch.y) || !walkable(w, (a.patch.y | 0) * w.w + (a.patch.x | 0))) { a.patch.x = H.spot[0]; a.patch.y = H.spot[1]; }
  }
  return a.patch;
}

// walk to the beast's own patch of the pasture, at grazing pace. There — it nibbles; unreachable — the
// patch is given up (a new one, at most three tries for this pasture: then it grazes where it stands)
export function toPatch(w, a, H, t, pace, approach) {
  const p = patchOf(w, a, H);
  if (!p) return;
  if (t.there && Math.hypot(p.x - a.x, p.y - a.y) <= 1.5) return;
  const r = approach(w, a, p.x, p.y, pace);
  t.there = r === true;
  if (r === null) p.lost = true;
}

// when a beast of a herd bolts from the herd's alarm: [bolt?, why]. Its own nerve, its own distance,
// and the others: a calm one still runs once the herd has been running a while
export function bolts(w, a, al, sp) {
  const nv = nerveOf(w, a);
  let d = Infinity; for (const o of al.threats) d = Math.min(d, dist(a, o));
  const reach = sp.flee.radius * 1.6 / nv;   // a skittish one bolts from farther
  if (d <= reach) return true;
  return w.tick - al.start >= HERD.relay * nv;   // the herd is running: follow
}
