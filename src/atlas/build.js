// How a town of the world map raises its buildings (data/macro.js BUILD, docs/WORLD.md «Стройка»).
//
// A town builds one thing at a time. Its council picks what it needs most (atlas/towns.js chooseBuilding) and the town
// raises it: its builders (BUILD.crew of the people) put in work-days, and the materials — the building's own upkeep
// (`repair`) for BUILD.matDays: logs, boards, stone, hides — are asked of the realm's household as its people's needs are
// (atlas/economy.js ordersOf: the share met, `E.met`, comes to the building). What the realm neither has nor makes the
// builders gather by hand, BUILD.hand work-days for each gold of its worth. Every season — a month of the world — the
// council looks again and takes up another building when it is wanted BUILD.switch more; the work done on the old one is
// kept (`t.works`) and goes on if the council comes back to it. So a town builds as fast as its hands and its realm's
// stocks let it: a rich, busy town many things a year, a poor hamlet one in a few.
import {BUILD} from '../data/macro.js';
import {SEASON_DAYS} from '../data/atlas.js';
import {TOWN_BUILDINGS, goodPrice} from '../data/townBuildings.js';
import {townFx, canBuild, chooseBuilding} from './towns.js';
import {realmTaste} from './realms.js';
import {roadAccess} from './roads.js';
import {raiseBuilding} from './peoples.js';

const step = b => Math.min(BUILD.days.length - 1, b.tier || 0);
// the work-days a building takes, and the materials it is raised of
export const buildDays = b => BUILD.days[step(b)] * (1 + (b.jobs || 0) / BUILD.jobsPer) * (1 + (b.house || 0) / BUILD.housePer);
export const buildMaterials = b => Object.fromEntries(Object.entries(b.repair || {}).map(([g, v]) => [g, v * BUILD.matDays]).filter(([, v]) => v > 0));

// whether a town's realm makes a good at all, or holds some
function realmHas(a, t, g) {
  for (const o of a.towns) if (o.alive && (o === t || (t.realm != null && o.realm === t.realm)) && o.econ && ((o.econ.prod?.[g] || 0) > 0 || (o.econ.stock?.[g] || 0) > 0)) return true;
  return false;
}

// the council: keep the building under way or take up another
function council(a, t, rnd) {
  const pe = a.peoples.find(p => p.id === t.people);
  if (!pe) return;
  const cur = t.project && TOWN_BUILDINGS.has(t.project) ? TOWN_BUILDINGS.get(t.project) : null;
  const still = cur && canBuild(a, t, cur);
  if (cur && !still) { delete t.works?.[cur.id]; t.project = null; }
  const {b, v, cv} = chooseBuilding(a, t, {...pe.P, taste: realmTaste(a, t.realm)}, townFx(t), {feeds: t.wants.feeds, threat: t.wants.threat, road: roadAccess(a, t.i)}, rnd, still ? cur : null);
  if (!b) return;
  if (!t.project || (b.id !== t.project && v > cv * (1 + BUILD.switch))) t.project = b.id;
}

// a season of work on the building under way; finished, it stands
function work(a, t, rnd, say) {
  const b = TOWN_BUILDINGS.get(t.project);
  const w = (t.works ||= {})[b.id] ||= {done: 0, mat: buildMaterials(b), stall: 0};
  // the materials the realm's household met this season (asked of it as orders: atlas/economy.js); a town that has not
  // counted its household (an old save) has them
  let moved = false;
  for (const [g, v] of Object.entries(w.mat)) {
    if (v <= 1e-6) continue;
    const got = t.econ ? v * Math.min(1, t.econ.met?.[g] ?? 0) : v;
    if (got > 1e-6) { w.mat[g] = v - got; moved = true; }
  }
  let labour = Math.max(1, t.pop * BUILD.crew) * SEASON_DAYS;
  const use = Math.min(labour, buildDays(b) - w.done);
  w.done += use; labour -= use;
  // what the realm neither makes nor holds, what has not come for two seasons, and the rest once the work itself is
  // done — the builders, idle else, gather by hand
  const left = Object.entries(w.mat).filter(([, v]) => v > 1e-6), idle = w.done >= buildDays(b) - 1e-6;
  w.stall = left.length && !moved ? w.stall + 1 : 0;
  for (const [g, v] of left) {
    if (labour <= 0) break;
    if (!idle && w.stall < 2 && realmHas(a, t, g)) continue;
    const per = BUILD.hand * (goodPrice(g) || 1), got = Math.min(v, labour / per);
    w.mat[g] = v - got; labour -= got * per;
  }
  if (w.done < buildDays(b) - 1e-6 || Object.values(w.mat).some(v => v > 1e-6)) return;
  delete t.works[b.id]; t.project = null;
  raiseBuilding(a, t, b, rnd, say);
}

// a season of building in every living town (after the households: atlas/history.js)
export function stepBuilds(a, rnd, say) {
  for (const t of a.towns || []) {
    if (!t.alive || !t.wants) continue;
    if (t.project) work(a, t, rnd, say);   // the materials met this season went to the building asked for
    council(a, t, rnd);
  }
}
