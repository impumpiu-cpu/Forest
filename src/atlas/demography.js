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
//   migration (each season): the people of a realm move from the towns they like less to those they like more — fame
//     (the towns' prestige) and food draw them, free room lets them in; a town over its room sends the surplus away;
//   a town left with fewer than TOWN_LIFE.abandon people is left: they go to the nearest town of the realm.
import {WORLD_PEOPLES, TOWN_LIFE as TL} from '../data/peoples.js';
import {townFx, room, townLabel} from './towns.js';
import {razeSites} from './sites.js';
import {seatFallen} from './realms.js';

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

// how much the people of a realm like a town: its fame and its food (and room to live in it)
const pull = t => (1 + Math.max(0, townFx(t).prestige)) * fedOf(t);

// a season of moving: each realm's people go where they like it better, as far as there is room
export function migrate(a) {
  const byRealm = new Map();
  for (const t of a.towns || []) if (t.alive && t.realm != null) { if (!byRealm.has(t.realm)) byRealm.set(t.realm, []); byRealm.get(t.realm).push(t); }
  let moved = 0;
  for (const ts of byRealm.values()) {
    if (ts.length < 2) continue;
    const X = ts.map(t => { const rm = room(townFx(t)); return {t, A: pull(t), free: Math.max(0, rm - t.pop), over: Math.max(0, t.pop - rm)}; });
    for (const s of X) {
      const to = X.filter(d => d !== s && d.free > 1 && d.A > s.A);
      const best = Math.max(0, ...to.map(d => d.A));
      const rate = WORLD_PEOPLES.get(s.t.people).migrate || 0;
      let go = s.over * 0.5 + (best > 0 ? rate * s.t.pop * (1 - s.A / best) : 0);
      go = Math.min(go, Math.max(0, s.t.pop - TL.minTarget));
      if (go <= 0.5 || !to.length) continue;
      const W = to.reduce((sum, d) => sum + d.A * d.free, 0);
      let left = go;
      for (const d of to) {
        const n = Math.min(d.free, go * d.A * d.free / W);
        d.t.pop += n; d.free -= n; left -= n;
      }
      s.t.pop -= go - left; moved += go - left;
    }
  }
  (a.hist.moved ||= 0); a.hist.moved += moved;
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
