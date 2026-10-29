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
//
// Settlers are raised the same way (data/peoples.js `settlers`, as a settler in Civilization): a full town that has a
// free spot within its reach wants them (`want` × how full it is); they take `days` of work and `goods` from the realm's
// stocks, and when they are ready `pop` of the town's people leave with the goods and found a town of the realm there
// (atlas/peoples.js foundFrom). That is the only way a people founds a town after it has come into the world.
import {BUILD} from '../data/macro.js';
import {SEASON_DAYS} from '../data/atlas.js';
import {TOWN_BUILDINGS, goodPrice} from '../data/townBuildings.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {townFx, canBuild, chooseBuilding, room} from './towns.js';
import {realmTaste} from './realms.js';
import {roadAccess} from './roads.js';
import {raiseBuilding, settleSpot, foundFrom} from './peoples.js';

const step = b => Math.min(BUILD.days.length - 1, b.tier || 0);
// the work-days a building takes, and the materials it is raised of
export const buildDays = b => BUILD.days[step(b)] * (1 + (b.jobs || 0) / BUILD.jobsPer) * (1 + (b.house || 0) / BUILD.housePer);
export const buildMaterials = b => Object.fromEntries(Object.entries(b.repair || {}).map(([g, v]) => [g, v * BUILD.matDays]).filter(([, v]) => v > 0));

// whether a town's realm makes a good at all, or holds some
function realmHas(a, t, g) {
  for (const o of a.towns) if (o.alive && (o === t || (t.realm != null && o.realm === t.realm)) && o.econ && ((o.econ.prod?.[g] || 0) > 0 || (o.econ.stock?.[g] || 0) > 0)) return true;
  return false;
}

export const SETTLERS = 'settlers';
// what a project is: a building of the catalogue, or the town's settlers — {id, name, days, mat()}
export function projectOf(t, id = t.project) {
  if (id === SETTLERS) {
    const S = WORLD_PEOPLES.get(t.people).settlers;
    return {id, name: 'поселенцы', days: S.days, mat: () => ({...S.goods})};
  }
  const b = TOWN_BUILDINGS.has(id) ? TOWN_BUILDINGS.get(id) : null;
  return b && {id, name: b.name, b, days: buildDays(b), mat: () => buildMaterials(b)};
}

// how much a town wants settlers now: a full town with a free spot within its reach and people to spare
function settlersWant(a, t) {
  const S = WORLD_PEOPLES.get(t.people).settlers;
  if (!S || t.pop < S.from) return 0;
  const target = Math.min(t.wants.feeds, room(townFx(t))), full = Math.max(0, Math.min(1, (t.pop / Math.max(1, target) - 0.6) / 0.3));
  if (full <= 0) return 0;
  if (t.spot?.year !== a.hist.year) t.spot = {year: a.hist.year, i: settleSpot(a, t)};   // looked for once a year
  return t.spot.i >= 0 ? S.want * full : 0;
}

// the council: keep the project under way or take up another
function council(a, t, rnd) {
  const pe = a.peoples.find(p => p.id === t.people);
  if (!pe) return;
  const cur = t.project && t.project !== SETTLERS && TOWN_BUILDINGS.has(t.project) ? TOWN_BUILDINGS.get(t.project) : null;
  const still = cur && canBuild(a, t, cur);
  if (cur && !still) { delete t.works?.[cur.id]; t.project = null; }
  const sw = settlersWant(a, t);
  if (t.project === SETTLERS && sw <= 0) { delete t.works?.[SETTLERS]; t.project = null; }
  const {b, v, cv} = chooseBuilding(a, t, {...pe.P, taste: realmTaste(a, t.realm)}, townFx(t), {feeds: t.wants.feeds, threat: t.wants.threat, road: roadAccess(a, t.i)}, rnd, still ? cur : null);
  const best = sw > (b ? v : 0) ? {id: SETTLERS, v: sw} : b ? {id: b.id, v} : null;
  if (!best) return;
  const curV = t.project === SETTLERS ? sw : cv;
  if (!t.project || (best.id !== t.project && best.v > curV * (1 + BUILD.switch))) t.project = best.id;
}

// a season of work on the project under way; finished, the building stands or the settlers go
function work(a, t, rnd, say) {
  const P = projectOf(t);
  if (!P) { t.project = null; return; }
  const w = (t.works ||= {})[P.id] ||= {done: 0, mat: P.mat(), stall: 0};
  // the materials the realm's household met this season (asked of it as orders: atlas/economy.js); a town that has not
  // counted its household (an old save) has them
  let moved = false;
  for (const [g, v] of Object.entries(w.mat)) {
    if (v <= 1e-6) continue;
    const got = t.econ ? v * Math.min(1, t.econ.met?.[g] ?? 0) : v;
    if (got > 1e-6) { w.mat[g] = v - got; moved = true; }
  }
  let labour = Math.max(1, t.pop * BUILD.crew) * SEASON_DAYS;
  const use = Math.min(labour, P.days - w.done);
  w.done += use; labour -= use;
  // what the realm neither makes nor holds, what has not come for two seasons, and the rest once the work itself is
  // done — the builders, idle else, gather by hand
  const left = Object.entries(w.mat).filter(([, v]) => v > 1e-6), idle = w.done >= P.days - 1e-6;
  w.stall = left.length && !moved ? w.stall + 1 : 0;
  for (const [g, v] of left) {
    if (labour <= 0) break;
    if (!idle && w.stall < 2 && realmHas(a, t, g)) continue;
    const per = BUILD.hand * (goodPrice(g) || 1), got = Math.min(v, labour / per);
    w.mat[g] = v - got; labour -= got * per;
  }
  if (w.done < P.days - 1e-6 || Object.values(w.mat).some(v => v > 1e-6)) return;
  if (P.id === SETTLERS) {
    // the settlers go with the goods raised for them; a town that has lost its people meanwhile waits for them
    const S = WORLD_PEOPLES.get(t.people).settlers;
    if (t.pop < S.pop + 10) return;
    const made = foundFrom(a, t, rnd, say, S.goods);
    delete t.works[P.id]; t.project = null; t.spot = null;
    if (!made) t.econ && Object.entries(S.goods).forEach(([g, v]) => { t.econ.stock[g] = (t.econ.stock[g] || 0) + v; });   // no spot left: the goods go back
    return;
  }
  delete t.works[P.id]; t.project = null;
  raiseBuilding(a, t, P.b, rnd, say);
}
// a season of building in every living town (after the households: atlas/history.js)
export function stepBuilds(a, rnd, say) {
  for (const t of a.towns || []) {
    if (!t.alive || !t.wants) continue;
    if (t.project) work(a, t, rnd, say);   // the materials met this season went to the building asked for
    council(a, t, rnd);
  }
}
