// Living side by side. Colonists of different races and world views think of each other what
// data/relations.js says, and it shows:
//   — once a day everyone notes whom they cannot stand and whose company they enjoy (thoughts);
//   — every couple of hours two colonists who dislike each other and happen to be close may quarrel:
//     both lose some mood, and the grudge between them grows (agent.grudge[id]);
//   — grudges fade slowly, so a peaceful week mends a lot; good memories fade slower still;
//   — with danger near (a raid, a fire, a beast close by) a quarrel is put off;
//   — joint actions (settlement/together.js) add to the personal history: escorts, a wound dressed,
//     working side by side, a raid fought together.
// Settlers: who comes next is drawn here too — races the colony's folk get on with are likelier.
import {SPECIES} from '../data/species.js';
import {opinion, kinship, OPINION} from '../data/relations.js';
import {VALUES} from '../data/values.js';
import {colonists, raidAlarm} from './query.js';
import {workTogether, afterRaid, threatTo} from './together.js';
import {think} from '../agents/mind.js';
import {log} from '../core/log.js';
import {esc, clamp, weighted} from '../core/util.js';
import {DAY, HOUR} from '../core/time.js';
import {REL} from '../data/colony.js';

export {REL};   // (data/colony.js)
// ── settlers: who comes next
export function settlerSpecies(w, rng) {
  const col = colonists(w);
  const opts = SPECIES.filter(sp => sp.settle > 0).map(sp => {
    if (!col.length || sp.id === 'human') return [sp.id, sp.settle];
    const into = col.reduce((s, a) => s + kinship(sp.id, a.species), 0) / col.length;
    const from = col.reduce((s, a) => s + kinship(a.species, sp.id), 0) / col.length;
    if (Math.min(into, from) < REL.settlerFloor) return [sp.id, 0];
    return [sp.id, sp.settle * Math.exp(0.5 * (into + from) / 2)];
  });
  return weighted(rng, opts) || 'human';
}

// ── everyday friction
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < REL.quarrelNear;
const busy = a => a.sleeping || a.downed || ['fight', 'muster', 'reserve', 'treat', 'runHome', 'flee', 'downed'].includes(a.task?.id);

// what the two fall out over: the biggest reason between them
function reason(a, b) {
  const kin = kinship(a.species, b.species);
  if (kin <= -2) return `${SPECIES.get(a.species).plural} и ${SPECIES.get(b.species).plural} — давние враги`;
  for (const x of a.values || []) for (const y of b.values || []) if (VALUES.get(x).clash.includes(y)) return `одному дороже всего ${VALUES.get(x).label}, другому ${VALUES.get(y).label}`;
  if (a.align && b.align && Math.abs(a.align.mercy - b.align.mercy) >= OPINION.mercyGap) return 'не сошлись в том, как обходиться с пленными и слабыми';
  return 'старые обиды';
}

function quarrels(w) {
  const col = colonists(w).filter(a => !busy(a));
  for (let i = 0; i < col.length; i++) for (let j = i + 1; j < col.length; j++) {
    const a = col[i], b = col[j];
    if (!near(a, b)) continue;
    const mutual = opinion(a, b) + opinion(b, a);
    const p = clamp((REL.dislike * 2 - mutual) * REL.quarrelBase, 0, REL.quarrelMax);
    if (p <= 0 || w.rngs.social() >= p) continue;
    // not now: raiders on the way, the camp on fire, a beast close by
    if (raidAlarm(w) || w.stats.fireNearCamp > 0 || threatTo(w, a, 12) || threatTo(w, b, 12)) { if (w.behave) w.behave.social.calm++; continue; }
    for (const [x, y] of [[a, b], [b, a]]) { (x.grudge ||= {})[y.id] = (x.grudge[y.id] || 0) - REL.grudge; think(w, x, 'quarrel', {name: y.name}); }
    w.chronicle.quarrels = (w.chronicle.quarrels || 0) + 1;
    log(w, `Склока: <b>${esc(a.name)}</b> и <b>${esc(b.name)}</b> сцепились — ${reason(a, b)}.`, 'people');
    return;   // one quarrel at a time is enough for the camp
  }
}

function daily(w) {
  const col = colonists(w);
  for (const a of col) {
    if (a.grudge) for (const id of Object.keys(a.grudge)) { a.grudge[id] *= a.grudge[id] > 0 ? REL.fadeGood : REL.fade; if (Math.abs(a.grudge[id]) < 0.05 || !col.some(o => o.id === +id)) delete a.grudge[id]; }
    let worst = null, wv = Infinity, best = null, bv = -Infinity;
    for (const b of col) {
      if (b === a) continue;
      const v = opinion(a, b);
      if (v < wv) { wv = v; worst = b; }
      if (v > bv) { bv = v; best = b; }
    }
    if (worst && wv <= REL.dislike) think(w, a, 'dislikesNeighbour', {name: worst.name, mood: clamp(wv * 0.04, -0.25, -0.06)});
    if (best && bv >= REL.friend) think(w, a, 'goodCompany', {name: best.name});
  }
}

export function stepRelations(w) {
  if (w.tick % DAY === Math.floor(DAY * 0.55)) daily(w);
  if (w.tick % REL.quarrelEvery === 37) quarrels(w);
  if (w.tick % HOUR === 11) workTogether(w);
  // a raid over: those who fought it side by side come out of it closer
  const alarm = raidAlarm(w);
  if (alarm && w.raidSince == null) w.raidSince = w.tick;
  else if (!alarm && w.raidSince != null) { afterRaid(w, w.raidSince); w.raidSince = null; }
}

// for the card: the personal part of what a thinks of b (what happened between them)
export const history = (a, b) => a.grudge?.[b.id] || 0;

// for the card: everyone this colonist feels strongly about, worst first
export function feelings(w, a) {
  return colonists(w).filter(b => b !== a).map(b => [b, opinion(a, b)]).sort((x, y) => x[1] - y[1]);
}
