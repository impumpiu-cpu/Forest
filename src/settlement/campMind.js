// The camp's overmind (docs/CAMPAIGN.md «Обустройство стоянки»; numbers: data/camp.js CAMP_WORKS.mind, .scout): what the
// company does as one, not each for itself. The chores have their crews (settlement/works.js: `hands` each, a free one
// taken before joining one begun); the overmind sends one to walk round the camp and see what lies about — the caches
// are found so, by passing near (settlement/works.js spotCaches), not known beforehand: the overmind does not know of
// them either, it only sends someone to look.
//   w.campaign.mind = {scout: {who, route: [[x, y]…], k, until} | null, scouted, tries}
import {CAMP_WORKS} from '../data/camp.js';
import {log} from '../core/log.js';
import {atHour, nightness} from '../core/time.js';
import {hpShare} from '../agents/agent.js';
import {raidAlarm} from './query.js';
import {searchable, inSetup} from './works.js';
import {FAR} from '../nav/navigation.js';
import {BY_CODE} from '../data/terrain.js';
import {g} from '../core/util.js';

const SC = () => CAMP_WORKS.scout, MID = 1 / 2;   // (MID: the middle of a cell)
export const mindOf = w => (w.campaign ? (w.campaign.mind ||= {scout: null, scouted: 0, tries: 0}) : null);

// a tick of the camp: the scout sent, watched, called off
export function stepMind(w) {
  const M = mindOf(w); if (!M) return;
  const S = M.scout;
  if (S) {
    const a = w.campaign.people && [...w.campaign.people.values()].find(o => o.id === S.who);
    if (!a || a.dead || a.downed || w.tick > S.until || raidAlarm(w)) M.scout = null;   // (fell, lost the day, or the foe came)
    return;
  }
  if (M.scouted || M.tries >= SC().tries || !due(w)) return;
  const a = pickScout(w); if (!a) return;
  const route = ringRoute(w); if (route.length < 2) { M.tries = SC().tries; return; }
  M.tries++;
  M.scout = {who: a.id, route, k: 0, until: w.tick + atHour(w, SC().hours)};
  log(w, `${a.name || 'Кто-то из отряда'} ${g(a, 'пошёл', 'пошла')} разведать округу.`, 'build');
}
// a quiet day at the camp, the first chores done
const due = w => searchable(w) && !inSetup(w) && !raidAlarm(w) && nightness(w) < SC().dark;

// the one to send: one who is free (no task, or idling) before one who is busy; among them the guide, then the healthiest
// (ties: the lower id)
const free = a => !a.task || a.task.id === 'idle';
function pickScout(w) {
  const fit = [...w.campaign.people.values()].filter(a => !a.dead && !a.downed && !a.captive && !a.ledBy && hpShare(a) >= SC().hurt);
  fit.sort((p, q) => free(q) - free(p) || (q.place === 'guide') - (p.place === 'guide') || hpShare(q) - hpShare(p) || p.id - q.id);
  return fit[0] || null;
}
// the ring: `points` places about `radius` cells from the fire, each the furthest one can walk to on its bearing, then
// the fire again
function ringRoute(w) {
  const {radius, inner, points} = SC(), cx = w.camp.x + MID, cy = w.camp.y + MID, reach = w.nav?.get('camp'), out = [];
  for (let k = 0; k < points; k++) {
    const ang = k * 2 * Math.PI / points;
    for (let r = radius; r >= inner; r--) {
      const x = Math.floor(cx + Math.cos(ang) * r), y = Math.floor(cy + Math.sin(ang) * r);
      if (x < 1 || y < 1 || x >= w.w - 1 || y >= w.h - 1) continue;
      const i = y * w.w + x;
      if (!BY_CODE[w.grid.terr[i]].walkable || (reach && !(reach[i] < FAR))) continue;
      out.push([x + MID, y + MID]); break;
    }
  }
  if (out.length) out.push([cx, cy]);
  return out;
}

// the scout's walk, a step at a time (agents/behaviours/campwork.js): → 'walk' | 'done'
export function scoutStep(w, a, approach, reach, pace) {
  const M = mindOf(w), S = M?.scout;
  if (!S || S.who !== a.id) return 'done';
  const [x, y] = S.route[S.k];
  if (Math.hypot(x - a.x, y - a.y) <= reach || approach(w, a, x, y, pace) === null) S.k++;   // (a place one cannot reach is passed by)
  if (S.k < S.route.length) return 'walk';
  M.scout = null; M.scouted++;
  const seen = (w.works || []).filter(x => x.key === 'cache' && x.spotted?.by === a.id).length;
  log(w, `${a.name || 'Разведчик'} ${g(a, 'вернулся', 'вернулась')} из разведки${seen ? `: ${seen === 1 ? 'заметил тайник' : `заметил тайников: ${seen}`}`.replace('заметил', g(a, 'заметил', 'заметила')) : ' — вокруг ничего'}.`, 'build');
  return 'done';
}
// the scout called away (a meal, a fight): the walk is off; the overmind may send again (tries)
export function scoutLeft(w, a) { const M = mindOf(w); if (M?.scout?.who === a.id) M.scout = null; }
