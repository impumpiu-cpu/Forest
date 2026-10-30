// The people of the towns (docs/WORLD.md «Демография»; each people's numbers: data/peoples.js — migrate, welcome, settlers;
// the world's: TOWN_LIFE). People are a resource, like gold or timber: they are born of the towns' people, move between
// towns, march to war, are carried off and die — nothing makes them out of nothing. Only the founding bands of a people's
// arrival (and those the hand lands) come into the world from outside it.
//
//   growth (a year, in spring, atlas/peoples.js): born of the town's people, as many as its land feeds and its houses
//     hold — a town over that shrinks the same way; no roll, no floor;
//   settlers (a year, after the growth, atlas/peoples.js sendSettlers): a full town sends `settlers.pop` of its people to
//     found a town of its realm on a free spot within its reach; they carry what it can spare of `settlers.goods`;
//   migration (each season, here): people move from the towns they like less to those they like more — fame (the town's
//     prestige) and how well their needs are met (atlas/treasury.js t.needs) draw them, free room lets them in; a town
//     over its room sends the surplus away. They move within their realm, and to a near town of a realm that trades with
//     theirs (TOWN_LIFE.abroad as dear) of their own people or of a people that welcomes them (data/peoples.js `welcome`);
//   a town left with fewer than TOWN_LIFE.abandon people is left: they go to the nearest town of their realm;
//   the captives of a lair gone go home (freeCaptives); an army whose town fell comes back to the nearest town of its realm
//   (atlas/army.js); the crowned seat draws people from its realm's towns (drawTo), it does not make them.
import {WORLD_PEOPLES, TOWN_LIFE as TL} from '../data/peoples.js';
import {townFx, room, townLabel} from './towns.js';
import {razeSites} from './sites.js';
import {seatFallen} from './realms.js';
import {trades} from './diplomacy.js';
import {scaleOf} from './tectonics.js';
import {DIPLOMACY} from '../data/diplomacy.js';

// how much people like a town: its fame and how well its people live (a town not counted yet: as well as can be)
const pull = t => (1 + Math.max(0, townFx(t).prestige)) * (t.needs?.basic ?? 1);

// whether folk of a town may move to another: the same realm; or another realm that trades with theirs, near enough,
// of their own people or of a people that welcomes them (data/peoples.js `welcome`), up to the folk the town keeps
export function mayMove(a, s, d) {
  if (s.realm === d.realm) return true;
  if (s.realm == null || d.realm == null || !trades(a, s.realm, d.realm)) return false;
  if (d.people !== s.people && (!(WORLD_PEOPLES.get(d.people).welcome || []).includes(s.people) || (d.folk?.[s.people] || 0) >= DIPLOMACY.mingleMax)) return false;
  return Math.hypot(d.x - s.x, d.y - s.y) <= TL.moveReach * WORLD_PEOPLES.get(s.people).spacing * scaleOf(a);
}

// a season of moving: people go where they like it better, as far as there is room — a town of another realm counts
// TOWN_LIFE.abroad as much (home is home); folk of another people settle as the town's folk (t.folk). → people moved
export function migrate(a) {
  const live = (a.towns || []).filter(t => t.alive);
  if (live.length < 2) return 0;
  const X = new Map(live.map(t => { const rm = room(townFx(t)); return [t, {t, A: pull(t), free: Math.max(0, rm - t.pop), over: Math.max(0, t.pop - rm)}]; }));
  let moved = 0, abroad = 0;
  for (const s of X.values()) {
    const rate = WORLD_PEOPLES.get(s.t.people).migrate || 0;
    if (!rate && !s.over) continue;
    const to = [];
    for (const d of X.values()) {
      if (d === s || d.free <= 1 || !mayMove(a, s.t, d.t)) continue;
      const A = d.A * (d.t.realm === s.t.realm ? 1 : TL.abroad);
      if (A > s.A) to.push([d, A]);
    }
    if (!to.length) continue;
    const best = Math.max(...to.map(x => x[1]));
    let go = s.over * TL.overflow + rate * s.t.pop * (1 - s.A / best);
    go = Math.min(go, Math.max(0, s.t.pop - TL.minTarget));
    if (go <= 0.5) continue;
    const W = to.reduce((sum, [d, A]) => sum + A * d.free, 0);
    let left = go;
    for (const [d, A] of to) {
      const n = Math.min(d.free, go * A * d.free / W);
      if (n <= 0) continue;
      let n2 = n;
      if (d.t.people !== s.t.people) {   // newcomers of another people: the town's folk of them grows, up to DIPLOMACY.mingleMax
        const f = d.t.folk ||= {}, had = (f[s.t.people] || 0) * d.t.pop;
        n2 = Math.max(0, Math.min(n, (DIPLOMACY.mingleMax * d.t.pop - had) / (1 - DIPLOMACY.mingleMax)));
        f[s.t.people] = Math.min(DIPLOMACY.mingleMax, (had + n2) / (d.t.pop + n2));
      }
      if (n2 <= 0) continue;
      if (d.t.realm !== s.t.realm) abroad += n2;
      d.t.pop += n2; d.free -= n2; left -= n2;
    }
    s.t.pop -= go - left; moved += go - left;
  }
  a.hist.moved = (a.hist.moved || 0) + moved;
  a.hist.movedAbroad = (a.hist.movedAbroad || 0) + abroad;
  return moved;
}

// the towns left with too few people: they go to the nearest town of their realm (or of their people), the town is a ruin
export function abandonEmpty(a, rnd, say) {
  for (const t of a.towns || []) {
    if (!t.alive || t.pop >= TL.abandon) continue;
    let best = null, bd = Infinity;
    for (const o of a.towns) if (o !== t && o.alive && (t.realm != null ? o.realm === t.realm : o.people === t.people)) { const d = Math.hypot(o.x - t.x, o.y - t.y); if (d < bd) { bd = d; best = o; } }
    if (best) best.pop += t.pop;
    else (a.hist.lost ||= {}).abandoned = (a.hist.lost?.abandoned || 0) + t.pop;   // the last of a people: they scatter
    t.pop = 0; t.alive = false; t.died = a.hist.year;
    razeSites(a, t, a.hist.year);
    (a.ruins ||= []).push({i: t.i, x: t.x, y: t.y, name: t.name, people: t.people, realm: t.realm, by: null, year: a.hist.year, how: 'опустел'});
    say(`Последние жители покинули ${townLabel(t, 1)} ${t.name}${best ? ` и ушли в ${townLabel(best, 1)} ${best.name}` : ''}.`);
    if (t.capital) seatFallen(a, t, rnd, say);
  }
}

// the captives of a lair gone (died, cleared, beaten by a rival or a calamity — any hand) go home: each to the nearest town
// of their people; a people with no town left scatters. Each season, before the moving (atlas/history.js) → people freed
export function freeCaptives(a) {
  let freed = 0;
  for (const l of a.lairs || []) {
    if (l.alive || !l.captives) continue;
    for (const [p, n] of Object.entries(l.captives)) {
      if (!(n > 0)) continue;
      let best = null, bd = Infinity;
      for (const t of a.towns || []) if (t.alive && t.people === p) { const d = Math.hypot(t.x - l.x, t.y - l.y); if (d < bd) { bd = d; best = t; } }
      if (best) { best.pop += n; freed += n; }
    }
    l.captives = null;
  }
  return freed;
}

// people drawn to a town from the other towns of its realm (the crowned seat, campaign/ending.js): `n` of them, from each
// by its people, never below TOWN_LIFE.minTarget in a town → how many came
export function drawTo(a, t, n) {
  const from = (a.towns || []).filter(o => o.alive && o !== t && t.realm != null && o.realm === t.realm);
  const spare = o => Math.max(0, o.pop - TL.minTarget), all = from.reduce((s, o) => s + spare(o), 0);
  if (all <= 0 || n <= 0) return 0;
  const take = Math.min(n, all);
  for (const o of from) o.pop -= take * spare(o) / all;
  t.pop += take;
  return take;
}
