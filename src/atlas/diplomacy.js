// How the peoples of the world map get on (data/diplomacy.js): attitudes that move with shared land,
// trade, raids and wars; trade routes; folk of one people settling in the other's towns; wars with
// battles between their nearest towns, burnt towns left as ruins and battlefields left as barrows;
// orc raids; peace when the war has worn both out.
//
// a.rel = {'p:q': {att, war: {since, battles, razed} | null, wars, routes, met}};  a.ruins = [{...}]
// a.f.barrows — 0 … 1, the old graves of battles (the «barrows» biome share of a cell, atlas/biomes.js)
import {DIPLOMACY} from '../data/diplomacy.js';
import {WORLD_PEOPLES} from '../data/peoples.js';
import {ROADS} from '../data/roads.js';
import {RELATIONS} from '../data/relations.js';
import {SPECIES} from '../data/species.js';
import {scaleOf} from './tectonics.js';
import {townFx, might, raidShare, townLabel} from './towns.js';

const D = DIPLOMACY;

// a people's old feeling for another (data/relations.js), −3 … +2
export function feeling(p, q) {
  const a = SPECIES.get(WORLD_PEOPLES.get(p).race).rel, b = SPECIES.get(WORLD_PEOPLES.get(q).race).rel;
  return RELATIONS[a]?.[b] ?? 0;
}

const key = (p, q) => (p < q ? `${p}:${q}` : `${q}:${p}`);
const cap1 = s => s[0].toUpperCase() + s.slice(1);
const label = id => WORLD_PEOPLES.get(id).label;

export const relation = (a, p, q) => a.rel?.[key(p, q)] || null;
// the attitude between two peoples: their record, or the old memory of their races before they meet
export const attitude = (a, p, q) => (p === q ? 5 : relation(a, p, q)?.att ?? Math.min(feeling(p, q), feeling(q, p)));
export const atWar = (a, p, q) => p !== q && !!relation(a, p, q)?.war;
export function stateOf(a, p, q) {
  if (atWar(a, p, q)) return 'war';
  const v = attitude(a, p, q);
  return D.states.find(s => v >= s.from).id;
}
export const stateLabel = id => (id === 'war' ? 'война' : D.states.find(s => s.id === id).label);
// whether their towns trade and share roads
export const trades = (a, p, q) => p === q || (!atWar(a, p, q) && attitude(a, p, q) >= -1);

export function meet(a, p, q, year) {
  a.rel ||= {};
  const k = key(p, q);
  if (!a.rel[k]) a.rel[k] = {att: Math.min(feeling(p, q), feeling(q, p)), war: null, wars: 0, routes: 0, met: year};
  return a.rel[k];
}

// burn a town: it is gone, a ruin stays where it stood
function raze(a, t, by, how) {
  t.alive = false; t.died = a.hist.year;
  a.ruins ||= [];
  a.ruins.push({i: t.i, x: t.x, y: t.y, name: t.name, people: t.people, by, year: a.hist.year, how});
}

// old graves around a battlefield
function barrows(a, i, r) {
  const f = a.f, x0 = i % a.w, y0 = (i / a.w) | 0;
  f.barrows ||= new Float32Array(a.n);
  for (let y = Math.max(0, y0 - r); y <= Math.min(a.h - 1, y0 + r); y++) for (let x = Math.max(0, x0 - r); x <= Math.min(a.w - 1, x0 + r); x++) {
    const j = y * a.w + x, d = Math.hypot(x - x0, y - y0);
    if (!f.ocean[j] && d <= r) f.barrows[j] = Math.min(1, f.barrows[j] + 0.5 * (1 - d / (r + 1)));
  }
}

const fight = (t, rnd) => might(t, townFx(t)) * (0.6 + 0.8 * rnd());

// a year of the peoples' dealings; `overlap(p, q)` is the share of their land they share
export function stepDiplomacy(a, rnd, say, overlap) {
  const k = scaleOf(a), H = a.hist, towns = a.towns.filter(t => t.alive);
  // the nearest towns of two peoples, and how far apart they are
  const nearest = (p, q) => {
    let best = null, bd = Infinity;
    for (const t of towns) if (t.people === p && t.alive) for (const o of towns) if (o.people === q && o.alive) {
      const d = Math.hypot(t.x - o.x, t.y - o.y); if (d < bd) { bd = d; best = [t, o]; }
    }
    return [best, bd];
  };
  for (const [kk, r] of Object.entries(a.rel || {})) {
    const [p, q] = kk.split(':');
    const old = Math.min(feeling(p, q), feeling(q, p));
    // trade routes: road-joined towns of the two near each other
    let routes = 0;
    if (trades(a, p, q)) {
      for (const t of towns) if (t.people === p) for (const o of towns) if (o.people === q && Math.hypot(t.x - o.x, t.y - o.y) <= ROADS.reach * k &&
        a.f.road[t.i] >= ROADS.levels[0].wear && a.f.road[o.i] >= ROADS.levels[0].wear) {
        routes++;
        // folk of each settle in the other's town
        for (const [x, y] of [[t, o.people], [o, t.people]]) {
          x.folk ||= {};
          const was = x.folk[y] || 0;
          x.folk[y] = Math.min(D.mingleMax, was + D.mingle);
          if (was < 0.1 && x.folk[y] >= 0.1 && x.tier >= 1) say(`В ${townLabel(x, 3)} ${x.name} осели ${label(y)}: каждый десятый там теперь из них.`);
        }
      }
      if (routes && !r.routes) say(`Между землями ${WORLD_PEOPLES.get(p).labelGen} и ${WORLD_PEOPLES.get(q).labelGen} пошли первые караваны.`);
      r.routes = routes;
    }
    const sh = overlap(p, q), [pair, gap] = nearest(p, q), border = sh > 0 || gap <= D.front * k;
    r.att += D.drift * Math.sign(old - r.att) * Math.min(1, Math.abs(old - r.att)) - D.pressure * sh + (r.att < old + D.tradeCeil ? Math.min(D.tradeMax, D.trade * routes) : 0);
    if (r.war) {
      r.att += D.weariness;
      const years = H.year - r.war.since;
      // the front: the nearest pair of towns of the two fight it out
      const best = gap <= D.front * k ? pair : null;
      if (best) {
        const [t, o] = best, ft = fight(t, rnd), fo = fight(o, rnd), [win, lose] = ft >= fo ? [t, o] : [o, t];
        const loss = (D.battleLoss[0] + (D.battleLoss[1] - D.battleLoss[0]) * rnd()) * raidShare(townFx(lose));
        lose.pop *= 1 - loss; win.pop *= 1 - loss * 0.4; r.war.battles++;
        barrows(a, Math.round((t.y + o.y) / 2) * a.w + Math.round((t.x + o.x) / 2), D.barrows * Math.max(1, Math.round(k)));
        if (lose.pop < D.raze && lose.tier <= 1) {
          raze(a, lose, win.people, 'war'); r.war.razed++;
          say(`${cap1(label(win.people))} из ${townLabel(win, 2)} ${win.name} взяли и сожгли ${townLabel(lose, 1)} ${lose.name}: осталось пепелище.`);
        } else say(`Битва под ${townLabel(lose, 4)} ${lose.name}: ${label(win.people)} одолели ${WORLD_PEOPLES.get(lose.people).labelGen}, поле усеяно курганами.`);
      }
      if (r.att >= D.peaceAt || years >= D.longest) {
        say(`${cap1(label(p))} и ${label(q)} заключили мир после ${years} ${years % 10 === 1 && years % 100 !== 11 ? 'года' : 'лет'} войны.`);
        r.war = null; r.att = D.afterPeace;
      }
    } else if (r.att <= D.warAt && border) {
      r.war = {since: H.year, battles: 0, razed: 0}; r.wars++;
      say(`${cap1(label(p))} и ${label(q)} не поделили земли: началась война.`);
    }
    r.att = Math.max(-5, Math.min(5, r.att));
  }
  // orcs raid the nearest town of a people they do not like, a few raids a year
  const raids = {};
  for (const t of towns) {
    if (!D.raiders.includes(t.people) || !t.alive || rnd() > D.raidChance || (raids[t.people] || 0) >= D.raidsPerYear) continue;
    if (!townFx(t).defence) continue;   // only a camp with warriors goes raiding
    let target = null, bd = D.raidReach * k;
    for (const o of towns) if (o.alive && o.people !== t.people && attitude(a, t.people, o.people) < 0) {
      const d = Math.hypot(t.x - o.x, t.y - o.y); if (d < bd) { bd = d; target = o; }
    }
    if (!target) continue;
    const r = meet(a, t.people, target.people, H.year);
    r.att = Math.max(-5, r.att - D.raid); raids[t.people] = (raids[t.people] || 0) + 1;
    if (fight(t, rnd) > fight(target, rnd)) {
      const loss = D.raidLoss * raidShare(townFx(target));
      target.pop *= 1 - loss; t.pop += target.pop * loss * 0.3;
      say(`${cap1(label(t.people))} из ${townLabel(t, 2)} ${t.name} разграбили ${townLabel(target, 1)} ${target.name}.`);
    } else {
      t.pop *= 0.9;
      say(`${cap1(label(target.people))} отбили набег ${WORLD_PEOPLES.get(t.people).labelGen} на ${townLabel(target, 1)} ${target.name}.`);
    }
  }
}

export const ruinAt = (a, i) => (a.ruins || []).find(r => Math.abs(r.x - i % a.w) <= 1 && Math.abs(r.y - ((i / a.w) | 0)) <= 1) || null;
