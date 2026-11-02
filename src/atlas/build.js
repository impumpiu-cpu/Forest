// How a town of the world map raises its buildings (docs/WORLD.md «Стройка»; the numbers: data/townBuildings.js
// TOWN_MONEY.build). From the branch Elves, on this branch's money (atlas/treasury.js planBuild, doBuild).
//
// A town builds one thing at a time — its project. Its council picks what it needs most (atlas/towns.js chooseBuilding:
// the town's needs, its people's taste, its realm's council's lean, atlas/mind.js) among what it can pay for: the materials
// from its store and the linked towns, the people's work, paid from the realm's grant first (planBuild). Paid, the work
// begins: its builders — `crew` of the town's people — put in work-days each season, and when the building's `days` are
// done (by its step, × (1 + jobs / jobsPer) × (1 + house / housePer)) it stands. Then the council picks the next. A
// project the town can no longer build (its realm lost what it requires) is dropped, the work done kept in `t.works`: if
// the town comes back to it, it goes on from there and is not paid twice. So a town builds as fast as its hands let it:
// a big, busy town many things a year, a hamlet one in a few.
import {TOWN_BUILDINGS, TOWN_MONEY, TOWN_SLOTS, slotKind} from '../data/townBuildings.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {SEASON_DAYS, SEASONS_PER_YEAR} from '../data/atlas.js';
import {townFx, chooseBuilding, canBuild, slotsUsed, slotsOf} from './towns.js';
import {realmTaste} from './realms.js';
import {roadAccess} from './roads.js';
import {planBuild, doBuild} from './treasury.js';
import {placeWork, raiseBuilding} from './peoples.js';
import {leanOf, note} from './mind.js';
import {vectorOf} from '../data/mind.js';

const B = () => TOWN_MONEY.build;
// the work-days a building takes
export const buildDays = b => { const P = B(); return P.days[Math.min(P.days.length - 1, b.tier || 0)] * (1 + (b.jobs || 0) / P.jobsPer) * (1 + (b.house || 0) / P.housePer); };
// the work-days a town's builders put in a season
export const crewDays = t => Math.max(0, t.pop) * B().crew * SEASON_DAYS;
// the project of a town: {b, done, days} or null
export function projectOf(t) {
  const id = t.project, b = id && TOWN_BUILDINGS.has(id) ? TOWN_BUILDINGS.get(id) : null;
  return b && {b, done: t.works?.[id]?.done || 0, days: buildDays(b)};
}

// the council picks the next project: the best the town wants and can pay for (a few tries, what it cannot pay passed
// over); a building it began before and left goes on unpaid. → the building, or null
function pickProject(a, t, rnd) {
  const pe = a.peoples?.find(p => p.id === t.people);
  if (!pe || !t.wants) return null;
  const ctx = {...t.wants, road: roadAccess(a, t.i), econ: t.econ, skip: new Set(), lean: leanOf(a, t)};
  t.peak = Math.max(t.peak || 0, t.pop);   // the most it ever had: what it may build by its people (atlas/towns.js unitsMax) holds after
  for (let k = 0; k < B().tries; k++) {
    const b = chooseBuilding(a, t, {...pe.P, taste: realmTaste(a, t.realm)}, townFx(t), ctx, rnd);
    if (!b) return null;
    if (t.works?.[b.id]?.paid) return b;   // begun before: paid already
    const plan = planBuild(a, t, b);
    if (!plan) { ctx.skip.add(b.id); continue; }   // (an outlying work takes its cell when it stands: chooseBuilding saw one free)
    doBuild(plan);   // paid: the materials to their makers, the work to the people (atlas/treasury.js)
    note(a, t.realm, vectorOf(b), plan.cost);   // the realm's course: what it builds, along the building's vector (atlas/mind.js)
    (t.works ||= {})[b.id] = {done: 0, paid: true};
    return b;
  }
  return null;
}

// a town at its slots (data/townBuildings.js TOWN_SLOTS) razes a work of its own in it that has worked below `raze` for `years`
// years running — the worst of them, one a season — to make room (its seasons below are counted in t.idle) → its id, or null
export function razeIdle(t) {
  const S = TOWN_SLOTS, idle = t.idle ||= {};
  for (const id of Object.keys(idle)) if (!t.built.includes(id)) delete idle[id];
  for (const id of new Set(t.built)) { if (slotKind(TOWN_BUILDINGS.get(id)) !== 'town') continue; if ((t.work?.[id] ?? 1) < S.raze) idle[id] = (idle[id] || 0) + 1; else delete idle[id]; }
  if (slotsUsed(t).town < slotsOf(t).town) return null;
  const worst = Object.entries(idle).filter(([, n]) => n >= S.years * SEASONS_PER_YEAR).sort((p, q) => (t.work?.[p[0]] ?? 1) - (t.work?.[q[0]] ?? 1) || q[1] - p[1] || (p[0] < q[0] ? -1 : 1))[0];
  if (!worst) return null;
  t.built.splice(t.built.indexOf(worst[0]), 1); delete idle[worst[0]];
  return worst[0];
}

// a town at its slots whose council finds nothing to build razes its worst work of its own below TOWN_SLOTS.idle (one a
// season; a work no worse than that stays) → its id, or null
export function razeWorst(t) {
  const S = TOWN_SLOTS;
  if (slotsUsed(t).town < slotsOf(t).town) return null;
  const worst = [...new Set(t.built)].filter(id => slotKind(TOWN_BUILDINGS.get(id)) === 'town' && (t.work?.[id] ?? 1) < S.idle).sort((p, q) => (t.work?.[p] ?? 1) - (t.work?.[q] ?? 1) || (p < q ? -1 : 1))[0];
  if (!worst) return null;
  t.built.splice(t.built.indexOf(worst), 1); if (t.idle) delete t.idle[worst];
  return worst;
}

// a season of building in every town: the project goes on, a finished one stands, the council picks the next (after the
// towns' economies and the growth: atlas/history.js)
export function stepBuilds(a, rnd, say) {
  for (const t of a.towns || []) {
    if (!t.alive || !t.wants || !WORLD_PEOPLES.has(t.people)) continue;
    razeIdle(t);
    let days = crewDays(t);
    for (let guard = 0; guard < 4 && days > 1e-9; guard++) {   // a big crew may finish a small work and begin the next in a season
      let P = projectOf(t);
      if (P && !(P.done > 0 || canBuild(a, t, P.b))) { t.project = null; P = null; }   // (it may not any more: its realm lost what it needed)
      if (!P) {
        const b = pickProject(a, t, rnd);
        if (!b) { razeWorst(t); break; }   // nothing to build: a full town makes room
        t.project = b.id; P = projectOf(t);
      }
      const W = t.works[P.b.id], put = Math.min(days, P.days - W.done);
      W.done += put; days -= put;
      if (W.done < P.days - 1e-9) break;
      t.project = null;
      if (!placeWork(a, t, P.b, rnd)) break;   // its cell was taken meanwhile: the work waits, paid, for the town to come back to it
      delete t.works[P.b.id];
      raiseBuilding(a, t, P.b, say);
      if (t.econ && P.b.jobs) t.econ.freeHands -= P.b.jobs;   // its hands are taken: the next choice knows it
    }
  }
}
