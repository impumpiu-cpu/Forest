// The people of the towns (docs/WORLD.md «Демография»; each people's numbers: data/peoples.js — born, content, migrate,
// settlers). People are a good like gold or timber: they are born in the towns, move between them, march to war, are
// carried off and die — nothing makes them out of nothing. Only the founding bands of a people's arrival (and the hand's)
// come into the world from outside it.
//
//   growth (a year, in spring): + born × contentment × people × (1 − people / target), target = min(what the land feeds,
//     the room the houses give); a town over its target shrinks the same way. (The household's food — atlas/economy.js
//     E.fed — does not count yet: a young hamlet gets 20–40% of its ready food from it while its land feeds it well;
//     hunger joins when the two agree);
//   contentment 0…1 = base + Σ weight × the realm's attribute (data/kingdom.js: culture, economy, loyalty, stability) —
//     each people is pleased by its own things;
//   migration (each season): people move from the towns they like less to those they like more — fame (the towns'
//     prestige) and food draw them, free room lets them in; a town over its room sends the surplus away. They move within
//     their realm, and to a near town of a realm that trades with theirs (TOWN_LIFE.abroad as dear) of their own people
//     or of a people that welcomes them (data/peoples.js `welcome`);
//   a town left with fewer than TOWN_LIFE.abandon people is left: they go to the nearest town of the realm.
import {WORLD_PEOPLES, TOWN_LIFE as TL} from '../data/peoples.js';
import {townFx, room, townLabel} from './towns.js';
import {razeSites} from './sites.js';
import {seatFallen} from './realms.js';
import {trades} from './diplomacy.js';
import {scaleOf} from './tectonics.js';
import {DIPLOMACY} from '../data/diplomacy.js';

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const realmOf = (a, t) => (t.realm != null ? a.realms?.find(r => r.id === t.realm) : null);

// how content a town's people are, 0 … 1: their own measure of their realm, and their food
export function contentOf(a, t) {
  const C = WORLD_PEOPLES.get(t.people).content || {base: 1};
  const st = realmOf(a, t)?.kingdom?.stats || {};
  let v = C.base ?? 0;
  for (const [k, w] of Object.entries(C)) if (k !== 'base') v += w * (st[k] || 0);
  return clamp01(v);
}
export const fedOf = t => t.econ?.fed ?? 1;

// a year of a town's people
export function growTown(a, t, target) {
  const P = WORLD_PEOPLES.get(t.people), goal = Math.max(TL.minTarget, target);
  const born = P.born * contentOf(a, t) * t.pop * (1 - t.pop / goal);
  t.pop = Math.max(0, t.pop + born);
  t.content = Math.round(contentOf(a, t) * 100) / 100;
}

// how much people like a town: its fame and its food
const pull = t => (1 + Math.max(0, townFx(t).prestige)) * fedOf(t);
// whether folk of a town may move to another: the same realm; or another realm that trades with theirs, near enough,
// of their own people or of a people that welcomes them (data/peoples.js `welcome`)
export function mayMove(a, s, d) {
  if (s.realm === d.realm) return true;
  if (s.realm == null || d.realm == null || !trades(a, s.realm, d.realm)) return false;
  if (d.people !== s.people && (!(WORLD_PEOPLES.get(d.people).welcome || []).includes(s.people) || (d.folk?.[s.people] || 0) >= DIPLOMACY.mingleMax)) return false;   // a town takes newcomers up to the share of folk it keeps
  return Math.hypot(d.x - s.x, d.y - s.y) <= TL.moveReach * WORLD_PEOPLES.get(s.people).spacing * scaleOf(a);
}

// a season of moving: people go where they like it better, as far as there is room — a town of another realm counts
// TOWN_LIFE.abroad as much (home is home); folk of another people settle as the town's folk (t.folk)
export function migrate(a) {
  const live = (a.towns || []).filter(t => t.alive);
  if (live.length < 2) return;
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
    let go = s.over * 0.5 + rate * s.t.pop * (1 - s.A / best);
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
}

// the towns left with too few people: they go to the nearest town of their realm (or of their people), the town is a ruin
export function abandonEmpty(a, rnd, say) {
  for (const t of a.towns || []) {
    if (!t.alive || t.pop >= TL.abandon) continue;
    let best = null, bd = Infinity;
    for (const o of a.towns) if (o !== t && o.alive && (t.realm != null ? o.realm === t.realm : o.people === t.people)) { const d = Math.hypot(o.x - t.x, o.y - t.y); if (d < bd) { bd = d; best = o; } }
    if (best) best.pop += t.pop;
    t.pop = 0; t.alive = false; t.died = a.hist.year;
    razeSites(a, t, a.hist.year);
    (a.ruins ||= []).push({i: t.i, x: t.x, y: t.y, name: t.name, people: t.people, realm: t.realm, by: null, year: a.hist.year, how: 'опустел'});
    say(`Последние жители покинули ${townLabel(t, 1)} ${t.name}${best ? ` и ушли в ${townLabel(best, 1)} ${best.name}` : ''}.`);
    if (t.capital) seatFallen(a, t, rnd, say);
  }
}
